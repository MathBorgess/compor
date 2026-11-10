import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_vercel_web', Path(__file__).with_name('release_vercel_web.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='compor-release-test-')
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.stage = self.base / 'stage'
        (self.stage / 'apps/web').mkdir(parents=True)
        (self.stage / 'apps/web/source.ts').write_text('synthetic source')
        self.sha = 'a' * 40
        self.deployment_id = 'dpl_synthetic123'
        self.host = 'compor-synthetic.vercel.app'
        self.log = self.base / 'cli-log'
        (self.stage / 'STAGE-MANIFEST.json').write_text(json.dumps({
            'commit': self.sha,
            'files': {'apps/web/source.ts': hashlib.sha256(b'synthetic source').hexdigest()},
        }))
        self.cli = self.base / 'vercel'
        self.cli.write_text('''#!/usr/bin/env python3
import json,os,sys
assert os.environ['VERCEL_TOKEN']=='synthetic-vercel-secret'
assert 'GH_TOKEN' not in os.environ and 'GITHUB_TOKEN' not in os.environ
assert not any('synthetic-vercel-secret' in arg for arg in sys.argv)
with open(os.environ['FAKE_LOG'],'a') as stream:stream.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1]=='deploy':
 if os.environ.get('FAIL_DEPLOY'):sys.exit(1)
 print(json.dumps({'status':'ok','deployment':{'id':'dpl_synthetic123','url':'https://compor-synthetic.vercel.app','readyState':'READY','target':'production'}}))
else:
 assert sys.argv[1:3]==['promote','dpl_synthetic123']
 print(json.dumps({'status':'ok','outcome':os.environ.get('PROMOTION_OUTCOME','promoted'),'deployment':{'id':'dpl_synthetic123','projectId':'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS'}}))
''')
        self.cli.chmod(0o755)
        self.env = patch.dict(os.environ, {
            'GITHUB_SHA': self.sha, 'GITHUB_REF': 'refs/heads/main', 'GITHUB_REPOSITORY': release.REPOSITORY,
            'GH_TOKEN': 'synthetic-github-secret', 'VERCEL_TOKEN': 'synthetic-vercel-secret',
            'VERCEL_ORG_ID': release.TEAM, 'VERCEL_PROJECT_ID': release.PROJECT, 'FAKE_LOG': str(self.log),
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        # /usr/bin/env python3 in the fake CLI requires only the system executable.
        os.environ['PATH'] = '/usr/local/bin:/usr/bin:/bin'
        self.main_reads = 0
        self.stale_after_build = False
        self.stale_initial = False
        self.bad_smoke = False
        self.wrong_project = False
        self.remote_override = {}
        self.requests = []

    def read(self, url, token=None):
        self.requests.append(url)
        if url.startswith('https://api.github.com/'):
            self.assertEqual(token, 'synthetic-github-secret')
            self.main_reads += 1
            stale = self.stale_initial or (self.stale_after_build and self.main_reads > 1)
            return json.dumps({'object': {'sha': 'b' * 40 if stale else self.sha}}).encode()
        if url.startswith('https://api.vercel.com/'):
            self.assertEqual(token, 'synthetic-vercel-secret')
            return json.dumps({'id': self.deployment_id, 'url': self.host, 'projectId': 'wrong' if self.wrong_project else release.PROJECT,
                               'target': 'production', 'readyState': 'READY', 'meta': {'comporSourceCommit': self.sha}, **self.remote_override}).encode()
        self.assertIsNone(token, 'smoke público não recebe credenciais')
        return b'unavailable' if self.bad_smoke else (b'<svg></svg>' if url.endswith('.svg') else b'<html>Compor</html>')

    def run_release(self):
        output = io.StringIO()
        with patch.object(release, 'read_url', side_effect=self.read), contextlib.redirect_stdout(output):
            result = release.release(str(self.cli), self.stage)
        self.assertNotIn('synthetic-vercel-secret', output.getvalue())
        self.assertNotIn('synthetic-github-secret', output.getvalue())
        return result

    def commands(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_release_waits_for_build_and_checks_source_before_activating_same_deployment(self):
        result = self.run_release()
        self.assertTrue(result['activated'])
        self.assertEqual(result['commit'], self.sha)
        calls = self.commands()
        self.assertEqual([call[0] for call in calls], ['deploy', 'promote'])
        self.assertIn('--prod', calls[0])
        self.assertIn('--skip-domain', calls[0])
        self.assertNotIn('--no-wait', calls[0])
        self.assertIn(f'comporSourceCommit={self.sha}', calls[0])
        self.assertEqual(calls[1][1], self.deployment_id)
        self.assertEqual(self.main_reads, 2)
        self.assertEqual(json.loads((self.stage / '.vercel/project.json').read_text()), {'orgId': release.TEAM, 'projectId': release.PROJECT})

    def test_missing_credentials_stops_before_any_network_or_cli(self):
        del os.environ['VERCEL_TOKEN']
        with self.assertRaisesRegex(release.ReleaseError, 'VERCEL_TOKEN'):
            self.run_release()
        self.assertEqual(self.commands(), [])
        self.assertEqual(self.requests, [])

    def test_unexpected_project_is_rejected_before_deploy(self):
        os.environ['VERCEL_PROJECT_ID'] = 'prj_other'
        with self.assertRaisesRegex(release.ReleaseError, 'destino'):
            self.run_release()
        self.assertEqual(self.commands(), [])

    def test_initial_stale_main_never_creates_a_deployment(self):
        self.stale_initial = True
        with self.assertRaisesRegex(release.ReleaseError, 'main mudou'):
            self.run_release()
        self.assertEqual(self.commands(), [])

    def test_main_change_during_build_prevents_activation(self):
        self.stale_after_build = True
        with self.assertRaisesRegex(release.ReleaseError, 'main mudou'):
            self.run_release()
        self.assertEqual([call[0] for call in self.commands()], ['deploy'])

    def test_failed_build_never_calls_promote(self):
        os.environ['FAIL_DEPLOY'] = '1'
        with self.assertRaisesRegex(release.ReleaseError, 'recusou'):
            self.run_release()
        self.assertEqual([call[0] for call in self.commands()], ['deploy'])

    def test_failed_public_smoke_never_calls_promote(self):
        self.bad_smoke = True
        with self.assertRaisesRegex(release.ReleaseError, 'Entrada pública'):
            self.run_release()
        self.assertEqual([call[0] for call in self.commands()], ['deploy'])

    def test_foreign_deployment_metadata_prevents_promotion(self):
        self.wrong_project = True
        with self.assertRaisesRegex(release.ReleaseError, 'não corresponde'):
            self.run_release()
        self.assertEqual([call[0] for call in self.commands()], ['deploy'])

    def test_queued_promotion_is_not_reported_as_active(self):
        os.environ['PROMOTION_OUTCOME'] = 'accepted'
        with self.assertRaisesRegex(release.ReleaseError, 'Ativação não confirmada'):
            self.run_release()

    def test_wrong_source_or_preview_response_never_gets_promoted(self):
        for value in [{'meta': None}, {'meta': {'comporSourceCommit': 'b' * 40}}, {'target': 'preview'}, {'readyState': 'ERROR'}]:
            with self.subTest(response=value):
                self.remote_override = value
                if self.log.exists():
                    self.log.unlink()
                with self.assertRaises(release.ReleaseError):
                    self.run_release()
                self.assertEqual([call[0] for call in self.commands()], ['deploy'])

    def test_untrusted_deployment_urls_are_rejected(self):
        for value in ['https://evil.example', 'https://user:pass@compor.vercel.app', 'https://compor.vercel.app/path',
                      'https://compor.vercel.app?secret=value', 'https://[invalid.vercel.app', None]:
            with self.subTest(url=value), self.assertRaises(release.ReleaseError):
                release.deployment_url(value)

    def test_altered_source_never_reaches_the_cli(self):
        (self.stage / 'apps/web/source.ts').write_text('changed after staging')
        with self.assertRaisesRegex(release.ReleaseError, 'difere'):
            self.run_release()
        self.assertEqual(self.commands(), [])


if __name__ == '__main__':
    unittest.main()
