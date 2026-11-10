#!/usr/bin/env python3
"""Release one migrated source snapshot; credentials stay in the environment."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request

PROJECT = 'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS'
TEAM = 'team_2Z6EPeDxnpAcymrhoWq1rxOn'
REPOSITORY = 'MathBorgess/compor'
MAX_RESPONSE = 1024 * 1024


class ReleaseError(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_url(url, token=None):
    headers = {'Accept': 'application/json' if token else '*/*', 'User-Agent': 'compor-release'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        with build_opener(NoRedirect).open(Request(url, headers=headers), timeout=10) as response:
            data = response.read(MAX_RESPONSE + 1)
            if response.status != 200 or len(data) > MAX_RESPONSE:
                raise ReleaseError('Resposta HTTP inválida ou acima do limite.')
            return data
    except (HTTPError, URLError, TimeoutError) as error:
        # Neither an authenticated response body nor request headers are diagnostics.
        raise ReleaseError('Não foi possível confirmar o estado remoto.') from error


def read_json(url, token):
    try:
        result = json.loads(read_url(url, token))
    except (ValueError, UnicodeError) as error:
        raise ReleaseError('Resposta JSON inválida.') from error
    if not isinstance(result, dict):
        raise ReleaseError('Resposta JSON inesperada.')
    return result


def require_current_main(commit, token):
    ref = read_json(f'https://api.github.com/repos/{REPOSITORY}/git/ref/heads/main', token)
    target = ref.get('object')
    if not isinstance(target, dict) or target.get('sha') != commit:
        raise ReleaseError('A main mudou; esta execução não pode publicar um snapshot antigo.')


def deployment_url(value):
    if not isinstance(value, str):
        raise ReleaseError('URL do deployment ausente.')
    try:
        url = urlsplit(value)
    except ValueError as error:
        raise ReleaseError('URL do deployment inválida.') from error
    if (url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.vercel.app')
            or url.netloc != url.hostname or url.path not in ('', '/') or url.query or url.fragment):
        raise ReleaseError('URL do deployment inválida.')
    return f'https://{url.hostname}'


def cli_json(cli, args, stage, timeout):
    child_env = {key: value for key, value in os.environ.items() if key not in ('GH_TOKEN', 'GITHUB_TOKEN')}
    try:
        result = subprocess.run([cli, *args, '--cwd', str(stage), '--json'], env=child_env,
                                capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError('A chamada à Vercel não foi confirmada; confira o deployment antes de repetir.') from error
    if result.returncode:
        raise ReleaseError('A Vercel recusou a operação; consulte os logs do build no projeto.')
    if len(result.stdout) > MAX_RESPONSE:
        raise ReleaseError('Resposta da Vercel acima do limite.')
    try:
        value = json.loads(result.stdout)
    except (ValueError, UnicodeError) as error:
        raise ReleaseError('A Vercel não retornou uma confirmação JSON válida.') from error
    if not isinstance(value, dict) or value.get('status', 'ok') != 'ok':
        raise ReleaseError('A Vercel não confirmou a operação.')
    return value


def verify_stage(stage, commit):
    try:
        manifest = json.loads((stage / 'STAGE-MANIFEST.json').read_text())
        if (not isinstance(manifest, dict) or manifest.get('commit') != commit
                or not isinstance(manifest.get('files'), dict) or not manifest['files']):
            raise ReleaseError('Manifesto não corresponde ao commit migrado.')
        for name, digest in manifest['files'].items():
            path = stage / name
            if (not isinstance(name, str) or not name.startswith('apps/web/') or Path(name).is_absolute() or '..' in Path(name).parts
                    or path.is_symlink() or not path.is_file()
                    or hashlib.sha256(path.read_bytes()).hexdigest() != digest):
                raise ReleaseError('Fonte do deployment difere do manifesto imutável.')
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise ReleaseError('Manifesto do deployment inválido.') from error


def release(cli, stage):
    commit = os.environ.get('GITHUB_SHA', '')
    token = os.environ.get('VERCEL_TOKEN', '')
    github_token = os.environ.get('GH_TOKEN', '')
    if not token or not github_token:
        raise ReleaseError('Configure VERCEL_TOKEN no ambiente production; o token GitHub também é obrigatório.')
    if (not re.fullmatch('[0-9a-f]{40}', commit) or os.environ.get('GITHUB_REF') != 'refs/heads/main'
            or os.environ.get('GITHUB_REPOSITORY') != REPOSITORY
            or os.environ.get('VERCEL_ORG_ID') != TEAM or os.environ.get('VERCEL_PROJECT_ID') != PROJECT):
        raise ReleaseError('Commit, branch ou destino de produção inválido.')
    verify_stage(stage, commit)
    require_current_main(commit, github_token)
    link = stage / '.vercel'
    link.mkdir(mode=0o700, exist_ok=True)
    (link / 'project.json').write_text(json.dumps({'orgId': TEAM, 'projectId': PROJECT}) + '\n')
    created = cli_json(cli, ['deploy', '--prod', '--skip-domain', '--yes',
                            '--meta', f'comporSourceCommit={commit}'], stage, 900)
    deployment = created.get('deployment', created)
    if not isinstance(deployment, dict):
        raise ReleaseError('Deployment não confirmado.')
    deployment_id = deployment.get('id', '')
    if (not isinstance(deployment_id, str) or not re.fullmatch('dpl_[A-Za-z0-9]+', deployment_id)
            or deployment.get('readyState') != 'READY' or deployment.get('target') != 'production'
            or deployment.get('aliasError')):
        raise ReleaseError('Build de produção não está READY; ativação cancelada.')
    url = deployment_url(deployment.get('url'))
    remote = read_json(f'https://api.vercel.com/v13/deployments/{deployment_id}?teamId={TEAM}', token)
    meta = remote.get('meta')
    if (remote.get('id') != deployment_id or remote.get('projectId') != PROJECT
            or remote.get('target') != 'production' or remote.get('readyState') != 'READY'
            or not isinstance(meta, dict) or meta.get('comporSourceCommit') != commit
            or deployment_url(f"https://{remote.get('url', '')}") != url):
        raise ReleaseError('Deployment remoto não corresponde ao projeto e commit migrados.')
    if b'Compor' not in read_url(url) or b'<svg' not in read_url(f'{url}/studio/brand-symbol.svg'):
        raise ReleaseError('Entrada pública ou asset do deployment falhou; ativação cancelada.')
    require_current_main(commit, github_token)
    promoted = cli_json(cli, ['promote', deployment_id, '--yes', '--timeout', '3m'], stage, 240)
    active = promoted.get('deployment', {})
    if (promoted.get('outcome') != 'promoted' or not isinstance(active, dict)
            or active.get('id') != deployment_id or active.get('projectId') != PROJECT):
        raise ReleaseError('Ativação não confirmada; confira o projeto antes de repetir a operação.')
    result = {'commit': commit, 'deployment_id': deployment_id, 'url': url, 'status': 'READY', 'activated': True}
    print(json.dumps(result))
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as stream:
            stream.write(f'\nVercel: [{deployment_id}]({url}), produção READY e ativada. Commit `{commit}`.\n')
    return result


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ReleaseError('Informe CLI e diretório do pacote imutável.')
        release(sys.argv[1], Path(sys.argv[2]).resolve())
    except ReleaseError as error:
        print(f'::error::{error}', file=sys.stderr)
        sys.exit(1)
