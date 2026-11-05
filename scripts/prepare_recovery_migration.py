#!/usr/bin/env python3
"""Prepare the reviewed recovery migration for the dedicated pilot only."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from prepare_compor_migrations import MIGRATIONS, git
import prepare_image_26_migration as image

SOURCE_COMMIT = '8c28f98af059463ccdfd8d4a46adcb859ea112fd'
NAME = '20261103000011_agent_session_recovery.sql'
DIGEST = 'e31e9d29edd88c1bbed8877a00a0b744de99973c97f8d3cea4c2380438d2925a'


def prepare():
    if git('rev-parse', '--verify', f'{SOURCE_COMMIT}^{{commit}}').decode().strip() != SOURCE_COMMIT:
        raise ValueError('commit de origem inválido')
    content = git('show', f'{SOURCE_COMMIT}:supabase/migrations/{NAME}')
    if hashlib.sha256(content).hexdigest() != DIGEST:
        raise ValueError('hash da migração não corresponde')
    # Reuse the audited table/role guard from the independently reviewed 2.6 bundle.
    # Fail closed if its structure changes.
    prior = image.prepare().decode('utf-8')
    anchor = 'LOCK TABLE ONLY public.usage_measurements IN ACCESS EXCLUSIVE MODE;\n'
    if prior.count(anchor) != 1:
        raise ValueError('pacote anterior tem estrutura inesperada')
    prefix = prior.split(anchor, 1)[0]
    if prefix.count('unexpected audit table') != 2 or prefix.count('LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;') != 1:
        raise ValueError('guardas da auditoria não correspondem')
    rows = [f"('{name[:14]}','{name}','{image.BASE_COMMIT}','{digest}')" for name, digest in MIGRATIONS.items()]
    rows.append(f"('{image.NAME[:14]}','{image.NAME}','{image.SOURCE_COMMIT}','{image.DIGEST}')")
    expected = ',\n'.join(rows)
    prefix += r'''LOCK TABLE ONLY public.projects, public.agent_attempts IN ACCESS SHARE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('bind_agent_session_recovery','get_agent_session_recovery'))
    OR to_regclass('public.agent_session_recovery') IS NOT NULL THEN
    RAISE EXCEPTION 'recovery objects already exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='public' AND p.oid=to_regprocedure('public.start_usage_measurement_v2(uuid,uuid,text,uuid)')
      AND p.prosecdef AND r.rolname=current_user AND p.proconfig=ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'image migration unavailable or changed';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='public' AND c.relname IN ('projects','agent_attempts') AND c.relkind='r'
      AND c.relrowsecurity AND r.rolname=current_user
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid)) <> 2 THEN
    RAISE EXCEPTION 'unexpected referenced tables';
  END IF;
  IF (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid
      WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
      AND ((c.relname='projects' AND a.attname IN ('id','owner_id') AND t.typname='uuid')
        OR (c.relname='agent_attempts' AND ((a.attname IN ('id','owner_id','project_id','idempotency_key') AND t.typname='uuid')
          OR (a.attname='state' AND t.typname='text'))))) <> 7 THEN
    RAISE EXCEPTION 'unexpected referenced columns';
  END IF;
'''
    prefix += "  IF EXISTS (\n    (SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied EXCEPT ALL VALUES\n" + expected + ")\n    UNION ALL\n    (VALUES\n" + expected + " EXCEPT ALL SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied)\n  ) THEN RAISE EXCEPTION 'unexpected migration audit'; END IF;\nEND $$;\n"
    suffix = ("\nINSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) VALUES "
              f"('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}');\n"
              "SELECT version,filename,sha256 FROM ONLY compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n")
    return (prefix + content.decode('utf-8') + suffix).encode('utf-8')


def main():
    data = prepare()
    if len(sys.argv) == 3 and sys.argv[1] == '--verify':
        path = Path(sys.argv[2])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes() != data:
            raise ValueError('arquivo SQL difere do pacote revisado')
        print(hashlib.sha256(data).hexdigest())
        return
    if len(sys.argv) != 1:
        raise ValueError('uso: prepare_recovery_migration.py [--verify /caminho/apply.sql]')
    os.umask(0o077)
    path = Path(tempfile.mkdtemp(prefix='compor-recovery-migration-')) / 'apply.sql'
    path.write_bytes(data)
    print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'source_commit': SOURCE_COMMIT, 'migration_sha256': DIGEST}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Preparação falhou: {error}', file=sys.stderr)
        sys.exit(1)
