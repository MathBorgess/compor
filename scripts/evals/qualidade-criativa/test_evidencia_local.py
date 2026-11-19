"""Controles offline para escopo de aprovação, autorrelato e saída privada do CLI."""
import argparse
import contextlib
from copy import deepcopy
import io
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from PIL import Image

import executar

verify_reference = runpy.run_path(str(executar.HERE / 'verificar-referencia.py'))['verify']
summarize_reactions = runpy.run_path(str(executar.HERE / 'resumir-reacoes.py'))['summarize']


def make_file(root, name, data):
    path = root / name
    path.write_text(data, encoding='utf-8')
    return {'path': name, 'sha256': executar.digest(path)}


def fixture_reference(root):
    record = {
        'version': 'sintetica-1',
        'status': 'referencia-visual-aprovada',
        'approval': {'scope': 'imagem', 'source': 'fixture', 'date': '2026-11-18', 'literal': 'Gostei da imagem'},
        'human': {'excitement': None, 'specificity': None},
    }
    for role in ('briefing', 'caption', 'prompt'):
        record[role] = make_file(root, role + '.txt', 'Texto puramente sintético')
    record['references'] = make_file(root, 'fontes.json', '{"orientation":[]}')
    record['images'] = {}
    for role, width in (('original', 720), ('feed', 360)):
        path = root / (role + '.png')
        Image.new('RGB', (width, width), 'red').save(path)
        record['images'][role] = {'path': path.name, 'sha256': executar.digest(path), 'dimensions': [width, width]}
    return record


class EvidenceTest(unittest.TestCase):
    def test_approval_does_not_fill_human_answers_and_can_coexist_with_low_ratings(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            record = fixture_reference(root)
            for ratings, favorable in [((None, None), None), ((4, None), None), ((4, 3), False), ((4, 5), True)]:
                with self.subTest(ratings=ratings):
                    record['human'] = dict(zip(('excitement', 'specificity'), ratings))
                    path = root / 'reference.json'
                    path.write_text(json.dumps(record), encoding='utf-8')
                    report = verify_reference(path)
                    self.assertTrue(report['visualApproved'])
                    self.assertEqual((report['excitement'], report['specificity']), ratings)
                    self.assertIs(report['favorable'], favorable)

    def test_invalid_rating_scope_and_image_tampering_fail(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            record = fixture_reference(root)
            cases = [
                (('human', 'excitement', True), 'Notas autorrelatadas'),
                (('approval', 'scope', 'post'), 'aprovação da imagem'),
                (('approval', 'literal', ''), 'aprovação da imagem'),
                (('images', 'original', dict(record['images']['original'], sha256='0' * 64)), 'Arquivo alterado'),
            ]
            for (section, field, value), error in cases:
                with self.subTest(section=section, field=field):
                    changed = deepcopy(record)
                    changed[section][field] = value
                    path = root / 'reference.json'
                    path.write_text(json.dumps(changed), encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, error):
                        verify_reference(path)

    def test_feed_must_show_same_pixels_as_original_even_if_its_own_hash_matches(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            record = fixture_reference(root)
            feed = root / record['images']['feed']['path']
            Image.new('RGB', (360, 360), 'blue').save(feed)
            record['images']['feed']['sha256'] = executar.digest(feed)
            path = root / 'reference.json'
            path.write_text(json.dumps(record), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'prévia deve corresponder aos pixels'):
                verify_reference(path)

    def test_approval_and_judge_scores_do_not_fill_reaction_denominators(self):
        row = {'pair': 'piloto', 'arm': 'candidata', 'version': 'v1', 'shown': True,
               'excitement': None, 'specificity': 5, 'visualApproved': True, 'judgeScore': 4}
        result = summarize_reactions([row])
        self.assertEqual(result['completePairs'], 0)
        self.assertEqual(result['arms']['candidata']['specificity']['answered'], 1)
        self.assertEqual(result['arms']['candidata']['excitement']['answered'], 0)
        self.assertEqual(result['arms']['candidata']['complete'], 0)
        self.assertIsNone(result['arms']['candidata']['rate'])

    def test_cli_rejects_private_before_authentication_without_explicit_opt_in(self):
        dataset = {'version': 1, 'cases': [{'provenance': {'kind': 'creator-approved-case'}}]}
        with TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'dataset.json'
            path.write_text(json.dumps(dataset), encoding='utf-8')
            argv = ['executar.py', '--dataset', str(path), 'controls', str(root / 'saida')]
            with (patch('sys.argv', argv), patch.object(executar.subprocess, 'run') as remote,
                  contextlib.redirect_stderr(io.StringIO()) as errors):
                with self.assertRaises(SystemExit) as exit_exception:
                    executar.main()
                self.assertEqual(exit_exception.exception.code, 2)
                self.assertIn('auditar-caso-real.py', errors.getvalue())
                remote.assert_not_called()
                self.assertFalse((root / 'saida').exists())

    def test_explicit_private_opt_in_continues_at_same_authenticated_command(self):
        dataset = {'version': 1, 'privacy': 'fixture', 'cases': [{'provenance': {'kind': 'synthetic'}}]}
        with TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'dataset.json'
            path.write_text(json.dumps(dataset), encoding='utf-8')
            argv = ['executar.py', '--dataset', str(path), '--autorizar-envio-privado-ao-codex',
                    'controls', str(root / 'saida')]
            logged_in = argparse.Namespace(returncode=0, stdout='Logged in using ChatGPT', stderr='')
            with (patch('sys.argv', argv), patch.object(executar.subprocess, 'run', return_value=logged_in) as auth,
                  patch.object(executar, 'launch_controls') as controls):
                executar.main()
                self.assertEqual(auth.call_args.args[0], ['codex', 'login', 'status'])
                self.assertEqual(controls.call_args.args[1], dataset)


class CodexIsolationTest(unittest.TestCase):
    def test_runner_disables_tools_and_stages_only_explicit_inputs(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            image = root / 'peca.png'
            image.write_bytes(b'synthetic image bytes')
            private = root / 'private-context.txt'
            private.write_text('not supplied', encoding='utf-8')
            evidence = root / 'evidence'
            schema = {'type': 'object'}

            def invoke(argv, *, cwd, input, env, **_options):
                self.assertFalse(cwd.is_relative_to(root))
                self.assertEqual({path.name for path in cwd.iterdir()}, {'peca.png', 'output-schema.json'})
                self.assertEqual((cwd / image.name).read_bytes(), image.read_bytes())
                self.assertEqual(input, 'synthetic prompt')
                self.assertIn('project_doc_max_bytes=0', argv)
                self.assertNotIn('COMPOR_IMAGE_REVIEW_OPENAI_API_KEY', env)
                disabled = {argv[i+1] for i, arg in enumerate(argv) if arg == '--disable'}
                self.assertTrue({'shell_tool', 'apps', 'plugins', 'multi_agent', 'hooks'}.issubset(disabled))
                (cwd / 'answer.json').write_text('{}', encoding='utf-8')
                events = [{'type': 'thread.started', 'thread_id': 'fixture'},
                          {'type': 'turn.completed', 'usage': {}}]
                return argparse.Namespace(stdout='\n'.join(map(json.dumps, events)), stderr='', check_returncode=lambda: None)

            with patch.object(executar.subprocess, 'run', side_effect=invoke):
                self.assertEqual(executar.codex(evidence, 'fixture-model', 'low', 'synthetic prompt', [image], schema), {})
            self.assertEqual(executar.read(evidence / 'receipt.json')['tools'], 0)


if __name__ == '__main__':
    unittest.main()
