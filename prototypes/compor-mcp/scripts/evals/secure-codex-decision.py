"""One local Codex/Decision test, gated by synthetic isolation checks.

Never writes credentials: the MCP host receives them once through an inherited
anonymous pipe, injects an OpenAI client in memory, and never uses setenv.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import socket
import select
import subprocess
import sys
import tempfile
import threading
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
POLICY = '(version 1)(allow default)(deny appleevent-send)(deny mach-lookup (global-name "com.apple.pasteboard.1"))'
FAKE = b'COM P OR_SYNTHETIC_PROBE_SECRET_84e0d9'.replace(b' ', b'')
BRIEFING = 'Curso fictício para ajudar pessoas a apresentar ideias com clareza em reuniões de trabalho, sem nome ou formato definido; visual sóbrio e direto'

def read_procargs(pid):
    libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    mib = (ctypes.c_int * 3)(1, 49, pid)
    size = ctypes.c_size_t(0)
    if libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0):
        return None
    buf = ctypes.create_string_buffer(size.value)
    if libc.sysctl(mib, 3, buf, ctypes.byref(size), None, 0):
        return None
    return buf.raw

def test_isolation():
    env = dict(os.environ)
    env.pop('OPENAI_API_KEY', None)
    env.pop('COMPOR_FAKE_SECRET', None)
    control_env = dict(env, COMPOR_FAKE_SECRET=FAKE.decode())
    control = subprocess.Popen(['node', '-e', 'setTimeout(()=>{},30000)'], env=control_env)
    r, w = os.pipe()
    # Secret is inserted only in the Node heap, never in its process.env.
    code = '''const fs=require('fs'),cp=require('child_process');
const key=fs.readFileSync(Number(process.argv[1]),'utf8');fs.closeSync(Number(process.argv[1]));
const local=Object.values(process.env).some(v=>v===key);
const sub=cp.spawnSync(process.execPath,['-e','process.stdout.write(JSON.stringify(Object.keys(process.env)))'],{encoding:'utf8'});
process.stdout.write(JSON.stringify({local_env_has_secret:local,child_env_has_key:JSON.parse(sub.stdout).includes('OPENAI_API_KEY')})+'\\n');setTimeout(()=>{},30000);'''
    target = subprocess.Popen(['node', '-e', code, str(r)], env=env, pass_fds=(r,), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    os.close(r)
    os.write(w, FAKE)
    os.close(w)
    try:
        ready = json.loads(target.stdout.readline())
        control_snapshot, target_snapshot = read_procargs(control.pid), read_procargs(target.pid)
        paste = subprocess.run(['/usr/bin/sandbox-exec', '-p', POLICY, '/usr/bin/pbpaste'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
        libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib')
        task = ctypes.c_uint(0)
        task_status = libc.task_for_pid(libc.mach_task_self(), target.pid, ctypes.byref(task))
        checks = {
            'control_env_exposed_by_sysctl': control_snapshot is not None and FAKE in control_snapshot,
            'runtime_heap_not_in_sysctl': target_snapshot is not None and FAKE not in target_snapshot,
            'parent_env_excludes_secret': not ready['local_env_has_secret'],
            'child_env_excludes_key_name': not ready['child_env_has_key'],
            'sandbox_pbpaste_blocked': paste.returncode != 0 and not paste.stdout,
            'sibling_task_for_pid_denied': task_status != 0 and task.value == 0,
        }
        # Exercise the actual stdio host with a fake key; do not call the API.
        # The sandboxed process checks procargs2 directly, but reports only a boolean.
        hr, hw = os.pipe()
        host = subprocess.Popen(['node', str(HERE / 'secure-decision-server.mjs'), str(hr)], cwd=ROOT, env=env, pass_fds=(hr,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        os.close(hr)
        os.write(hw, FAKE)
        os.close(hw)
        try:
            host.stdin.write((json.dumps({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'isolation-probe','version':'1'}}})+'\n').encode())
            host.stdin.flush()
            if not select.select([host.stdout], [], [], 10)[0]:
                raise RuntimeError('Host initialization timed out')
            init_line = host.stdout.readline()
            host.stdin.write((json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n').encode())
            host.stdin.write((json.dumps({'jsonrpc':'2.0','id':2,'method':'tools/list'})+'\n').encode())
            host.stdin.flush()
            if not select.select([host.stdout], [], [], 10)[0]:
                raise RuntimeError('Host tools list timed out')
            list_line = host.stdout.readline()
            host.stdin.write((json.dumps({'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'not_a_real_tool','arguments':{}}})+'\n').encode())
            host.stdin.flush()
            if not select.select([host.stdout], [], [], 10)[0]:
                raise RuntimeError('Host error response timed out')
            error_line = host.stdout.readline()
            checks['host_responses_do_not_contain_secret'] = all(FAKE not in line for line in (init_line, list_line, error_line))
            checks['host_error_tested'] = bool(json.loads(error_line).get('error') or json.loads(error_line).get('result',{}).get('isError'))
            checks['host_has_tools'] = len(json.loads(list_line).get('result',{}).get('tools',[])) > 0
            sandbox_code = '''import ctypes,json,sys\nx=json.load(sys.stdin);l=ctypes.CDLL('/usr/lib/libSystem.B.dylib');m=(ctypes.c_int*3)(1,49,x['pid']);n=ctypes.c_size_t(0);r=l.sysctl(m,3,None,ctypes.byref(n),None,0);b=ctypes.create_string_buffer(n.value or 1);r2=l.sysctl(m,3,b,ctypes.byref(n),None,0) if r==0 else -1;print(json.dumps({'read':r==0 and r2==0,'visible':x['fake'].encode() in b.raw}))'''
            probe = subprocess.run(['/usr/bin/sandbox-exec','-p',POLICY,sys.executable,'-c',sandbox_code], input=json.dumps({'pid':host.pid,'fake':FAKE.decode()}).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
            sandbox_result = json.loads(probe.stdout)
            checks['sandbox_sysctl_read_host_without_key'] = probe.returncode == 0 and sandbox_result['read'] and not sandbox_result['visible']
        finally:
            host.terminate()
            host.wait(timeout=5)
        return checks
    finally:
        for proc in (target, control):
            proc.terminate()
            proc.wait(timeout=5)

def main():
    out = Path(sys.argv[1]).resolve()
    preflight = Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else None
    if out.exists():
        raise SystemExit('Output already exists; preserve prior evidence')
    if not preflight:
        raise SystemExit('A current real Codex fake-key preflight is required')
    prior = json.loads(preflight.read_text())
    fingerprints = {name: hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['secure-codex-decision.py','secure-decision-server.mjs','secure-mcp-bridge.py']}
    if prior.get('status') != 'ok' or prior.get('fingerprints') != fingerprints:
        raise SystemExit('Real Codex fake-key preflight missing, failed or stale')
    checks = test_isolation()
    if not all(checks.values()):
        out.write_text(json.dumps({'status': 'isolation_preflight_failed', 'checks': checks}, indent=2) + '\n')
        raise SystemExit('Synthetic isolation preflight failed; no live call')
    key = subprocess.run(['/usr/bin/pbpaste'], capture_output=True, check=True, timeout=5).stdout.strip()
    if not key.startswith(b'sk-') or len(key) < 30:
        raise SystemExit('Authorized clipboard key unavailable')
    clean_env = dict(os.environ)
    clean_env.pop('OPENAI_API_KEY', None)
    state = {'calls': 0, 'allowed': [], 'rejections': [], 'observation': None, 'redactions': 0, 'error': None}
    with tempfile.TemporaryDirectory(prefix='compor-secure-probe-') as temp:
        os.chmod(temp, 0o700)
        sockpath = str(Path(temp) / 'mcp.sock')
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(sockpath)
        os.chmod(sockpath, 0o600)
        listener.listen(1)
        listener.settimeout(45)
        read_fd, write_fd = os.pipe()
        host = subprocess.Popen(['node', str(HERE / 'secure-decision-server.mjs'), str(read_fd)], cwd=ROOT, env=clean_env, pass_fds=(read_fd,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        os.close(read_fd)
        os.write(write_fd, key)
        os.close(write_fd)
        stop = threading.Event()
        pending = {}

        def serve():
            try:
                conn, _ = listener.accept()
                def from_client():
                    try:
                        for line in conn.makefile('rb'):
                            msg = json.loads(line)
                            method, mid = msg.get('method'), msg.get('id')
                            if method == 'tools/list':
                                pending[mid] = 'list'
                            elif method == 'tools/call':
                                arg = msg.get('params', {})
                                values = arg.get('arguments', {})
                                allowed = (arg.get('name') == 'discover_visual_references' and state['calls'] == 0 and
                                    values.get('ranker_mode') == 'decision_score' and values.get('consent_external_search') is True and
                                    values.get('consent_model') is True and values.get('consent_reference_previews') is True and
                                    values.get('briefing') == BRIEFING and values.get('target_format') == 'instagram_post' and values.get('client_mode') == 'web' and
                                    set(values) == {'briefing','target_format','client_mode','ranker_mode','consent_external_search','consent_model','consent_reference_previews'})
                                if not allowed:
                                    expected = {'briefing','target_format','client_mode','ranker_mode','consent_external_search','consent_model','consent_reference_previews'}
                                    state['rejections'].append({'name_correct':arg.get('name') == 'discover_visual_references','briefing_exact':values.get('briefing') == BRIEFING,'format_correct':values.get('target_format') == 'instagram_post','client_correct':values.get('client_mode') == 'web','ranker_correct':values.get('ranker_mode') == 'decision_score','consents_correct':all(values.get(k) is True for k in ('consent_external_search','consent_model','consent_reference_previews')),'missing_fields':sorted(expected-set(values)),'extra_fields_count':len(set(values)-expected)})
                                    conn.sendall((json.dumps({'jsonrpc':'2.0','id':mid,'error':{'code':-32001,'message':'Request outside the approved synthetic scope'}})+'\n').encode())
                                    continue
                                state['calls'] += 1
                                pending[mid] = 'discovery'
                                state['allowed'].append({'name':arg['name'],'ranker_mode':values['ranker_mode'],'consents':True})
                            elif method not in ('initialize','notifications/initialized','ping'):
                                if mid is not None:
                                    conn.sendall((json.dumps({'jsonrpc':'2.0','id':mid,'error':{'code':-32001,'message':'Method disabled for this probe'}})+'\n').encode())
                                continue
                            host.stdin.write(line)
                            host.stdin.flush()
                    except Exception:
                        state['error'] = 'client_bridge_error'
                threading.Thread(target=from_client, daemon=True).start()
                for line in host.stdout:
                    if key in line:
                        state['redactions'] += 1
                        # Block rather than alter a protocol response containing a key.
                        state['error'] = 'credential_in_mcp_output_blocked'
                        break
                    msg = json.loads(line)
                    kind = pending.pop(msg.get('id'), None)
                    if kind == 'list' and isinstance(msg.get('result'), dict):
                        msg['result']['tools'] = [t for t in msg['result'].get('tools', []) if t.get('name') == 'discover_visual_references']
                        line = (json.dumps(msg)+'\n').encode()
                    if kind == 'discovery':
                        data = msg.get('result', {}).get('structuredContent', {})
                        batch, telemetry = data.get('decision_score_batch') or {}, data.get('telemetry') or {}
                        state['observation'] = {'status':data.get('status'),'error':msg.get('result',{}).get('isError',False),'requested':batch.get('requested'),'scored':batch.get('scored'),'model':batch.get('model'),'telemetry':telemetry,'candidate_origin':data.get('candidate_origin'),'ranker_mode':data.get('ranker_mode')}
                    conn.sendall(line)
                conn.close()
            except Exception:
                state['error'] = 'broker_failure'
            finally:
                stop.set()

        threading.Thread(target=serve, daemon=True).start()
        prompt = ('A pessoa fictícia autorizou busca em fontes curadas, envio do briefing ao modelo e envio das miniaturas nesta chamada. '
          'Chame uma vez compor.discover_visual_references com briefing "Curso fictício para ajudar pessoas a apresentar ideias com clareza em reuniões de trabalho, sem nome ou formato definido; visual sóbrio e direto", '
          'target_format "instagram_post", client_mode "web", ranker_mode "decision_score", consent_external_search true, consent_model true e consent_reference_previews true. '
          'Não chame outras ferramentas e não faça buscas além dessa. Conte quantos candidatos foram pontuados e descreva resultados e limitações; não publique nada.')
        flags = [
            '/usr/bin/sandbox-exec', '-p', POLICY, 'codex', 'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
            '--sandbox', 'read-only', '--disable', 'shell_tool', '--json', '-m', 'gpt-6-luna',
            '-c', 'web_search="disabled"', '-c', 'mcp_servers.compor.command="python3"',
            '-c', 'mcp_servers.compor.args='+json.dumps([str(HERE / 'secure-mcp-bridge.py'), sockpath]),
            '-C', temp, prompt,
        ]
        started = time.monotonic()
        proc = subprocess.run(flags, env=clean_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        elapsed = round((time.monotonic() - started) * 1000)
        # Key must not enter artifacts, even if a downstream tool misbehaves.
        if key in proc.stdout or key in proc.stderr:
            state['redactions'] += 1
            state['error'] = 'credential_in_codex_output_blocked'
        events = []
        for line in proc.stdout.splitlines():
            if key in line:
                continue
            try:
                event = json.loads(line)
                item = event.get('item') or {}
                if item.get('type') == 'mcp_tool_call':
                    events.append({'type':event.get('type'),'server':item.get('server'),'tool':item.get('tool'),'status':item.get('status'),'error':item.get('error')})
                elif item.get('type') == 'agent_message':
                    events.append({'type':event.get('type'),'message':str(item.get('text') or '')[:1000]})
                elif event.get('type') == 'turn.completed':
                    events.append({'type':event['type'],'usage':event.get('usage')})
            except Exception:
                pass
        host.terminate()
        try: host.wait(timeout=5)
        except subprocess.TimeoutExpired: host.kill(); host.wait()
        listener.close()
        result = {'date':'2026-10-29','checks':checks,'codex_exit_code':proc.returncode,'elapsed_ms':elapsed,'broker':state,'events':events,'key_in_codex_environment':False,'key_in_mcp_environment':False,'published':False,'limits':'One synthetic request; sandbox evidence is bounded and does not prove all possible macOS access routes.'}
        result['status'] = 'ok' if proc.returncode == 0 and state['calls'] == 1 and state['observation'] and not state['observation']['error'] and not state['error'] else 'failed'
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps({'status':result['status'],'checks':checks,'broker':state},ensure_ascii=False))

if __name__ == '__main__':
    main()
