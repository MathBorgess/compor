import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREPARE = ROOT / 'scripts/prepare_compor_migrations.py'
APPLY = ROOT / 'scripts/apply_compor_migrations_test_project.sh'
REVIEWED_ELEVEN_MIGRATION_COMMIT = '35925f0b130fb4ed0123d2b460cc42ffe2698c2f'

class ApplyPreparationTest(unittest.TestCase):
    def test_exact_source_and_modified_bundle(self):
        prepared = json.loads(subprocess.check_output(['python3', str(PREPARE), REVIEWED_ELEVEN_MIGRATION_COMMIT], cwd=ROOT, text=True))
        path = Path(prepared['path'])
        try:
            self.assertEqual(prepared['migrations'], 11)
            subprocess.run(['python3', str(PREPARE), '--verify', REVIEWED_ELEVEN_MIGRATION_COMMIT, str(path)], cwd=ROOT, check=True, capture_output=True)
            path.write_bytes(path.read_bytes() + b'-- modified\n')
            self.assertNotEqual(subprocess.run(['python3', str(PREPARE), '--verify', REVIEWED_ELEVEN_MIGRATION_COMMIT, str(path)], cwd=ROOT, capture_output=True).returncode, 0)
            self.assertNotEqual(subprocess.run(['python3', str(PREPARE), 'HEAD'], cwd=ROOT, capture_output=True).returncode, 0)
        finally:
            path.unlink(missing_ok=True)
            path.parent.rmdir()

    def test_wrapper_pins_tls_target_and_rejects_tampering(self):
        prepared = json.loads(subprocess.check_output(['python3', str(PREPARE), REVIEWED_ELEVEN_MIGRATION_COMMIT], cwd=ROOT, text=True))
        path = Path(prepared['path'])
        try:
            with tempfile.TemporaryDirectory(prefix='compor-apply-wrapper-test-') as tmp:
                tmpdir = Path(tmp); args = tmpdir / 'args'; environment = tmpdir / 'env'; ca = tmpdir / 'ca.crt'; ca.write_text('synthetic')
                fingerprint = 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'
                openssl = tmpdir / 'openssl'; openssl.write_text('#!/bin/sh\nprintf "%s\\n" "' + fingerprint + '"\n'); openssl.chmod(0o700)
                psql = tmpdir / 'psql'; psql.write_text(f'#!/bin/sh\nprintf "%s\\n" "$@" > "{args}"\nenv > "{environment}"\n'); psql.chmod(0o700)
                env = {**os.environ, 'PATH': f'{tmpdir}:' + os.environ['PATH'], 'PGHOST': 'attacker.invalid', 'PGOPTIONS': '-c ssl=off', 'TMPDIR': str(tmpdir)}
                cmd = ['sh', str(APPLY), REVIEWED_ELEVEN_MIGRATION_COMMIT, str(path), str(ca)]
                subprocess.run(cmd, cwd=ROOT, env=env, check=True, capture_output=True)
                argv = args.read_text().splitlines(); actual_env = dict(line.split('=',1) for line in environment.read_text().splitlines())
                self.assertIn('db.dpboawdnuxuzjoufpiry.supabase.co', argv)
                self.assertIn('-W', argv); self.assertIn('ON_ERROR_STOP=1', argv)
                self.assertEqual(actual_env['PGSSLMODE'], 'verify-full'); self.assertEqual(actual_env['PGGSSENCMODE'], 'disable')
                self.assertNotIn('PGHOST', actual_env); self.assertNotIn('PGOPTIONS', actual_env)
                args.unlink(); path.write_bytes(path.read_bytes() + b'-- modified\n')
                self.assertNotEqual(subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True).returncode, 0)
                self.assertFalse(args.exists())
        finally:
            path.unlink(missing_ok=True)
            path.parent.rmdir()

if __name__ == '__main__':
    unittest.main()
