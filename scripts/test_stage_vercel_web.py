import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts/stage_vercel_web.py'
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()

class StageTest(unittest.TestCase):
    def test_stage_is_reproducible_and_uses_only_internal_package_paths(self):
        with tempfile.TemporaryDirectory(prefix='compor-stage-test-') as directory:
            outputs = []
            for name in ['first', 'second']:
                path = Path(directory) / name
                run = subprocess.run(['python3', str(SCRIPT), COMMIT, str(path)], cwd=ROOT, capture_output=True, text=True, check=True)
                result = json.loads(run.stdout)
                raw = (path / 'STAGE-MANIFEST.json').read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), result['manifest_sha256'])
                manifest = json.loads(raw)
                self.assertEqual(manifest['commit'], COMMIT)
                for name, digest in manifest['files'].items():
                    self.assertTrue(name.startswith('apps/web/'))
                    self.assertEqual(hashlib.sha256((path / name).read_bytes()).hexdigest(), digest)
                package = json.loads((path / 'apps/web/package.json').read_text())
                lock = json.loads((path / 'apps/web/package-lock.json').read_text())
                for name in ('agents-api', 'images-api', 'private-images', 'remote-mcp'):
                    dependency = f'@compor/{name}'
                    self.assertEqual(package['dependencies'][dependency], f'file:vendor/{name}')
                    self.assertEqual(lock['packages'][f'node_modules/{dependency}']['resolved'], f'file:vendor/{name}')
                    self.assertTrue((path / f'apps/web/vendor/{name}/package.json').is_file())
                self.assertFalse((path / 'packages').exists())
                outputs.append(result['manifest_sha256'])
            self.assertEqual(outputs[0], outputs[1])

    def test_rejects_existing_or_non_absolute_destination(self):
        with tempfile.TemporaryDirectory(prefix='compor-stage-test-') as directory:
            for output in [directory, 'relative-output']:
                run = subprocess.run(['python3', str(SCRIPT), COMMIT, output], cwd=ROOT, capture_output=True, text=True)
                self.assertNotEqual(run.returncode, 0)

if __name__ == '__main__':
    unittest.main()
