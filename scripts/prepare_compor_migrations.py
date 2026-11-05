#!/usr/bin/env python3
"""Prepare a private, reviewable SQL bundle from reviewed Git migration blobs.

No connection or remote write is performed. The source commit must contain the
eleven pinned migrations; changing a migration requires reviewing these hashes.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

MIGRATIONS = {
    '20261103000000_projects.sql': 'ad26b2f1f207e2b826c11522f8903ee5d2e7f280637fab3d7c05c987eb117b09',
    '20261103000001_piece_versions.sql': 'be5327b6e63b438b749c6b4c56abd38fe55f699a52f5203fa4420ce92b692528',
    '20261103000002_agent_attempts.sql': '04817a32f79f0099d1f9395c1fed71c47245a980a8a106a5ad35aa6f3e227145',
    '20261103000003_private_project_images.sql': '824f8ebfa6554271ef10f2a4a65c3b7be7a2d2aec50bca0840a6197ac71c1b0a',
    '20261103000004_image_tool_reservations.sql': '35912893fb38deb9fe078bd315073364fc0a3f488906050247d60b1e6c734efd',
    '20261103000005_image_consent_declarations.sql': '739f37d9e3d6c80c0dd915b4932f9995bc03136b59e52509827cea1bce0e24e7',
    '20261103000006_image_tool_execution_claim.sql': '847bfdfdf6a4a626137c871c385554e122216557f113b95e53360487fd0355c2',
    '20261103000007_image_tool_result_submission.sql': '946d5a869ea0b78a1425f811f71b1243f9aa3f00da269d76bd913a54c9faccdf',
    '20261103000008_agent_attempt_state.sql': 'ab3f92467633364fe2c4058e4dd15d06b5937bbc67faa737c362d1561c92252e',
    '20261103000009_usage_measurements.sql': 'a43299ae674a1a6d9a9ed1e835f9539a960439b9557e9d012d3ec77a7f7cd925',
    '20261103000010_list_piece_image_assets.sql': '1125bc2242b693293ddba5ac9ac67868ccee300b39862dd00563d6d70a6be2a7',
}

def git(*args):
    return subprocess.check_output(['git', *args])

def prepare(commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('informe SHA completo do commit')
    if git('rev-parse', '--verify', f'{commit}^{{commit}}').decode().strip() != commit:
        raise ValueError('commit inexistente')
    files = git('ls-tree', '-r', '--name-only', commit, '--', 'supabase/migrations').decode().splitlines()
    expected = [f'supabase/migrations/{name}' for name in MIGRATIONS]
    if files != expected:
        raise ValueError('a lista de migrações difere da revisada')
    parts = []
    for path, (name, digest) in zip(files, MIGRATIONS.items()):
        data = git('show', f'{commit}:{path}')
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'hash não corresponde: {name}')
        parts.append((name, digest, data.decode('utf-8')))
    # These safeguards are intentionally strict for this dedicated test project.
    # The historical Supabase table being absent is not proof of no manual work.
    sql = [r'''\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SELECT pg_catalog.pg_advisory_xact_lock(1296122704, 1129270608);
DO $$
BEGIN
  IF pg_catalog.current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'unexpected database or role';
  END IF;
  IF pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'migration history now exists; inspect before applying';
  END IF;
  IF pg_catalog.to_regnamespace('compor_migration_audit') IS NOT NULL THEN
    RAISE EXCEPTION 'Compor audit schema already exists; do not repeat';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) THEN
    RAISE EXCEPTION 'public relations already exist; do not apply blindly';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='compor-project-images') THEN
    RAISE EXCEPTION 'Compor bucket already exists; do not apply blindly';
  END IF;
END $$;
CREATE SCHEMA compor_migration_audit;
REVOKE ALL ON SCHEMA compor_migration_audit FROM PUBLIC, anon, authenticated;
CREATE TABLE compor_migration_audit.applied (
  version text PRIMARY KEY, filename text NOT NULL, source_commit text NOT NULL,
  sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE compor_migration_audit.applied ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON compor_migration_audit.applied FROM PUBLIC, anon, authenticated;
''']
    for name, digest, content in parts:
        # Inputs are fixed safe filenames and canonical hashes, not caller input.
        sql.append(f'\n-- {name} sha256:{digest}\n{content}\n')
        sql.append("INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) "
                   f"VALUES ('{name[:14]}','{name}','{commit}','{digest}');\n")
    sql.append("SELECT version, filename, sha256 FROM compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n")
    return ''.join(sql).encode('utf-8')

def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--verify':
        sql = prepare(sys.argv[2])
        path = Path(sys.argv[3])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes() != sql:
            raise ValueError('arquivo SQL não corresponde ao pacote revisado')
        print(hashlib.sha256(sql).hexdigest())
        return
    if len(sys.argv) != 2:
        raise ValueError('uso: prepare_compor_migrations.py SHA_COMPLETO')
    sql = prepare(sys.argv[1])
    os.umask(0o077)
    directory = Path(tempfile.mkdtemp(prefix='compor-migration-'))
    path = directory / 'apply.sql'
    path.write_bytes(sql)
    print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(sql).hexdigest(), 'source_commit': sys.argv[1], 'migrations': len(MIGRATIONS)}))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Preparação falhou: {error}', file=sys.stderr)
        sys.exit(1)
