import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'scripts/stage_vercel_web.py'
PACKAGES = ('agents-api', 'agile-deliberation', 'images-api', 'private-images', 'remote-mcp')

class StageTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='compor-stage-test-')
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.root = self.base / 'source'
        self.root.mkdir()
        specs = ['apps/web/app', 'apps/web/lib', 'apps/web/public', 'apps/web/package.json',
                 'apps/web/package-lock.json', 'apps/web/next.config.mjs', 'apps/web/.npmrc',
                 'apps/web/vercel.json', 'apps/web/tsconfig.json', 'apps/web/next-env.d.ts']
        specs += [path for name in PACKAGES for path in (f'packages/{name}/package.json', f'packages/{name}/src')]
        specs += ['third_party/google-research/agile_deliberation/LICENSE', 'third_party/google-research/agile_deliberation/provenance.json']
        files = subprocess.check_output(['git', 'ls-files', '-z', '--', *specs], cwd=ROOT).split(b'\0')
        for raw in files:
            if raw:
                path = Path(raw.decode())
                target = self.root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / path, target)
        self.script = self.root / 'scripts/stage_vercel_web.py'
        self.script.parent.mkdir()
        shutil.copyfile(SCRIPT, self.script)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Compor stage test')
        self.git('config', 'user.email', 'stage-test@example.invalid')
        self.git('config', 'core.hooksPath', '/dev/null')
        self.commit = self.snapshot()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def snapshot(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'Synthetic source snapshot')
        return self.git('rev-parse', 'HEAD')

    def stage(self, output, check=True, script=None):
        return subprocess.run(['python3', str(script or self.script), self.commit, str(output)],
                              cwd=self.root, capture_output=True, text=True, check=check)

    def test_stage_is_reproducible_and_uses_only_internal_package_paths(self):
        (self.root / 'apps/web/app/untracked.tsx').write_text('not part of the selected commit')
        outputs = []
        for name in ['first', 'second']:
            path = self.base / name
            result = json.loads(self.stage(path).stdout)
            raw = (path / 'STAGE-MANIFEST.json').read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), result['manifest_sha256'])
            manifest = json.loads(raw)
            self.assertEqual(manifest['commit'], self.commit)
            self.assertEqual(manifest['generator_sha256'], hashlib.sha256(self.script.read_bytes()).hexdigest())
            for filename, digest in manifest['files'].items():
                self.assertTrue(filename.startswith('apps/web/'))
                self.assertEqual(hashlib.sha256((path / filename).read_bytes()).hexdigest(), digest)
            app = path / 'apps/web'
            package = json.loads((app / 'package.json').read_text())
            lock = json.loads((app / 'package-lock.json').read_text())
            for package_name in PACKAGES:
                dependency = f'@compor/{package_name}'
                expected = f'file:vendor/{package_name}'
                self.assertEqual(package['dependencies'][dependency], expected)
                self.assertEqual(lock['packages']['']['dependencies'][dependency], expected)
                self.assertEqual(lock['packages'][f'node_modules/{dependency}']['resolved'], expected)
                vendor_path = app / f'vendor/{package_name}'
                vendor = json.loads((vendor_path / 'package.json').read_text())
                for dependency, value in vendor.get('dependencies', {}).items():
                    if value.startswith('file:'):
                        target = (vendor_path / value.removeprefix('file:')).resolve()
                        self.assertTrue(target.is_relative_to(app.resolve()))
                        self.assertEqual(json.loads((target / 'package.json').read_text())['name'], dependency)
                        self.assertEqual(lock['packages'][f'node_modules/@compor/{package_name}']['dependencies'][dependency], value)
            for filename in ['tsconfig.json', 'next-env.d.ts', '.npmrc']:
                self.assertEqual((app / filename).read_bytes(), (self.root / 'apps/web' / filename).read_bytes())
            for package_name in ('agents-api', 'remote-mcp'):
                self.assertEqual(lock['packages'][f'node_modules/@compor/{package_name}']['dependencies']['@compor/agile-deliberation'], 'file:../agile-deliberation')
            for original, staged in [('LICENSE', 'LICENSE'), ('provenance.json', 'UPSTREAM-PROVENANCE.json')]:
                self.assertEqual((app / 'vendor/agile-deliberation' / staged).read_bytes(), (self.root / 'third_party/google-research/agile_deliberation' / original).read_bytes())
            self.assertTrue((app / 'vendor/agile-deliberation/src/methodology.js').is_file())
            self.assertTrue((app / 'vendor/agile-deliberation/src/methodology.d.ts').is_file())
            self.assertFalse((path / 'packages').exists())
            self.assertFalse((app / '.next').exists())
            self.assertFalse((app / 'node_modules').exists())
            self.assertFalse((app / 'app/untracked.tsx').exists())
            outputs.append(result['manifest_sha256'])
        self.assertEqual(outputs[0], outputs[1])

    def test_stage_contains_the_server_runtime_without_the_stdio_prototype(self):
        output = self.base / 'phoenix-bundle'
        self.stage(output)
        app = output / 'apps/web'
        for filename in ['phoenix-worker.ts', 'studio-decision-route.ts', 'studio-decision-contract.ts',
                         'phoenix/catalog.ts', 'phoenix/deterministic.ts', 'phoenix/formulas.ts',
                         'phoenix/hyperparams.ts', 'phoenix/models.ts', 'phoenix/source-manifest.json', 'phoenix/PROVENANCE.md']:
            self.assertEqual((app / 'lib' / filename).read_bytes(), (self.root / 'apps/web/lib' / filename).read_bytes())
        self.assertTrue((app / 'app/api/studio/decision/route.ts').is_file())
        self.assertFalse((output / 'prototypes').exists())
        self.assertEqual(json.loads((app / 'package.json').read_text())['scripts']['build'], 'next build')

    def test_rejects_missing_phoenix_dependency_before_creating_bundle(self):
        (self.root / 'apps/web/lib/phoenix/deterministic.ts').unlink()
        self.commit = self.snapshot()
        output = self.base / 'bundle'
        run = self.stage(output, check=False)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('missing required source files', run.stderr)
        self.assertFalse(output.exists())

    def test_rejects_existing_or_non_absolute_destination(self):
        for output in [self.base, 'relative-output']:
            run = self.stage(output, check=False)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn('absolute, nonexistent', run.stderr)

    def test_rejects_generator_modified_from_selected_commit(self):
        altered = self.base / 'altered.py'
        altered.write_bytes(self.script.read_bytes() + b'\n# uncommitted change\n')
        output = self.base / 'bundle'
        run = self.stage(output, check=False, script=altered)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('generator differs', run.stderr)
        self.assertFalse(output.exists())

    def test_rejects_transitive_file_dependency_outside_vendor(self):
        path = self.root / 'packages/agents-api/package.json'
        package = json.loads(path.read_text())
        package['dependencies']['@compor/agile-deliberation'] = 'file:../../../outside'
        path.write_text(json.dumps(package))
        self.commit = self.snapshot()
        run = self.stage(self.base / 'bundle', check=False)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('outside the staged package graph', run.stderr)

    def test_requires_typescript_configuration_in_immutable_source(self):
        (self.root / 'apps/web/tsconfig.json').unlink()
        self.commit = self.snapshot()
        output = self.base / 'bundle'
        run = self.stage(output, check=False)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('missing required source files', run.stderr)
        self.assertFalse(output.exists())

    def test_requires_license_for_derived_source(self):
        (self.root / 'third_party/google-research/agile_deliberation/LICENSE').unlink()
        self.commit = self.snapshot()
        output = self.base / 'bundle'
        run = self.stage(output, check=False)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('missing required source files', run.stderr)
        self.assertFalse(output.exists())

if __name__ == '__main__':
    unittest.main()
