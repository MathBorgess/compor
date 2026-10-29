#!/usr/bin/env python3
"""No model calls: verify isolation options, accounting and pause/resume control."""
import argparse
import contextlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import runner


class ContractTests(unittest.TestCase):
    def test_case_requires_synthetic_and_rejects_judge_fields(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'case.json'
            for case in [
                {'id': 'a', 'turns': [{'prompt': 'hello'}]},
                {'id': 'a', 'synthetic': True, 'turns': [{'prompt': 'hi', 'expected': 'secret'}]},
                {'id': 'a', 'synthetic': True, 'turns': [{'prompt': 'hi'}], 'judge': {}},
            ]:
                path.write_text(json.dumps(case))
                with self.assertRaises(ValueError):
                    runner.parse_case(path)

    def test_options_isolate_every_invocation_without_changing_codex_home(self):
        args = argparse.Namespace(model='gpt-6.1-sol', effort='low', guidance='guided_v1')
        options, config = runner.cli_options(args, '/bin/node', Path('/bridge'), Path('/entry'), Path('/run'))
        self.assertIn('--ignore-user-config', options)
        self.assertIn('--ignore-rules', options)
        self.assertNotIn('--ephemeral', options)
        self.assertEqual(config['sandbox_mode'], 'read-only')
        self.assertEqual(config['web_search'], 'disabled')
        self.assertFalse(config['skills.include_instructions'])
        self.assertEqual(set(config['mcp_servers.compor_benchmark.enabled_tools']), runner.TOOLS)
        self.assertEqual([key for key in config if key.startswith('mcp_servers.') and key.endswith('.command')],
                         ['mcp_servers.compor_benchmark.command'])

    def test_usage_uses_delta_without_double_counting_thread_totals(self):
        before = {'token_count_latest': {'total_token_usage': {'input_tokens': 100, 'output_tokens': 15}}}
        after = {'token_count_latest': {'total_token_usage': {'input_tokens': 260, 'output_tokens': 30}}}
        delta = runner.usage_delta(after, before)
        self.assertEqual(delta['input_tokens'], 160)
        self.assertEqual(delta['output_tokens'], 15)
        self.assertIsNone(delta['reasoning_output_tokens'])
        self.assertIsNone(runner.usage_delta(before, after)['input_tokens'])

    def test_unexpected_tools_are_recorded(self):
        events = [{'type': 'item.completed', 'item': {'type': 'mcp_tool_call', 'server': 'personal', 'tool': 'read'}},
                  {'type': 'item.completed', 'item': {'type': 'command_execution'}}]
        self.assertEqual(len(runner.tool_observations(events)['unexpected_tool_uses']), 2)

    def test_own_rollout_matches_only_returned_uuid(self):
        with tempfile.TemporaryDirectory() as temp:
            session = Path(temp) / 'sessions' / '2026' / '01'
            session.mkdir(parents=True)
            thread = '00000000-0000-0000-0000-000000000123'
            expected = session / f'rollout-{thread}.jsonl'
            expected.write_text('{}\n')
            (session / 'rollout-unrelated.jsonl').write_text('not JSON; must not read')
            self.assertEqual(runner.own_rollout(thread, {'CODEX_HOME': temp, 'HOME': temp}), expected)
            with self.assertRaises(RuntimeError):
                runner.own_rollout('../../auth', {'CODEX_HOME': temp, 'HOME': temp})

    def test_owned_process_is_stopped_on_timeout(self):
        result = runner.execute([sys.executable, '-c', 'import time;time.sleep(10)'], '',
                                Path(tempfile.gettempdir()), runner.subprocess_env(), 0.05)
        self.assertTrue(result['timed_out'])
        self.assertTrue(result['owned_process_exited'])

    def test_transport_catalog_must_be_exactly_six(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'mcp.jsonl'
            messages = [
                {'process_id': 1, 'direction': 'client_to_server', 'message': {'id': 1, 'method': 'tools/list'}},
                {'process_id': 1, 'direction': 'server_to_client', 'message': {'id': 1, 'result': {'tools': [{'name': 'unexpected'}]}}},
            ]
            path.write_text('\n'.join(json.dumps(x) for x in messages))
            with self.assertRaises(RuntimeError):
                runner.transport_evidence(path)

    def test_pause_resume_sends_only_new_turn_and_freezes_previous_prompt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            prototype = root / 'prototype'
            runtime = prototype / 'evals' / 'model-efficiency' / 'runtime'
            runtime.mkdir(parents=True)
            for file in ('runner.py', 'stdio_bridge.py'):
                (runtime / file).write_text('fixture-runtime')
            for name in ('dist', 'skills', 'node_modules'):
                (prototype / name).mkdir()
                (prototype / name / ('stdio.js' if name == 'dist' else 'fixture.txt')).write_text('fixture')
            for name in ('package.json', 'package-lock.json'):
                (prototype / name).write_text('{}')
            case = root / 'case.json'
            data = {'id': 'synthetic', 'synthetic': True,
                    'turns': [{'prompt': 'first synthetic turn'}, {'prompt': 'second synthetic turn'}]}
            case.write_text(json.dumps(data))
            args = argparse.Namespace(model='gpt-6.1-sol', effort='low', guidance='baseline',
                    case_json=case, run_dir=root / 'run', codex='codex', timeout=1,
                    through_turn=1, resume_run=False)
            sent = []
            thread = '00000000-0000-0000-0000-000000000123'

            def fake_execute(command, prompt, cwd, env, timeout):
                sent.append((command, prompt, str(cwd)))
                return {'stdout': '\n'.join(json.dumps(x) for x in [
                    {'type': 'thread.started', 'thread_id': thread},
                    {'type': 'turn.completed', 'usage': {'input_tokens': 10, 'output_tokens': 1}}]),
                    'stderr': '', 'exit_code': 0, 'timed_out': False,
                    'wall_clock_ms': 1, 'owned_process_exited': True}

            def fake_evidence(path, cwd):
                return {'turn_contexts': [{'model': args.model, 'effort': args.effort}],
                        'isolation_markers': {}, 'token_count_latest': {
                            'total_token_usage': {'input_tokens': 10 * len(sent), 'output_tokens': len(sent)}}}

            with contextlib.ExitStack() as stack:
                stack.enter_context(patch.object(runner.platform, 'platform', return_value='fixture-platform'))
                stack.enter_context(patch.object(runner, '__file__', str(runtime / 'runner.py')))
                stack.enter_context(patch.object(runner.shutil, 'which', return_value='/bin/fixture'))
                stack.enter_context(patch.object(runner.subprocess, 'run', return_value=argparse.Namespace(stdout='codex fixture')))
                stack.enter_context(patch.object(runner, 'execute', side_effect=fake_execute))
                stack.enter_context(patch.object(runner, 'own_rollout', return_value=root / 'own.jsonl'))
                stack.enter_context(patch.object(runner, 'rollout_evidence', side_effect=fake_evidence))
                stack.enter_context(patch.object(runner, 'transport_evidence', return_value={'calls': []}))
                first = runner.run(args)
                self.assertEqual(first['status'], 'paused')
                self.assertTrue(Path(first['working_directory']).is_dir())
                args.resume_run, args.through_turn = True, 2
                data['turns'][0]['prompt'] = 'changed previous prompt'
                case.write_text(json.dumps(data))
                with self.assertRaisesRegex(RuntimeError, 'Previously submitted turn'):
                    runner.run(args)
                data['turns'][0]['prompt'] = 'first synthetic turn'
                case.write_text(json.dumps(data))
                second = runner.run(args)
                self.assertEqual(second['status'], 'completed')
                self.assertEqual([x[1] for x in sent], ['first synthetic turn', 'second synthetic turn'])
                self.assertEqual(sent[0][2], sent[1][2])
                self.assertIn('resume', sent[1][0])
                self.assertIn(thread, sent[1][0])
                self.assertEqual(second['turns'][1]['usage_delta_from_rollout']['input_tokens'], 10)
                self.assertTrue((root / 'run' / 'report-001.json').exists())
                self.assertTrue((root / 'run' / 'report-002.json').exists())
                self.assertFalse(Path(second['working_directory']).exists())
                with self.assertRaisesRegex(RuntimeError, 'intentionally paused'):
                    runner.run(args)


if __name__ == '__main__':
    unittest.main()
