#!/usr/bin/env python3
"""Compare an offline, metadata-only migration inventory with immutable Git blobs.

This is an evidence aid, not a migration planner or a production authorization.
It never connects to a database or emits SQL. See docs/quality/migration-evidence.md.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

VERSION = re.compile(r'^[0-9]{14}$')
NAME = re.compile(r'^([0-9]{14})_([a-z0-9_]+)\.sql$')
SHA = re.compile(r'^[0-9a-f]{64}$')
COMMIT = re.compile(r'^[0-9a-f]{40}$')
KEY = re.compile(r'^[a-zA-Z0-9_./:(), -]{1,300}$')
MAX_EVIDENCE = 4 * 1024 * 1024


class EvidenceError(ValueError):
    pass


def git(repo, *args):
    env = {**os.environ, 'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_TERMINAL_PROMPT': '0'}
    try:
        return subprocess.run(['git', '-C', str(repo), *args], env=env, check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise EvidenceError('objeto Git indisponível ou inválido; obter histórico completo sem substituir os commits') from error


def manifest(repo, commit):
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
        raise EvidenceError('commit deve ser SHA completo de 40 caracteres')
    if git(repo, 'rev-parse', '--verify', f'{commit}^{{commit}}').decode().strip() != commit:
        raise EvidenceError('SHA não identifica diretamente um commit')
    output = git(repo, 'ls-tree', '-rz', '--full-tree', commit, '--', 'supabase/migrations')
    files = {}
    for item in output.split(b'\0'):
        if not item:
            continue
        header, path = item.split(b'\t', 1)
        mode, kind, _ = header.decode('ascii').split(' ')
        try:
            filename = path.decode('ascii').removeprefix('supabase/migrations/')
        except UnicodeDecodeError as error:
            raise EvidenceError('caminho de migration inválido') from error
        match = NAME.fullmatch(filename)
        if mode != '100644' or kind != 'blob' or not match or match.group(1) in files:
            raise EvidenceError('arquivo de migration inválido, não regular ou versão duplicada')
        data = git(repo, 'show', f'{commit}:supabase/migrations/{filename}')
        files[match.group(1)] = {'filename': filename, 'sha256': hashlib.sha256(data).hexdigest()}
    if not files:
        raise EvidenceError('nenhuma migration encontrada no commit')
    return files


def records(group, kind):
    if not isinstance(group, dict) or set(group) != {'status', 'total_rows', 'entries'}:
        raise EvidenceError(f'inventário {kind} inválido')
    status, total, entries = group['status'], group['total_rows'], group['entries']
    if status not in ('available', 'absent', 'unverified') or type(total) is not int or total < 0 or not isinstance(entries, list):
        raise EvidenceError(f'inventário {kind} inválido')
    if status != 'available' and (total or entries):
        raise EvidenceError(f'inventário {kind} não disponível contém dados')
    if status == 'available' and total != len(entries):
        raise EvidenceError(f'inventário {kind} incompleto ou com linhas omitidas')
    found = {}
    for row in entries:
        required = {'version', 'filename', 'source_commit', 'sha256'} if kind == 'legacy' else {'version'}
        if not isinstance(row, dict) or set(row) != required or not isinstance(row['version'], str) or not VERSION.fullmatch(row['version']):
            raise EvidenceError(f'linha {kind} inválida')
        version = row['version']
        if version in found:
            raise EvidenceError(f'versão {kind} duplicada')
        if kind == 'legacy':
            match = NAME.fullmatch(row['filename']) if isinstance(row['filename'], str) else None
            if not match or match.group(1) != version or not isinstance(row['sha256'], str) or not SHA.fullmatch(row['sha256']) or not isinstance(row['source_commit'], str) or not COMMIT.fullmatch(row['source_commit']):
                raise EvidenceError('linha de auditoria inválida')
        found[version] = row
    return status, found


def catalog_map(rows):
    if not isinstance(rows, list) or not rows:
        raise EvidenceError('inventário de catálogo ausente ou vazio')
    result = {}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'key', 'sha256'} or not isinstance(row['key'], str) or not KEY.fullmatch(row['key']) or not isinstance(row['sha256'], str) or not SHA.fullmatch(row['sha256']):
            raise EvidenceError('entrada de catálogo inválida')
        if row['key'] in result:
            raise EvidenceError('chave de catálogo duplicada')
        result[row['key']] = row['sha256']
    return result


def inspect(repo, commit, data):
    if not isinstance(data, dict) or set(data) != {'format_version', 'legacy', 'native', 'catalog'} or type(data['format_version']) is not int or data['format_version'] != 1:
        raise EvidenceError('formato de evidência inválido')
    files = manifest(repo, commit)
    legacy_status, legacy = records(data['legacy'], 'legacy')
    native_status, native = records(data['native'], 'native')
    issues = []
    if legacy_status == 'unverified' or native_status == 'unverified':
        issues.append('ao menos um histórico não pôde ser lido com segurança')
    if legacy_status == 'absent':
        issues.append('auditoria legada ausente não prova ausência de migrations ou alterações manuais')
    if native_status == 'absent':
        issues.append('histórico nativo ausente não prova ausência de mudanças manuais')
    if native_status == 'absent' and legacy:
        issues.append('histórico CLI ausente com auditoria legada presente: db push pode reaplicar migrations')
    for version, row in sorted(legacy.items()):
        expected = files.get(version)
        if not expected:
            issues.append(f'versão legada {version} não existe no commit')
            continue
        if row['filename'] != expected['filename'] or row['sha256'] != expected['sha256']:
            issues.append(f'nome ou hash legado diverge no commit: {version}')
        source = row['source_commit']
        try:
            if git(repo, 'rev-parse', '--verify', f'{source}^{{commit}}').decode().strip() != source:
                raise EvidenceError('objeto de origem inválido')
            raw = git(repo, 'show', f"{source}:supabase/migrations/{row['filename']}")
        except EvidenceError:
            issues.append(f'commit ou arquivo de origem indisponível: {version}')
            continue
        if hashlib.sha256(raw).hexdigest() != row['sha256']:
            issues.append(f'hash do commit de origem diverge: {version}')
        try:
            git(repo, 'merge-base', '--is-ancestor', source, commit)
        except EvidenceError:
            issues.append(f'ancestralidade da origem não demonstrada: {version}')
    for version in sorted(native):
        if version not in files:
            issues.append(f'versão nativa {version} não existe no commit')
    missing_native = sorted(set(legacy) - set(native))
    native_only = sorted(set(native) - set(legacy))
    if missing_native:
        issues.append('versões na auditoria legada ausentes do histórico CLI: ' + ', '.join(missing_native))
    if native_only:
        issues.append('versões apenas no histórico CLI exigem evidência independente: ' + ', '.join(native_only))
    versions = sorted(files)
    for label, applied in (('legado', legacy), ('CLI', native)):
        present = set(applied) & set(files)
        if present and present != set(versions[:len(present)]):
            issues.append(f'histórico {label} não é prefixo da ordem nominal; revisar ordem efetiva')
    catalog = data['catalog']
    if not isinstance(catalog, dict) or set(catalog) != {'reference', 'observed'}:
        raise EvidenceError('comparação de catálogo inválida')
    expected, observed = catalog_map(catalog['reference']), catalog_map(catalog['observed'])
    if expected != observed:
        issues.append('catálogo capturado difere da referência: revisar itens ausentes, adicionais ou alterados')
    return {
        'commit': commit,
        'migration_count': len(files),
        'legacy_status': legacy_status,
        'native_status': native_status,
        'legacy_count': len(legacy),
        'native_count': len(native),
        'catalog_items_reference': len(expected),
        'catalog_items_observed': len(observed),
        'issues': issues,
        'safe_to_apply': False,
        'limitations': [
            'Igualdade de histórico e hashes não prova que SQL foi aplicado, nem a ordem real.',
            'A comparação de catálogo cobre somente itens fornecidos e não prova identidade, completude, privilégios ou ausência de deriva.',
            'Não execute repair, baseline, migrações ou habilitação automática a partir deste relatório.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--evidence', required=True, type=Path)
    args = parser.parse_args()
    if args.evidence.is_symlink() or not args.evidence.is_file() or args.evidence.stat().st_size > MAX_EVIDENCE:
        raise EvidenceError('evidência ausente, simbólica ou grande demais')
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise EvidenceError('chave JSON duplicada')
            result[key] = value
        return result
    data = json.loads(args.evidence.read_text(encoding='utf-8'), object_pairs_hook=unique_object)
    report = inspect(args.repo, args.commit, data)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    # Never return a shell success that could be mistaken for deployment approval.
    sys.exit(1 if report['issues'] else 3)


if __name__ == '__main__':
    try:
        main()
    except (EvidenceError, OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f'Evidência rejeitada: {exc}', file=sys.stderr)
        sys.exit(2)
