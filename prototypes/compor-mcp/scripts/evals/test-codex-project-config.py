#!/usr/bin/env python3
"""Probe the *project's* MCP config using an isolated Codex app-server.

No model turn, credentials, network search, or persistent user profile. The
temporary client trusts only this project, leaving the user's config untouched.
"""
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import signal
import subprocess
import tempfile
import threading
import time

root = Path(__file__).resolve().parents[4]
codex = shutil.which('codex')
assert codex and (root / 'prototypes/compor-mcp/dist/stdio.js').is_file()

with tempfile.TemporaryDirectory(prefix='compor-project-codex-') as client_dir:
    home = Path(client_dir)
    (home / 'config.toml').write_text(
        f'[projects.{json.dumps(str(root))}]\ntrust_level = "trusted"\n'
        '[model_providers.offline_probe]\nname = "offline_probe"\n'
        'base_url = "http://127.0.0.1:9"\nwire_api = "responses"\n'
        'requires_openai_auth = false\n', encoding='utf-8')
    env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'CODEX_HOME': client_dir,
           'TMPDIR': client_dir, 'COMPOR_PROFILE_DIR': str(home / 'profile'),
           'TERM': 'dumb', 'NO_COLOR': '1'}
    flags = ['-c', 'model_provider="offline_probe"', '-c', 'model="offline_probe_model"']
    configured = subprocess.run([codex, *flags, 'mcp', 'get', 'compor', '--json'],
        cwd=root, env=env, capture_output=True, text=True, timeout=15, check=True)
    config = json.loads(configured.stdout)
    assert config['enabled'] and config['transport']['type'] == 'stdio'
    assert config['transport']['command'] == 'node'
    assert config['transport']['args'] == ['prototypes/compor-mcp/dist/stdio.js']
    proc = subprocess.Popen([codex, *flags, 'app-server'], cwd=root, env=env,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, bufsize=1, start_new_session=True)
    incoming = queue.Queue()
    def read():
        for line in proc.stdout:
            try: incoming.put(json.loads(line))
            except json.JSONDecodeError: pass
    threading.Thread(target=read, daemon=True).start()
    def send(payload):
        proc.stdin.write(json.dumps(payload) + '\n')
        proc.stdin.flush()
    def call(i, method, params, timeout=30):
        send({'id': i, 'method': method, 'params': params})
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            item = incoming.get(timeout=max(.1, deadline - time.monotonic()))
            if item.get('id') == i:
                if 'error' in item: raise RuntimeError(f'{method}: RPC error {item["error"].get("code")}')
                return item.get('result', {})
        raise TimeoutError(method)
    def data(response):
        if response.get('isError'): raise RuntimeError('MCP tool error')
        return response.get('structuredContent') or json.loads(next(c['text'] for c in response['content'] if c.get('type') == 'text'))
    try:
        call(1, 'initialize', {'clientInfo': {'name': 'compor-project-probe', 'version': '1'},
              'capabilities': {'experimentalApi': True}})
        send({'method': 'initialized', 'params': {}})
        servers = call(2, 'mcpServerStatus/list', {'serverName': 'compor', 'detail': 'toolsAndAuthOnly'})['data']
        assert len(servers) == 1 and servers[0]['name'] == 'compor' and not servers[0].get('toolsError')
        names = sorted(servers[0]['tools'])
        assert 'discover_visual_references' in names and 'phoenix_profile_signal' in names
        assert {'creative_local_create', 'creative_local_create_from_file', 'creative_local_edit_text', 'creative_local_set_caption', 'creative_local_read'} <= set(names)
        thread = call(3, 'thread/start', {'cwd': str(root), 'ephemeral': True, 'approvalPolicy': 'never'})['thread']['id']
        def tool(i, name, args):
            return data(call(i, 'mcpServer/tool/call', {'threadId': thread, 'server': 'compor', 'tool': name, 'arguments': args}))
        catalog = tool(9, 'list_skills', {})['skills']
        skill_versions = {entry['id']:entry['version'] for entry in catalog}
        assert skill_versions == {'entender-intencao':'0.2.0-prototype',
            'traduzir-direcao':'0.2.0-prototype', 'criar-piloto':'0.3.0-prototype',
            'explorar-moodboards':'0.1.0-prototype'}
        loaded = tool(10, 'load_skill', {'id':'entender-intencao'})
        assert loaded['version'] == skill_versions['entender-intencao']
        assert hashlib.sha256(loaded['instructions'].encode('utf-8')).hexdigest() == loaded['contentSha256']
        denied = call(8, 'mcpServer/tool/call', {'threadId': thread, 'server': 'compor',
            'tool': 'search_curated_references', 'arguments': {'briefing_summary':'Curso fictício de aquarela',
            'target_format':'instagram_post', 'aspect_focus':['composition'], 'consent_external_search':False}})
        assert denied.get('isError') and denied['structuredContent']['external_requests_made'] == 0
        result = tool(4, 'discover_visual_references', {'briefing': 'Curso fictício de aquarela',
            'target_format': 'instagram_post', 'client_mode': 'web', 'decision_fallback_mode': 'deterministic_mock'})
        assert result['decision_engine_source'] == 'deterministic_mock' and result['candidate_origin'] == 'synthetic'
        assert result['candidates'] and result['telemetry']['board_html_path'] is None
        consent = tool(5, 'phoenix_profile_consent', {'purpose': 'personalization', 'granted': True})
        assert consent['consent']['granted']
        signal_result = tool(6, 'phoenix_profile_signal', {'id': 'probe-signal', 'kind': 'choice',
            'version_id': 'v1', 'scope': {'type': 'campaign', 'id': 'probe'}, 'source': 'simulation',
            'person_statement': 'Prefiro aquarela.', 'agent_interpretation': 'Preferência pela técnica.',
            'preference': {'key': 'visual', 'value': 'aquarela', 'confidence': 'confirmed'}})
        assert signal_result['change']['current']['value'] == 'aquarela'
        profile = tool(7, 'phoenix_profile_read', {})['profile']
        assert any(p['key'] == 'visual' and p['value'] == 'aquarela' for p in profile['preferences'])
        created = tool(11, 'creative_local_create', {
            'base_png_base64':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'layers':[{'id':'title','text':'Primeiro','x':0,'y':0,'font_size_px':12,'color_hex':'#123456','font_family':'serif'}]})
        snap = created['snapshot']
        edited = tool(12, 'creative_local_edit_text', {'piece_id':snap['piece_id'], 'expected_version_id':snap['version_id'], 'layer_id':'title', 'text':'Revisado'})
        assert edited['previous_text'] == 'Primeiro'
        restored = tool(13, 'creative_local_read', {'piece_id':snap['piece_id']})
        assert restored['snapshot']['layers'][0]['text'] == 'Revisado' and len(restored['history']) == 2
        caption = tool(14, 'creative_local_set_caption', {'piece_id':snap['piece_id'],
            'expected_version_id':restored['snapshot']['version_id'],
            'caption':{'text':'Proposta de legenda para teste.', 'origin':'agent_proposal'}})
        assert caption['snapshot']['caption']['origin'] == 'agent_proposal'
        assert caption['snapshot']['revision'] == 3
        bound = tool(15, 'phoenix_profile_signal', {'id':'bound-caption-probe','kind':'edit',
            'piece_id':snap['piece_id'], 'version_id':caption['snapshot']['version_id'],
            'scope':{'type':'campaign','id':'probe'}, 'source':'simulation',
            'person_statement':'Revisei a legenda.', 'agent_interpretation':'Edição declarada na peça local.'})
        assert bound['event']['piece_id'] == snap['piece_id']
        assert bound['local_binding']['status'] == 'verified_at_registration'
        codex_version = subprocess.run([codex, '--version'], cwd=root, env=env,
            capture_output=True, text=True, timeout=15, check=True).stdout.strip()
        print(json.dumps({'status':'passed', 'scope':'temporary_trusted_project_codex_home',
            'codex_cli': codex_version,
            'project_config_sha256': hashlib.sha256((root / '.codex/config.toml').read_bytes()).hexdigest(),
            'built_server_sha256': hashlib.sha256((root / 'prototypes/compor-mcp/dist/server.js').read_bytes()).hexdigest(),
            'tool_count':len(names), 'tools':names, 'model_turn_started':False,
            'network_search_authorized':False, 'ranker':'deterministic_mock', 'origin':'synthetic',
            'candidate_count':len(result['candidates']), 'html_created':False,
            'skill_versions':skill_versions, 'loaded_skill_content_sha256':loaded['contentSha256'],
            'unconsented_curated_search_blocked':True,
            'profile_consent_signal_and_read':True, 'synthetic_creative_create_edit_history':True,
            'synthetic_caption_versioned':True, 'profile_event_bound_to_local_version':True}, ensure_ascii=False, indent=2))
    finally:
        try: proc.stdin.close()
        except OSError: pass
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try: proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
        try: os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError: pass
