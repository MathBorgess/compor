#!/usr/bin/env python3
"""Prepare the reviewed image-model migration for the dedicated pilot only."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from prepare_compor_migrations import MIGRATIONS, git

SOURCE_COMMIT = '1feceb7531d80cee9a9547d198c1ff218779a700'
BASE_COMMIT = '35925f0b130fb4ed0123d2b460cc42ffe2698c2f'
NAME = '20261105000012_image_model_26.sql'
DIGEST = '6bd71c0eba6f30b1c87bb3125f33257095ac0aa7a458421fa4ac95a829b208a7'


def prepare():
    if git('rev-parse', '--verify', f'{SOURCE_COMMIT}^{{commit}}').decode().strip() != SOURCE_COMMIT:
        raise ValueError('commit de origem inválido')
    expected_paths = [f'supabase/migrations/{name}' for name in MIGRATIONS] + [f'supabase/migrations/{NAME}']
    if git('ls-tree', '-r', '--name-only', SOURCE_COMMIT, '--', 'supabase/migrations').decode().splitlines() != expected_paths:
        raise ValueError('lista de migrações difere do commit revisado')
    for name, digest in {**MIGRATIONS, NAME: DIGEST}.items():
        if hashlib.sha256(git('show', f'{SOURCE_COMMIT}:supabase/migrations/{name}')).hexdigest() != digest:
            raise ValueError(f'hash não corresponde: {name}')
    content = git('show', f'{SOURCE_COMMIT}:supabase/migrations/{NAME}').decode('utf-8')
    rows = ',\n'.join(f"('{name[:14]}','{name}','{BASE_COMMIT}','{digest}')" for name, digest in MIGRATIONS.items())
    prefix = r'''\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SELECT pg_catalog.pg_advisory_xact_lock(1296122704,1129270608);
DO $$
BEGIN
  IF pg_catalog.current_database()<>'postgres' OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'unexpected database or role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.rolname=current_user
    WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
      AND r.rolbypassrls AND n.nspowner=r.oid AND c.relowner=r.oid
      AND c.relrowsecurity AND NOT c.relforcerowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal)
      AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhparent=c.oid OR i.inhrelid=c.oid)
      AND NOT has_schema_privilege('anon',n.oid,'USAGE') AND NOT has_schema_privilege('authenticated',n.oid,'USAGE')
      AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND 1=(SELECT count(*) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p' AND pg_get_constraintdef(k.oid)='PRIMARY KEY (version)')
      AND 1=(SELECT count(*) FROM pg_attrdef d WHERE d.adrelid=c.oid)
      AND 1=(SELECT count(*) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid=c.oid AND a.attname='applied_at' AND pg_get_expr(d.adbin,d.adrelid)='now()')
      AND 5=(SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
      AND 5=(SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
        JOIN pg_namespace tn ON tn.oid=t.typnamespace
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
          AND a.attnotnull AND tn.nspname='pg_catalog'
          AND ((a.attname IN ('version','filename','source_commit','sha256') AND t.typname='text')
            OR (a.attname='applied_at' AND t.typname='timestamptz')))
  ) THEN RAISE EXCEPTION 'unexpected audit table'; END IF;
END $$;
LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;
LOCK TABLE ONLY public.usage_measurements IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE expected_model_check(part text,model text,
 CHECK ((part in ('agent','agent_resume') and model='gpt-6-astra') or (part='image' and model='gpt-image-2.5-flare'))) ON COMMIT DROP;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='start_usage_measurement_v2') THEN
    RAISE EXCEPTION 'RPC v2 already exists';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.usage_measurements'::regclass
      AND c.contype='c' AND pg_get_constraintdef(c.oid) = (
        SELECT pg_get_constraintdef(t.oid) FROM pg_constraint t WHERE t.conrelid='pg_temp.expected_model_check'::regclass AND t.contype='c')) <> 1
     OR (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.usage_measurements'::regclass
       AND c.contype='c' AND pg_get_constraintdef(c.oid) LIKE '%gpt-image-2.5-flare%'
       AND pg_get_constraintdef(c.oid) LIKE '%gpt-6-astra%') <> 1 THEN
    RAISE EXCEPTION 'unexpected model constraint';
  END IF;
'''
    audit_guard = prefix[prefix.index('DO $$'):prefix.index('LOCK TABLE ONLY compor_migration_audit.applied')]
    lock = 'LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;\n'
    prefix = prefix.replace(lock, lock + audit_guard, 1)
    prefix += "  IF EXISTS (\n    (SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied EXCEPT ALL VALUES\n" + rows + ")\n    UNION ALL\n    (VALUES\n" + rows + " EXCEPT ALL SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied)\n  ) THEN RAISE EXCEPTION 'unexpected migration audit'; END IF;\nEND $$;\n"
    suffix = ("\nINSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) VALUES "
              f"('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}');\n"
              "SELECT version,filename,sha256 FROM ONLY compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n")
    return (prefix + content + suffix).encode('utf-8')


def main():
    data = prepare()
    if len(sys.argv) == 3 and sys.argv[1] == '--verify':
        path = Path(sys.argv[2])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes() != data:
            raise ValueError('arquivo SQL difere do pacote revisado')
        print(hashlib.sha256(data).hexdigest())
        return
    if len(sys.argv) != 1:
        raise ValueError('uso: prepare_image_26_migration.py [--verify /caminho/apply.sql]')
    os.umask(0o077)
    path = Path(tempfile.mkdtemp(prefix='compor-image26-migration-')) / 'apply.sql'
    path.write_bytes(data)
    print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'source_commit': SOURCE_COMMIT, 'migration_sha256': DIGEST}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Preparação falhou: {error}', file=sys.stderr)
        sys.exit(1)
