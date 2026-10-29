#!/usr/bin/env python3
"""Two simulated user turns in a real isolated Codex app-server; no API key or search.

Uses the existing ChatGPT login by a temporary symlink (never copies credentials),
and a local copy of a previously generated, fictional botanical image.
"""
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from creative_result_check import is_expected_edit

ROOT = Path(__file__).resolve().parents[4]
ORIGINAL = Path.home() / '.codex/generated_images/01a18728-e9e9-7390-b3f0-44dfe62f2488/exec-78d482a1-4849-43da-997b-f79d96a7e7fe.png'
OUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'docs/evals/2026-10-29-phoenix-e2e/codex-creative-conversation-probe.json'
assert ORIGINAL.is_file() and not OUT.exists()
home = Path(tempfile.mkdtemp(prefix='compor-conversation-codex-')).resolve()
profile = home / 'profile'
profile.mkdir(mode=0o700)
assets = home / 'generated_images' / 'creative_test'
assets.mkdir(mode=0o700, parents=True)
image = assets / 'base.png'
shutil.copyfile(ORIGINAL, image)
source_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
assert hashlib.sha256(image.read_bytes()).hexdigest() == source_hash
auth_link = home / 'auth.json'
auth_link.symlink_to(Path.home() / '.codex/auth.json')
node = shutil.which('node')
assert node
server = ROOT / 'prototypes/compor-mcp/dist/stdio.js'
assert server.is_file()
(home / 'config.toml').write_text('[mcp_servers.compor]\ncommand = ' + json.dumps(node) + '\nargs = [' + json.dumps(str(server)) + ']\nstartup_timeout_sec = 30\nenv_vars = ["CODEX_HOME", "CODEX_THREAD_ID", "COMPOR_PROFILE_DIR"]\n\n[features]\nshell_tool = false\n', encoding='utf-8')
env = {k: os.environ[k] for k in ('PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TERM') if k in os.environ}
env.update({'CODEX_HOME':str(home), 'COMPOR_PROFILE_DIR':str(profile), 'CODEX_THREAD_ID':'creative_test', 'NO_COLOR':'1'})
proc = subprocess.Popen(['codex','-c','web_search="disabled"','app-server'], cwd=home, env=env,
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    text=True, bufsize=1, start_new_session=True)
incoming = queue.Queue()
def read():
    for line in proc.stdout:
        try: incoming.put(json.loads(line))
        except json.JSONDecodeError: pass
threading.Thread(target=read, daemon=True).start()
def send(payload):
    proc.stdin.write(json.dumps(payload, ensure_ascii=False) + '\n')
    proc.stdin.flush()
def call(n, method, params, timeout=45):
    send({'id':n,'method':method,'params':params})
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        item=incoming.get(timeout=max(.1,deadline-time.monotonic()))
        if item.get('id')==n:
            if 'error' in item: raise RuntimeError(f'{method}: {item["error"].get("code")}')
            return item.get('result',{})
    raise TimeoutError(method)
def turn(n, thread_id, prompt):
    started=time.monotonic()
    response=call(n,'turn/start',{'threadId':thread_id,'input':[{'type':'text','text':prompt}],
        'model':'gpt-6-luna','approvalPolicy':'never'})
    turn_id=response['turn']['id']
    events=[]
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        msg=incoming.get(timeout=max(.1,deadline-time.monotonic()))
        method=msg.get('method','')
        item=msg.get('params',{}).get('item',{})
        if method in ('item/started','item/completed') and item.get('type') in ('mcpToolCall','agentMessage'):
            entry={'method':method,'type':item.get('type')}
            for field in ('server','tool','status','arguments','result','text','error'):
                if field in item: entry[field]=item[field]
            events.append(entry)
        if method=='turn/completed' and msg.get('params',{}).get('turn',{}).get('id')==turn_id:
            turn=msg['params']['turn']
            return {'status':turn.get('status'),'elapsed_ms':round((time.monotonic()-started)*1000),'events':events}
    raise TimeoutError('turn/completed')

report={'status':'failed','scope':'two simulated turns, isolated profile and copied imagegen base; ChatGPT model inference only',
        'source_sha256':source_hash,'api_key_in_environment':False,'external_search':False,'publication':False,'turns':[]}
try:
    call(1,'initialize',{'clientInfo':{'name':'compor-creative-eval','version':'1'},'capabilities':{'experimentalApi':True}})
    send({'method':'initialized','params':{}})
    started=call(2,'thread/start',{'cwd':str(home),'ephemeral':True,'approvalPolicy':'never','sandbox':'read-only','model':'gpt-6-luna'})
    thread_id=started['thread']['id']
    prompt1=(f'Tenho uma ideia fictícia de curso de aquarela botânica. Quero uma peça local com texto editável. '
      f'Use a imagem PNG local {image} como base; autorizo seu uso local. '
      'Coloque “Botânica em Aquarela” como título em camada de texto. '
      'Use as ferramentas MCP Compor para criar uma versão local, sem usar busca nem registrar perfil. Não publique.')
    report['turns'].append(turn(3,thread_id,prompt1))
    prompt2=('Troque o título para “Flores em Aquarela”. Preserve a versão anterior e a imagem base. '
      'Use as ferramentas MCP Compor para fazer a edição local e mostre a versão resultante; não publique.')
    report['turns'].append(turn(4,thread_id,prompt2))
    # Read only snapshots created inside the explicitly isolated temporary profile.
    snapshots=[]
    for p in profile.rglob('snapshot_v_*.json'):
        s=json.loads(p.read_text())
        if s.get('format')=='compor-local-creative-v1': snapshots.append(s)
    snapshots.sort(key=lambda s:s['revision'])
    report['snapshots']=[{'piece_id':s['piece_id'],'version_id':s['version_id'],'parent_version_id':s['parent_version_id'],
      'revision':s['revision'],'base_sha256':s['base_sha256'],'layers':s['layers']} for s in snapshots]
    report['base_preserved']=hashlib.sha256(image.read_bytes()).hexdigest()==source_hash
    report['status']='passed' if is_expected_edit(snapshots, report['turns'], source_hash) else 'failed'
    report['retained_profile_directory']=str(profile)
except Exception as e:
    report['error']=type(e).__name__ + ': ' + str(e)[:500]
finally:
    try: proc.stdin.close()
    except OSError: pass
    try: proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid,signal.SIGTERM)
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired: os.killpg(proc.pid,signal.SIGKILL);proc.wait()
    if auth_link.is_symlink(): auth_link.unlink()
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'turns':len(report['turns']),'error':report.get('error'),'output':str(OUT)},ensure_ascii=False))
