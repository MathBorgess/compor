"""One native visual-transport probe; supplied plan, never creative-quality evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
spec = importlib.util.spec_from_file_location('frozen_compor_runtime', BASE / 'runtime/runner-e2.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    out = HERE / 'transport-probe-01'
    out.mkdir(exist_ok=False)
    source = BASE / 'runs/e2-dev-mentoria-terra-low-01'
    piece = json.loads((source / 't3-artifacts/envelope.original.json').read_text())['directions'][0]['composition_plan']
    assets = json.loads((source / 'assets.json').read_text())
    context = {'assets': {key: {'path': value, 'sha256': sha(value)} for key, value in assets.items()},
               'output_root': str(out / 'evidence'), 'renderer_sha256': sha(BASE / 'render/renderer.py')}
    runtime.save(out / 'context.json', context)
    args = SimpleNamespace(model='gpt-6.1-terra', effort='low', guidance='focused_v2')
    _, config = runtime.cli_options(args, shutil.which('node'), BASE / 'runtime/stdio_bridge.py',
                                    HERE / 'preview_stdio.mjs', out)
    config.update({
        'developer_instructions': 'Ensaio sintético de transporte visual. Use somente preview_creative do MCP compor_benchmark e os dados fornecidos; sem arquivos, rede ou outras ferramentas. Não gere imagens nem alegue ação humana.',
        'mcp_servers.compor_benchmark.enabled_tools': ['preview_creative'],
        'mcp_servers.compor_benchmark.env.COMPOR_PREVIEW_CONTEXT': str(out / 'context.json'),
        'mcp_servers.compor_benchmark.env.COMPOR_PREVIEW_CONTEXT_SHA256': sha(out / 'context.json'),
        'mcp_servers.compor_benchmark.env.COMPOR_PREVIEW_PYTHON': '/Users/matheusborges/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
        'mcp_servers.compor_benchmark.env.COMPOR_PREVIEW_WORKER': str(HERE / 'preview_worker.py'),
        'mcp_servers.compor_benchmark.env.COMPOR_PREVIEW_WORKER_SHA256': sha(HERE / 'preview_worker.py'),
    })
    prompt = ('Este é um teste sintético de entrega de pixels, não uma tarefa criativa. '
              'Chame preview_creative uma única vez com slot D1 e o snapshot abaixo, sem alterá-lo. '
              'Depois descreva o que efetivamente recebeu: estado do diagnóstico, texto da marca e CTA e três detalhes visíveis na região da imagem. '
              'Se pixels não estiverem disponíveis, diga isso. Não alegue aprovação, utilidade real ou conclusão humana.\n' + json.dumps(piece, ensure_ascii=False))
    runtime.save(out / 'input.json', {'synthetic': True, 'purpose': 'transport_only_supplied_plan', 'prompt': prompt})
    paths = [HERE / name for name in ['preview_server.mjs', 'preview_stdio.mjs', 'preview_worker.py', 'probe.py']]
    paths += [BASE / 'runtime/runner-e2.py', BASE / 'runtime/stdio_bridge.py', BASE / 'render/renderer.py']
    paths += list((BASE.parents[1] / 'dist').glob('*.js'))
    runtime.save(out / 'freeze.json', {'files': {str(p): sha(p) for p in paths}, 'configuration': config,
                                     'limitation': 'Direct local adapter with hashes, no snapshot copy; one transport probe, no model comparison.'})
    options = ['--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--json', '--model', args.model]
    for key, value in config.items():
        options += ['-c', key + '=' + json.dumps(value, ensure_ascii=False)]
    cwd = Path(tempfile.mkdtemp(prefix='compor-e3-probe-'))
    result = runtime.execute([shutil.which('codex'), 'exec', *options, '--sandbox', 'read-only', '-'], prompt,
                             cwd, runtime.subprocess_env(), 180)
    events = runtime.decode_events(result.pop('stdout'))
    result['stderr'] = result['stderr'].replace(str(Path.home()), '<HOME>').replace(str(cwd), '<RUN_CWD>')
    runtime.save(out / 'events.json', {'events': events, **result})
    thread = next((e.get('thread_id') for e in events if e.get('type') == 'thread.started'), None)
    rollout = runtime.own_rollout(thread, runtime.subprocess_env()) if thread else None
    metadata = runtime.rollout_evidence(rollout, cwd) if rollout else None
    runtime.save(out / 'result.json', {'scope': 'transport_only', 'native_metadata': metadata,
                                     'assistant_messages': [e['item']['text'] for e in events if e.get('type') == 'item.completed' and e.get('item', {}).get('type') == 'agent_message'],
                                     'exit_code': result['exit_code'], 'elapsed_ms': result['wall_clock_ms'],
                                     'frozen_files_unchanged': all(sha(p) == h for p, h in json.loads((out / 'freeze.json').read_text())['files'].items())})
    cwd.rmdir()
    print(json.dumps({'exit_code': result['exit_code'], 'output': str(out)}))
    return result['exit_code']


if __name__ == '__main__':
    raise SystemExit(main())
