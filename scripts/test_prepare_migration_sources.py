import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HISTORICAL_COMMITS = (
    '1feceb7531d80cee9a9547d198c1ff218779a700',
    '8c28f98af059463ccdfd8d4a46adcb859ea112fd',
    '4cc8f9ebe372f5f2ea028c6ff480998778ee99c1',
    '237b1dde1159408a430bd447e7000a4ef176f28a',
    'ea0424907af132243ce040d0edfd8f47b8304955',
    '2375eab3f390a5343a32abf78ab1df01736e0f3a',
)
REVIEWED_OUTPUTS = {
    'image.prepare': '6d554ba336473d1f7990c5036ebc26e9a22ae0042225e4e3572ad202f820a705',
    'recovery.prepare': '983fa9666dcc3e22ab55b205702e7ddcae888dfec5e0778fb740650a0379ed47',
    'studio.prepare': 'd41efb00648082e6303127f4583388433c9d6d786992fe373707531a26012f08',
    'studio.prepare_proof': '255f27767f57c38eb230cab820937d30246c6776eb43a1793c6b8b41316fa8fc',
    'usage.prepare': '11029e55dc7ceb62704cfa6972ed8d30c158d8c0d851a83db9bd8b809e33505c',
    'usage.prepare_proof': '940527cd64bb9a6bf6f2987e5e72df5dc570545f619136aaef1489e07f67bac5',
    'calls.prepare': 'fe7834d90ae8384823afe1d296f13b5934a52812dbc7487cf77c6f1b8b4082a4',
    'calls.prepare_proof': 'bfbdc0b91713b30410fcaa09b1dbc8d42f84899362679cd515f6f65aa9e13200',
}


class MigrationSourceTest(unittest.TestCase):
    def test_clean_checkout_preserves_reviewed_sql_without_local_source_commits(self):
        with tempfile.TemporaryDirectory(prefix='compor-migration-source-test-') as temporary:
            root = Path(temporary)
            bundle = root / 'head.bundle'
            checkout = root / 'checkout'
            subprocess.run(['git', 'bundle', 'create', str(bundle), 'HEAD'], cwd=ROOT, check=True, capture_output=True)
            subprocess.run(['git', 'init', '--quiet', str(checkout)], check=True, capture_output=True)
            subprocess.run(['git', 'fetch', '--quiet', str(bundle), 'HEAD'], cwd=checkout, check=True, capture_output=True)
            subprocess.run(['git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], cwd=checkout, check=True, capture_output=True)
            self.assertFalse((checkout / '.git/objects/info/alternates').exists())
            for commit in HISTORICAL_COMMITS:
                with self.subTest(commit=commit):
                    result = subprocess.run(['git', 'cat-file', '-e', f'{commit}^{{commit}}'], cwd=checkout, capture_output=True)
                    self.assertNotEqual(result.returncode, 0, 'fixture must exclude the unpublished historical commit')
            for source in (ROOT / 'scripts').glob('prepare_*.py'):
                shutil.copy2(source, checkout / 'scripts' / source.name)
            result = subprocess.run([sys.executable, '-B', '-c', '''
import hashlib, json, sys
sys.path.insert(0, 'scripts')
import prepare_image_26_migration as image
import prepare_recovery_migration as recovery
import prepare_studio_migrations as studio
import prepare_usage_model_v3_migration as usage
import prepare_provider_call_ids_migration as calls
outputs = {}
for name, module in [('image', image), ('recovery', recovery), ('studio', studio), ('usage', usage), ('calls', calls)]:
    for method in ('prepare', 'prepare_proof'):
        if hasattr(module, method):
            outputs[f'{name}.{method}'] = hashlib.sha256(getattr(module, method)()).hexdigest()
print(json.dumps(outputs))
'''], cwd=checkout, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), REVIEWED_OUTPUTS)


if __name__ == '__main__':
    unittest.main()
