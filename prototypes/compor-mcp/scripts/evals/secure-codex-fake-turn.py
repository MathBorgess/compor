"""Real Codex turn against an MCP host with a synthetic credential only."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('secureprobe', HERE / 'secure-codex-decision.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
output = Path(sys.argv[1]).resolve()
if output.exists():
    raise SystemExit('Output already exists')
checks = probe.test_isolation()
if not all(checks.values()):
    raise SystemExit('Synthetic isolation failed')
env = dict(os.environ)
env.pop('OPENAI_API_KEY', None)
with tempfile.TemporaryDirectory(prefix='compor-fake-codex-') as temp:
    os.chmod(temp, 0o700)
    sockpath = str(Path(temp) / 'mcp.sock')
    reportpath = str(Path(temp) / 'bridge.json')
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(sockpath)
    os.chmod(sockpath, 0o600)
    listener.listen(1)
    listener.settimeout(30)
    r, w = os.pipe()
    host = subprocess.Popen(['node', str(HERE / 'secure-decision-server.mjs'), str(r)], cwd=probe.ROOT, env=env, pass_fds=(r,), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    os.close(r)
    os.write(w, probe.FAKE)
    os.close(w)
    state = {'fake_found_in_mcp_output':False,'tools_called':[],'bridge_error':None}
    def serve():
        try:
            conn, _ = listener.accept()
            def upstream():
                try:
                    for line in conn.makefile('rb'):
                        message = json.loads(line)
                        if message.get('method') == 'tools/call':
                            state['tools_called'].append(message.get('params', {}).get('name'))
                        host.stdin.write(line)
                        host.stdin.flush()
                except Exception:
                    state['bridge_error'] = 'upstream_error'
            threading.Thread(target=upstream, daemon=True).start()
            for line in host.stdout:
                if probe.FAKE in line:
                    state['fake_found_in_mcp_output'] = True
                    break
                conn.sendall(line)
            conn.close()
        except Exception:
            state['bridge_error'] = 'server_error'
    threading.Thread(target=serve, daemon=True).start()
    flags = ['/usr/bin/sandbox-exec','-p',probe.POLICY,'codex','exec','--ephemeral','--ignore-user-config','--skip-git-repo-check',
             '--sandbox','read-only','--disable','shell_tool','--json','-m','gpt-6-luna','-c','web_search="disabled"',
             '-c','mcp_servers.compor.command="python3"','-c','mcp_servers.compor.args='+json.dumps([str(HERE/'secure-mcp-bridge.py'),sockpath,reportpath]),
             '-C',temp,'Chame somente compor.list_skills e informe quantas skills foram retornadas. Não faça buscas ou outras chamadas.']
    result = subprocess.run(flags, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=150)
    output_has_fake = probe.FAKE in result.stdout or probe.FAKE in result.stderr
    host.terminate()
    try: host.wait(timeout=5)
    except subprocess.TimeoutExpired: host.kill(); host.wait()
    listener.close()
    bridge = json.loads(Path(reportpath).read_text()) if Path(reportpath).exists() else None
    events=[]
    for line in result.stdout.splitlines():
        try:
            event=json.loads(line)
            if event.get('type')=='turn.completed': events.append({'type':event['type'],'usage':event.get('usage')})
        except Exception: pass
    status = ('ok' if result.returncode == 0 and bridge and bridge['clipboard_blocked'] and not bridge['process_environment_has_api_key'] and state['tools_called'] == ['list_skills'] and not state['fake_found_in_mcp_output'] and not output_has_fake and not state['bridge_error'] else 'failed')
    fingerprints={name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['secure-codex-decision.py','secure-decision-server.mjs','secure-mcp-bridge.py']}
    evidence={'status':status,'checks':checks,'bridge':bridge,'state':state,'fake_in_codex_output':output_has_fake,'codex_exit_code':result.returncode,'events':events,'fingerprints':fingerprints,'limitations':'Finite synthetic probes do not prove every possible macOS escape or memory access route.'}
    output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(evidence,ensure_ascii=False))
