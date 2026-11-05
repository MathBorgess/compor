#!/usr/bin/env python3
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED = {
    'fonte_ausente': 'missing_source',
    'id_duplicado': 'duplicate_id',
    'afirmacao_ausente': 'missing_claim',
    'apoio_inativo': 'inactive_claim',
    'ciclo_substituicao': 'replacement_cycle',
    'sustentado_sem_fonte': 'unsupported_state',
    'desconhecido_com_conteudo': 'schema_invalid',
    'sugestao_sem_apoio': 'schema_invalid',
    'fonte_externa_sem_referencia': 'schema_invalid',
    'versao_invalida': 'schema_invalid',
    'substituida_ativa': 'invalid_replacement',
    'substituicao_campo_diferente': 'invalid_replacement',
    'apoio_desconhecido': 'unknown_claim_support',
    'apoio_misto_com_desconhecido': 'unknown_claim_support',
    'hipotese_apoio_desconhecido': 'unknown_claim_support',
}


class ContractTests(unittest.TestCase):
    def run_fixture(self, path):
        before = path.read_bytes()
        result = subprocess.run([sys.executable, str(ROOT / 'validate.py'), str(path)], capture_output=True, text=True, timeout=15)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(result.stderr, '')
        return result.returncode, json.loads(result.stdout)

    def test_valid_examples(self):
        paths = sorted((ROOT / 'fixtures' / 'valid').glob('*.json'))
        self.assertGreaterEqual(len(paths), 3)
        for path in paths:
            with self.subTest(fixture=path.name):
                status, result = self.run_fixture(path)
                self.assertEqual((status, result), (0, {'valid': True, 'errors': []}))

    def test_invalid_examples(self):
        paths = sorted((ROOT / 'fixtures' / 'invalid').glob('*.json'))
        self.assertEqual({p.stem for p in paths}, set(EXPECTED))
        for path in paths:
            with self.subTest(fixture=path.name):
                status, result = self.run_fixture(path)
                self.assertEqual(status, 1)
                self.assertFalse(result['valid'])
                self.assertIn(EXPECTED[path.stem], result['errors'])
                self.assertNotIn('abcde', json.dumps(result))

    def test_does_not_echo_possible_credential(self):
        sample = json.loads((ROOT / 'fixtures' / 'valid' / 'informado_e_hipotese.json').read_text())
        sample['implicacoes_criativas'][0]['conteudo'] = 'sk-' + 'abcde' * 6
        with tempfile.TemporaryDirectory(prefix='compor-persona-fixture-') as directory:
            path = Path(directory) / 'synthetic.json'
            path.write_text(json.dumps(sample))
            status, result = self.run_fixture(path)
        self.assertEqual(status, 1)
        self.assertEqual(result, {'valid': False, 'errors': ['possible_key']})
        self.assertNotIn('abcde', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
