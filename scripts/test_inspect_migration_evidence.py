#!/usr/bin/env python3
import copy
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('inspect_migration_evidence.py')
spec = importlib.util.spec_from_file_location('inspect_migration_evidence', SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='compor-evidence-test-')
        self.repo = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Synthetic Test')
        self.git('config', 'user.email', 'synthetic@example.invalid')
        directory = self.repo / 'supabase' / 'migrations'
        directory.mkdir(parents=True)
        self.names = ['20261103000000_first.sql', '20261103000001_second.sql']
        for name in self.names:
            (directory / name).write_text('-- fixture only\nselect 1;\n', encoding='utf-8')
        self.git('add', 'supabase')
        self.git('commit', '-qm', 'synthetic evidence')
        self.commit = self.git('rev-parse', 'HEAD').strip()
        digest = hashlib.sha256(b'-- fixture only\nselect 1;\n').hexdigest()
        self.entries = [{'version': n[:14], 'filename': n, 'source_commit': self.commit, 'sha256': digest} for n in self.names]
        self.item = {'key': 'public/table/projects/rls', 'sha256': 'a' * 64}
        self.data = {
            'format_version': 1,
            'legacy': {'status': 'available', 'total_rows': 2, 'entries': self.entries},
            'native': {'status': 'available', 'total_rows': 2, 'entries': [{'version': n[:14]} for n in self.names]},
            'catalog': {'reference': [self.item], 'observed': [self.item]},
        }

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True)

    def report(self, data):
        return tool.inspect(self.repo, self.commit, data)

    def test_identical_evidence_never_authorizes_application(self):
        report = self.report(self.data)
        self.assertFalse(report['safe_to_apply'])
        self.assertEqual(report['issues'], [])
        evidence = self.repo / 'evidence.json'
        evidence.write_text(json.dumps(self.data), encoding='utf-8')
        result = subprocess.run(['python3', str(SCRIPT), '--repo', str(self.repo), '--commit', self.commit,
                                 '--evidence', str(evidence)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 3)
        self.assertFalse(json.loads(result.stdout)['safe_to_apply'])

    def test_missing_native_ledger_is_reported_without_suggesting_repair(self):
        data = copy.deepcopy(self.data)
        data['native'] = {'status': 'absent', 'total_rows': 0, 'entries': []}
        report = self.report(data)
        self.assertTrue(any('reaplicar' in item for item in report['issues']))
        self.assertFalse(report['safe_to_apply'])

    def test_missing_legacy_and_empty_native_does_not_imply_clean_database(self):
        data = copy.deepcopy(self.data)
        data['legacy'] = {'status': 'absent', 'total_rows': 0, 'entries': []}
        data['native'] = {'status': 'available', 'total_rows': 0, 'entries': []}
        report = self.report(data)
        self.assertIn('auditoria legada ausente', ' '.join(report['issues']))
        self.assertFalse(report['safe_to_apply'])

    def test_unavailable_source_commit_remains_unverified(self):
        data = copy.deepcopy(self.data)
        data['legacy']['entries'][0]['source_commit'] = 'f' * 40
        self.assertTrue(any('origem indisponível' in item for item in self.report(data)['issues']))

    def test_hash_schema_and_unknown_native_drift_are_reported(self):
        data = copy.deepcopy(self.data)
        data['legacy']['entries'][0]['sha256'] = '0' * 64
        data['native']['entries'].append({'version': '20261201000000'})
        data['native']['total_rows'] += 1
        data['catalog']['observed'] = [{'key': self.item['key'], 'sha256': 'b' * 64}]
        issues = ' '.join(self.report(data)['issues'])
        self.assertIn('hash legado diverge', issues)
        self.assertIn('não existe no commit', issues)
        self.assertIn('catálogo capturado difere', issues)

    def test_history_gaps_are_not_assumed_correct(self):
        data = copy.deepcopy(self.data)
        for name in ('legacy', 'native'):
            data[name]['entries'] = data[name]['entries'][1:]
            data[name]['total_rows'] = 1
        self.assertIn('não é prefixo', ' '.join(self.report(data)['issues']))

    def test_rejects_filtered_duplicate_and_malformed_rows(self):
        for mutate in ('filtered', 'duplicate', 'malformed'):
            with self.subTest(mutate=mutate):
                data = copy.deepcopy(self.data)
                if mutate == 'filtered':
                    data['native']['total_rows'] = 3
                elif mutate == 'duplicate':
                    data['native']['entries'][1] = data['native']['entries'][0]
                else:
                    data['native']['entries'][0]['version'] = 'legacy'
                with self.assertRaises(tool.EvidenceError):
                    self.report(data)

    def test_unverified_capture_and_missing_catalog_fail_closed(self):
        data = copy.deepcopy(self.data)
        data['native'] = {'status': 'unverified', 'total_rows': 0, 'entries': []}
        self.assertIn('não pôde ser lido', ' '.join(self.report(data)['issues']))
        data['catalog']['reference'] = []
        with self.assertRaises(tool.EvidenceError):
            self.report(data)

    def test_duplicate_json_key_is_rejected(self):
        evidence = self.repo / 'evidence.json'
        evidence.write_text('{"format_version":1,"format_version":1}', encoding='utf-8')
        result = subprocess.run(['python3', str(SCRIPT), '--repo', str(self.repo), '--commit', self.commit,
                                 '--evidence', str(evidence)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('chave JSON duplicada', result.stderr)

    def test_git_ref_missing_or_invalid_is_rejected(self):
        with self.assertRaises(tool.EvidenceError):
            tool.inspect(self.repo, 'f' * 40, self.data)
        with self.assertRaises(tool.EvidenceError):
            tool.inspect(self.repo, 'HEAD', self.data)


if __name__ == '__main__':
    unittest.main()
