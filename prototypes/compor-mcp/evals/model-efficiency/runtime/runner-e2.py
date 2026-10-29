#!/usr/bin/env python3
"""Observed Codex CLI + native stdio MCP trajectories. Python standard library only.

Never reads auth/config files or changes CODEX_HOME. Each run owns its subprocess
session and cwd. Future case prompts and judge expectations remain outside cwd.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

MODELS = ('gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra')
EFFORTS = ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')
TOOLS = {'list_skills', 'load_skill', 'prepare_word_cloud', 'prepare_moodboard',
         'prepare_layered_creative', 'prepare_annotation_context'}
DISABLED_FEATURES = (
    'apps', 'plugins', 'remote_plugin', 'recommended_plugins', 'browser_use',
    'browser_use_external', 'computer_use', 'in_app_browser', 'image_generation',
    'view_image', 'memories', 'hooks', 'multi_agent', 'multi_agent_v2',
    'shell_tool', 'unified_exec', 'shell_snapshot', 'skill_search',
    'skill_mcp_dependency_install', 'goals', 'sleep_tool', 'code_mode',
    'workspace_dependencies', 'tool_suggest',
)
GUARD = (
    'Você participa de um ensaio exclusivamente sintético do Compor. '
    'Use apenas as seis tools MCP do servidor compor_benchmark e os dados deste chat. '
    'Não acesse arquivos, rede, outras sessões, credenciais ou serviços. '
    'Não gere imagens nem alegue publicação, execução ou aprovação humana. '
    'Responda em português.'
)


def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(raw).hexdigest()


def save(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def parse_case(path):
    case = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(case, dict) or case.get('synthetic') is not True:
        raise ValueError('case-json must explicitly declare synthetic: true')
    if not isinstance(case.get('id'), str) or not case['id']:
        raise ValueError('case-json must have a nonempty id')
    turns = case.get('turns')
    if not isinstance(turns, list) or not turns or len(turns) > 20:
        raise ValueError('case-json must contain 1..20 sequential turns')
    for turn in turns:
        if not isinstance(turn, dict) or not isinstance(turn.get('prompt'), str) or not turn['prompt'].strip():
            raise ValueError('every turn must contain a nonempty prompt string')
        if set(turn) - {'id', 'prompt', 'images'}:
            raise ValueError('turns accept only id, prompt and images; keep judge data outside the case')
        if 'images' in turn and (not isinstance(turn['images'], list) or not all(isinstance(x, str) for x in turn['images'])):
            raise ValueError('images must be an array of local paths')
    if set(case) - {'id', 'synthetic', 'turns', 'description'}:
        raise ValueError('unexpected case fields; runner must not ingest judge expectations')
    return case


def subprocess_env():
    # Preserve only native CLI auth location/OS essentials; never read values
    # from authentication files or copy tokens into a fresh Codex home.
    result = {key: os.environ[key] for key in ('PATH', 'HOME', 'CODEX_HOME', 'TMPDIR',
              'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SSH_AUTH_SOCK') if key in os.environ}
    result.update({'NO_COLOR': '1', 'TERM': 'dumb'})
    result.pop('SSH_AUTH_SOCK', None)
    return result


def cli_options(args, node, bridge, entry, run_dir):
    overrides = {
        'model_reasoning_effort': args.effort, 'approval_policy': 'never',
        'sandbox_mode': 'read-only', 'project_doc_max_bytes': 0,
        'web_search': 'disabled', 'developer_instructions': GUARD,
        'features.skip_host_skill_discovery': True,
        'skills.include_instructions': False, 'skills.bundled.enabled': False,
        'mcp_servers.compor_benchmark.command': sys.executable,
        'mcp_servers.compor_benchmark.args': [str(bridge), '--log',
             str(run_dir / 'mcp.jsonl'), '--node', node, '--entry', str(entry)],
        'mcp_servers.compor_benchmark.env.COMPOR_MCP_GUIDANCE': args.guidance,
        'mcp_servers.compor_benchmark.required': True,
        'mcp_servers.compor_benchmark.enabled_tools': sorted(TOOLS),
    }
    overrides.update({f'features.{name}': False for name in DISABLED_FEATURES})
    options = ['--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
               '--json', '--model', args.model]
    for key, value in overrides.items():
        options += ['-c', key + '=' + json.dumps(value, ensure_ascii=False)]
    return options, overrides


def stop_owned(process):
    # start_new_session=True makes this group exclusive to one benchmark turn.
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


def execute(command, prompt, cwd, env, timeout):
    start = time.monotonic_ns()
    process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    timed_out = False
    try:
        try:
            stdout, stderr = process.communicate(prompt, timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            stop_owned(process)
            stdout, stderr = process.communicate(timeout=3)
    finally:
        stop_owned(process)
    return {'stdout': stdout, 'stderr': stderr, 'exit_code': process.returncode,
            'timed_out': timed_out,
            'wall_clock_ms': (time.monotonic_ns() - start) / 1_000_000,
            'owned_process_exited': process.poll() is not None}


def decode_events(stdout):
    events = []
    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            raise RuntimeError('Codex stdout contained non-JSON output') from None
    return events


def own_rollout(thread_id, env):
    if not re.fullmatch(r'[a-fA-F0-9-]{36}', thread_id):
        raise RuntimeError('Unexpected thread id; refusing rollout lookup')
    home = Path(env.get('CODEX_HOME', str(Path(env['HOME']) / '.codex')))
    # Filename lookup for THIS freshly returned ID; never enumerate/read bodies
    # of existing sessions and never inspect auth or config files.
    matches = list((home / 'sessions').glob(f'**/*{thread_id}.jsonl'))
    if len(matches) != 1:
        raise RuntimeError('Own rollout unavailable or ambiguous; metadata cannot be verified')
    return matches[0]


def rollout_evidence(path, cwd):
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    meta = next((r['payload'] for r in records if r.get('type') == 'session_meta'), None)
    if not meta or Path(meta.get('cwd', '')).resolve() != cwd.resolve():
        raise RuntimeError('Own rollout cwd mismatch')
    contexts = [r['payload'] for r in records if r.get('type') == 'turn_context']
    token_events = [r['payload'].get('info') for r in records
                    if r.get('type') == 'event_msg' and r['payload'].get('type') == 'token_count'
                    and r['payload'].get('info')]
    messages = [r['payload'] for r in records if r.get('type') == 'response_item'
                and r['payload'].get('type') == 'message'
                and r['payload'].get('role') in ('developer', 'system')]
    # Hash only; instructions may include installation-specific boilerplate.
    # These values measure observed local rollout, not intercepted API requests.
    return {
        'session_id': meta['id'], 'cli_version': meta.get('cli_version'),
        'model_provider': meta.get('model_provider'),
        'base_instructions_sha256': digest(meta.get('base_instructions')),
        'developer_system_messages_sha256': digest(messages),
        'developer_system_messages_count': len(messages),
        'turn_contexts': [{
            'model': c.get('model'), 'effort': c.get('effort'),
            'approval_policy': c.get('approval_policy'),
            'sandbox_policy': c.get('sandbox_policy'),
            'context_sha256': digest(c),
            'context_keys': sorted(c),
        } for c in contexts],
        'token_count_latest': token_events[-1] if token_events else None,
        'token_count_events': token_events,
        'isolation_markers': {
            'automatic_skills_catalog': any('### Available skills' in json.dumps(m) for m in messages),
            'personal_memory_summary': any('MEMORY_SUMMARY BEGINS' in json.dumps(m) for m in messages),
            'personal_operating_policy': any('Personal operating policy' in json.dumps(m) or 'mathai-agent-config' in json.dumps(m) for m in messages),
        },
        'source': 'own_cli_rollout_not_provider_response',
    }


def transport_evidence(path):
    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    pending = {}
    listings, instructions, calls = [], [], []
    for record in records:
        msg = record['message']
        key = (record['process_id'], str(msg.get('id')))
        if record['direction'] == 'client_to_server' and msg.get('method'):
            pending[key] = msg
            if msg['method'] == 'tools/call':
                calls.append({'process_id': record['process_id'], 'id': msg.get('id'),
                              'arguments': msg.get('params'), 'result': None})
        elif record['direction'] == 'server_to_client' and key in pending:
            request = pending.pop(key)
            if request['method'] == 'initialize':
                instructions.append(msg.get('result', {}).get('instructions'))
            elif request['method'] == 'tools/list':
                tools = msg.get('result', {}).get('tools', [])
                if {t['name'] for t in tools} != TOOLS or len(tools) != 6:
                    raise RuntimeError('MCP catalog differs from the six allowed tools')
                listings.append(tools)
            elif request['method'] == 'tools/call':
                for call in reversed(calls):
                    if call['id'] == msg.get('id') and call['process_id'] == record['process_id']:
                        call['result'] = msg.get('result', msg.get('error'))
                        break
    if not listings:
        raise RuntimeError('No MCP tools/list response captured')
    return {'tool_names': sorted(TOOLS), 'schema_sha256': digest(listings[0]),
            'schema_consistent_across_processes': all(x == listings[0] for x in listings),
            'instructions_sha256': [digest(x) for x in instructions],
            'calls': calls, 'listings_observed': len(listings)}


def usage_from_events(events):
    completed = [e for e in events if e.get('type') == 'turn.completed']
    if len(completed) != 1:
        return None
    raw = completed[0].get('usage', {})
    return {key: raw.get(key) for key in ('input_tokens', 'cached_input_tokens', 'output_tokens',
                                         'cache_write_input_tokens', 'reasoning_output_tokens')}


def usage_delta(observed, previous):
    current = (observed.get('token_count_latest') or {}).get('total_token_usage')
    if not current:
        return None
    prior = ((previous or {}).get('token_count_latest') or {}).get('total_token_usage') or {}
    result = {}
    for key in ('input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
                'output_tokens', 'reasoning_output_tokens', 'total_tokens'):
        now, before = current.get(key), prior.get(key, 0)
        if not isinstance(now, int) or not isinstance(before, int) or now < before:
            result[key] = None
        else:
            result[key] = now - before
    return result


def tool_observations(events):
    items = [event['item'] for event in events if event.get('type') == 'item.completed']
    unexpected = []
    for item in items:
        kind = item.get('type')
        if kind == 'mcp_tool_call':
            if item.get('server') != 'compor_benchmark' or item.get('tool') not in TOOLS:
                unexpected.append({'type': kind, 'server': item.get('server'), 'tool': item.get('tool')})
        elif kind not in ('agent_message', 'reasoning', 'error'):
            unexpected.append({'type': kind})
    return {'completed_item_types': sorted({item.get('type', 'unknown') for item in items}),
            'unexpected_tool_uses': unexpected}


def tree_hash(path):
    return digest({str(file.relative_to(path)): digest(file.read_bytes())
                   for file in sorted(path.rglob('*')) if file.is_file()})


def image_evidence(turn, case_path):
    images = []
    for name in turn.get('images', []):
        path = Path(name)
        path = (path if path.is_absolute() else case_path.parent / path).resolve()
        if not path.is_file() or path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            raise ValueError('Only existing local PNG/JPEG/WebP images can be attached')
        images.append({'path': str(path), 'sha256': digest(path.read_bytes())})
    return images


def checkpoint_path(run_dir):
    paths = sorted(run_dir.glob('report-*.json'))
    return paths[-1] if paths else None


def run(args):
    if os.name != 'posix':
        raise RuntimeError('POSIX process groups are required')
    case_path = args.case_json.resolve()
    case = parse_case(case_path)
    codex, node = shutil.which(args.codex), shutil.which('node')
    if not codex or not node:
        raise RuntimeError('Codex and Node must already be installed')
    runtime = Path(__file__).resolve().parent
    prototype = runtime.parents[2]
    run_dir = args.run_dir.resolve()
    snapshot = run_dir / 'mcp-snapshot'
    env = subprocess_env()
    version = subprocess.run([codex, '--version'], capture_output=True, text=True,
                             env=env, timeout=10, check=True).stdout.strip()
    if args.resume_run:
        previous = checkpoint_path(run_dir)
        if previous is None:
            raise RuntimeError('No checkpoint to resume')
        report = json.loads(previous.read_text())
        if report['status'] != 'paused':
            raise RuntimeError('Only an intentionally paused run can resume; failed/complete runs are immutable')
        for key, expected in [('case_id', case['id']), ('model_configured', args.model),
                              ('effort_configured', args.effort), ('guidance', args.guidance),
                              ('cli_version', version)]:
            if report[key] != expected:
                raise RuntimeError('Resume configuration mismatch: ' + key)
        if tree_hash(snapshot / 'dist') != report['snapshot']['dist_sha256'] or tree_hash(snapshot / 'skills') != report['snapshot']['skills_sha256']:
            raise RuntimeError('Frozen MCP source changed')
        if tree_hash(prototype / 'node_modules') != report['snapshot']['dependencies_sha256']:
            raise RuntimeError('Pinned MCP dependencies changed since the run started')
        for index, old in enumerate(report['turns']):
            if index >= len(case['turns']) or digest(case['turns'][index]['prompt']) != old['prompt_sha256'] or image_evidence(case['turns'][index], case_path) != old['images']:
                raise RuntimeError('Previously submitted turn changed; resume refused')
        cwd = Path(report['working_directory'])
        if not cwd.is_dir() or any(cwd.iterdir()):
            raise RuntimeError('Preserved model working directory is missing or no longer empty')
        thread_id = report['thread_id']
    else:
        if not (prototype / 'dist' / 'stdio.js').is_file():
            raise RuntimeError('Run npm run build in prototypes/compor-mcp first')
        run_dir.mkdir(parents=True, exist_ok=False)
        snapshot.mkdir()
        for name in ('dist', 'skills'):
            shutil.copytree(prototype / name, snapshot / name)
        shutil.copyfile(prototype / 'package.json', snapshot / 'package.json')
        shutil.copyfile(prototype / 'package-lock.json', snapshot / 'package-lock.json')
        (snapshot / 'node_modules').symlink_to((prototype / 'node_modules').resolve(), target_is_directory=True)
        cwd = Path(tempfile.mkdtemp(prefix='compor-benchmark-cwd-')).resolve()
        thread_id = None
        report = {
            'schema_version': 1, 'status': 'running', 'started_at': datetime.now(timezone.utc).isoformat(),
            'case_id': case['id'], 'initial_case_sha256': digest(case_path.read_bytes()), 'synthetic': True,
            'model_configured': args.model, 'model_returned_by_provider': None,
            'model_returned_limitation': 'CLI rollout records runtime model; provider response model is not exposed.',
            'effort_configured': args.effort, 'guidance': args.guidance,
            'condition': 'C2', 'transport': 'native_mcp_stdio', 'runtime': 'codex_exec_resume',
            'cli_version': version, 'platform': platform.platform(), 'python': platform.python_version(),
            'working_directory': str(cwd),
            'runner_sha256': digest(Path(__file__).read_bytes()),
            'bridge_sha256': digest((runtime / 'stdio_bridge.py').read_bytes()),
            'instruction_guard_sha256': digest(GUARD),
            'snapshot': {'dist_sha256': tree_hash(snapshot / 'dist'),
                         'skills_sha256': tree_hash(snapshot / 'skills'),
                         'dependencies_sha256': tree_hash(prototype / 'node_modules'),
                         'dependencies_note': 'Shared immutable dependency path; digest checked at every resume.'},
            'auth': 'native_codex_auth_no_credentials_read_or_copied',
            'persistence': 'Native Codex session required by exec resume; runner does not delete it.',
            'builtin_tools': {'requested_disabled_features': list(DISABLED_FEATURES),
                              'exact_model_visible_catalog': None,
                              'limitation': 'CLI does not expose the full request tool schema; MCP wire is captured.'},
            'turns': [], 'invocations': [], 'wall_clock_ms': 0,
        }
    options, overrides = cli_options(args, node, runtime / 'stdio_bridge.py', snapshot / 'dist' / 'stdio.js', run_dir)
    if args.resume_run and (digest(Path(__file__).read_bytes()) != report['runner_sha256'] or digest((runtime / 'stdio_bridge.py').read_bytes()) != report['bridge_sha256']):
        raise RuntimeError('Runner or transport changed since the checkpoint')
    if args.resume_run and overrides != report['configuration']:
        raise RuntimeError('Runner configuration changed since the checkpoint')
    report['configuration'] = overrides
    report['configuration_sha256'] = digest(overrides)
    if not args.resume_run:
        save(run_dir / 'manifest.json', report)
    through = args.through_turn or len(case['turns'])
    if not len(report['turns']) < through <= len(case['turns']):
        raise ValueError('--through-turn must advance the trajectory within the provided case')
    start = time.monotonic_ns()
    invocation = len(report['invocations']) + 1
    report['status'] = 'running'
    try:
        for index in range(len(report['turns']), through):
            turn = case['turns'][index]
            images = image_evidence(turn, case_path)
            command = [codex, 'exec', *options]
            if thread_id:
                command += ['resume', thread_id]
            else:
                command += ['--sandbox', 'read-only']
            for image in images:
                command += ['--image', image['path']]
            command += ['-']
            result = execute(command, turn['prompt'], cwd, env, args.timeout)
            events = decode_events(result.pop('stdout'))
            stderr = result.pop('stderr')
            for value, label in ((env.get('HOME'), '<HOME>'), (str(cwd), '<RUN_CWD>'),
                                 (str(run_dir), '<RUN_DIR>')):
                if value:
                    stderr = stderr.replace(value, label)
            save(run_dir / f'turn-{index + 1:02d}.json', {'prompt': turn['prompt'],
                 'images': images, 'events': events,
                 'assistant_messages': [event['item']['text'] for event in events
                     if event.get('type') == 'item.completed' and event.get('item', {}).get('type') == 'agent_message'],
                 'stderr': stderr, **result})
            started = [e.get('thread_id') for e in events if e.get('type') == 'thread.started']
            if len(started) != 1 or (thread_id and started[0] != thread_id):
                raise RuntimeError('Missing or mismatched native thread id')
            thread_id = started[0]
            report['thread_id'] = thread_id
            rollout = own_rollout(thread_id, env)
            report['own_rollout_path'] = str(rollout)
            observed = rollout_evidence(rollout, cwd)
            contexts = observed['turn_contexts']
            if not contexts or contexts[-1]['model'] != args.model or contexts[-1]['effort'] != args.effort:
                raise RuntimeError('Runtime model/effort differ from explicitly configured values')
            usage = usage_from_events(events)
            previous_observed = report['turns'][-1]['rollout_evidence'] if report['turns'] else None
            tool_audit = tool_observations(events)
            report['turns'].append({'id': turn.get('id', str(index + 1)), 'images': images,
                'prompt_sha256': digest(turn['prompt']), **result,
                'usage_cli': usage, 'usage_delta_from_rollout': usage_delta(observed, previous_observed),
                'tool_audit': tool_audit, 'runtime_model': contexts[-1]['model'],
                'runtime_effort': contexts[-1]['effort'], 'rollout_evidence': observed})
            if any(observed['isolation_markers'].values()):
                raise RuntimeError('Personal skills/memory instructions detected; run invalid')
            if tool_audit['unexpected_tool_uses']:
                raise RuntimeError('Tool outside the six-tool MCP contract was used; run invalid')
            if result['exit_code'] != 0 or result['timed_out'] or usage is None:
                raise RuntimeError('CLI turn failed or did not emit complete usage')
        report['mcp'] = transport_evidence(run_dir / 'mcp.jsonl')
        report['status'] = 'paused' if through < len(case['turns']) else 'completed'
    except (Exception, KeyboardInterrupt) as error:
        report['status'] = 'failed'
        report['error'] = {'type': type(error).__name__, 'message': str(error)}
    finally:
        elapsed = (time.monotonic_ns() - start) / 1_000_000
        report['wall_clock_ms'] += elapsed
        report['invocations'].append({'number': invocation, 'wall_clock_ms': elapsed,
            'through_turn': through, 'case_sha256': digest(case_path.read_bytes())})
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        if report['status'] != 'paused':
            try:
                cwd.rmdir()  # Remove only our empty directory; retain unexpected files.
            except OSError:
                report['working_directory_retained'] = True
        save(run_dir / f'report-{invocation:03d}.json', report)
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=MODELS, required=True)
    parser.add_argument('--effort', choices=EFFORTS, required=True)
    parser.add_argument('--guidance', choices=('baseline', 'guided_v1', 'focused_v2'), required=True)
    parser.add_argument('--case-json', type=Path, required=True)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--through-turn', type=int, help='Stop after this 1-based turn and preserve checkpoint')
    parser.add_argument('--resume-run', action='store_true', help='Continue an intentionally paused run-dir')
    parser.add_argument('--timeout', type=float, default=180)
    parser.add_argument('--codex', default='codex')
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    report = run(args)
    print(json.dumps({key: report.get(key) for key in ('status', 'case_id', 'model_configured',
          'effort_configured', 'guidance', 'wall_clock_ms', 'error')}, ensure_ascii=False))
    return 0 if report['status'] in ('completed', 'paused') else 1


if __name__ == '__main__':
    sys.exit(main())
