"""Verifica localmente o transporte do holdout de referências e seu replay."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import executar

DATASET = executar.read(executar.HERE / 'reserva-referencias-visuais.v1.json')


class VisualReplayTest(unittest.TestCase):
    def test_capture_and_replay_keep_selected_pngs_in_manifest_order(self):
        signed, metadata_only = DATASET['cases']
        for case, available in ((signed, 2), (metadata_only, 1)):
            with self.subTest(case=case['id']), TemporaryDirectory() as folder:
                output = Path(folder) / 'replay'
                synthetic_answer = {'briefing': 'Controle sem modelo', 'imagePrompt': None, 'caption': None}
                with patch.object(executar, 'codex', return_value=synthetic_answer) as model:
                    executar.chat_replay(case, executar.ROOT, output, DATASET['assetSha256'])
                setup = executar.read(output / 'session-request.json')
                context = json.loads(setup['input'][0]['content'][0]['text'])
                self.assertIn('Nomeie o traço utilizado e a região', setup['agent']['instructions'])
                self.assertIn('Metadados, nomes e comentários isolados', setup['agent']['instructions'])
                self.assertEqual(context['message'], case['input']['request'])
                self.assertEqual([r['name'] for r in context['context']['references']], ['Paleta', 'Recorte'])
                self.assertEqual('source' in context['context']['references'][1], available == 2)
                references = case['input']['references'][:available]
                ids = [entry['id'] for entry in context['visualInput']['entries']]
                self.assertEqual(ids, [item['id'] for item in references])
                self.assertEqual(len(setup['input'][0]['content']), 1 + 2 * available)
                model.assert_called_once()
                _, _, _, prompt, paths = model.call_args.args
                self.assertEqual(len(paths), available)
                for item, path, entry in zip(references, paths, context['visualInput']['entries'], strict=True):
                    expected_hash = DATASET['assetSha256'][item['asset']]
                    self.assertIn(f"{path.name}: Referência selecionada {item['id']}", prompt)
                    self.assertEqual(executar.digest(path), expected_hash)
                    self.assertEqual(entry['transport']['sha256'], expected_hash)

    def test_invalid_reference_hash_stops_capture_before_model(self):
        case = DATASET['cases'][0]
        hashes = dict(DATASET['assetSha256'])
        hashes[case['input']['references'][0]['asset']] = '0' * 64
        with TemporaryDirectory() as folder, patch.object(executar, 'codex') as model:
            output = Path(folder) / 'replay'
            with self.assertRaises(subprocess.CalledProcessError) as failure:
                executar.chat_replay(case, executar.ROOT, output, hashes)
            self.assertIn('Hash da referência divergente', failure.exception.stderr)
            self.assertFalse((output / 'session-request.json').exists())
            model.assert_not_called()

    def test_replay_refuses_different_order_or_provider_bytes(self):
        case = DATASET['cases'][0]
        with TemporaryDirectory() as folder:
            output = Path(folder) / 'capture'
            captured = executar.capture_session(case, executar.ROOT, output, DATASET['assetSha256'])
            changed_order = deepcopy(captured)
            content = changed_order['input'][0]['content']
            content[1:3], content[3:5] = content[3:5], content[1:3]
            with self.assertRaisesRegex(ValueError, 'Ordem ou rótulo'):
                executar.replay_media(changed_order, output)
            changed_bytes = deepcopy(captured)
            content = changed_bytes['input'][0]['content']
            content[2]['image_url'] = content[-1]['image_url']
            with self.assertRaisesRegex(ValueError, 'pixels diferentes'):
                executar.replay_media(changed_bytes, output)


if __name__ == '__main__':
    unittest.main()
