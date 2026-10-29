"""Wrapper exit status; fake child results, no native model calls."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


class FollowupsExitTests(unittest.TestCase):
    def invoke(self, codes, *, already_submitted=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copyfile(Path(__file__).with_name('run_followups.py'), root / 'run_followups.py')
            rows = []
            for order in (1, 2):
                run_id = f'synthetic-{order}'
                rows.append(dict(order=order, run_id=run_id, model='synthetic',
                                 effort='low', guidance='baseline'))
                run = root / 'runs' / run_id
                run.mkdir(parents=True)
                (run / 'resume-after-t3.json').write_text('{}')
                (run / 'manifest.json').write_text(json.dumps({'configuration': {
                    'mcp_servers.compor_benchmark.command': sys.executable}}))
            if already_submitted:
                (root / 'runs' / 'synthetic-1' / 'turn-04.json').write_text('{}')
            (root / 'schedule.json').write_text(json.dumps(rows))
            output = io.StringIO()
            with patch.object(sys, 'argv', ['run_followups.py', '--first', '1', '--last', '2']), \
                    patch('subprocess.run', side_effect=[SimpleNamespace(returncode=c) for c in codes]) as child, \
                    contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                with self.assertRaises(SystemExit) as ended:
                    runpy.run_path(str(root / 'run_followups.py'), run_name='__main__')
            return ended.exception.code, child.call_count, output.getvalue()

    def test_complete_batch_exits_zero(self):
        status, count, output = self.invoke([0] * 8)
        self.assertEqual((status, count), (0, 8))
        self.assertNotIn('stage_failed', output)

    def test_runner_failure_remains_nonzero_after_next_run_succeeds(self):
        status, count, output = self.invoke([7, 0, 0, 0, 0])
        self.assertEqual((status, count), (1, 5))
        self.assertIn('model_t4', output)
        self.assertIn('synthetic-2', output)

    def test_render_failure_remains_nonzero_after_next_run_succeeds(self):
        status, count, output = self.invoke([0, 9, 0, 0, 0, 0])
        self.assertEqual((status, count), (1, 6))
        self.assertIn('artifacts_t4', output)

    def test_existing_turn_refuses_entire_batch_before_child(self):
        status, count, _ = self.invoke([], already_submitted=True)
        self.assertEqual((status, count), (2, 0))


if __name__ == '__main__':
    unittest.main()
