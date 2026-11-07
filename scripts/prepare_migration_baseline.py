#!/usr/bin/env python3
"""Generate the one-time reviewed legacy-history and migration-latch bootstrap.

No network access and no real project data. The output is deliberately tied to
an immutable commit, and must only be executed after independently identifying
the target project and using verified TLS. Re-execution refuses existing state.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys

from pglast import split
from prepare_provider_call_ids_migration import audit_guard

ROOT = Path(__file__).resolve().parent.parent
TUPLE = re.compile(r"\('([0-9]{14})','([0-9]{14}_[a-z0-9_]+\.sql)','([a-f0-9]{40})','([a-f0-9]{64})'\)")
SHA = re.compile(r'^[a-f0-9]{40}$')


def quote_text(value: str) -> str:
    tag = '$compor_' + hashlib.sha256(value.encode('utf-8')).hexdigest()[:20] + '$'
    if tag in value:
        raise ValueError('unexpected dollar quote collision')
    return tag + value + tag


def prepare(commit: str) -> str:
    if not SHA.fullmatch(commit):
        raise ValueError('commit must be a full immutable SHA')
    git_env = {**os.environ, 'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_TERMINAL_PROMPT': '0'}
    resolved = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--verify', f'{commit}^{{commit}}'], text=True, env=git_env).strip()
    if resolved != commit:
        raise ValueError('commit does not identify a commit directly')
    pairs = TUPLE.findall(audit_guard())
    if len(pairs) != 34 or pairs[:17] != pairs[17:]:
        raise ValueError('legacy audit manifest is unexpected')
    manifest = sorted(pairs[:17])
    if len({version for version, *_ in manifest}) != 17:
        raise ValueError('duplicate legacy migration version')
    rows = []
    for version, filename, _source, digest in manifest:
        raw = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{commit}:supabase/migrations/{filename}'], env=git_env)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError('migration differs from reviewed legacy audit')
        statements = split(raw.decode('utf-8'), with_parser=False)
        if not statements:
            raise ValueError('empty legacy migration')
        name = filename[15:-4]
        array = 'ARRAY[' + ','.join(quote_text(item) for item in statements) + ']::text[]'
        rows.append(f"({quote_text(version)},{quote_text(name)},{array})")
    bootstrap = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{commit}:supabase/automation/migration-latch-bootstrap.sql'], env=git_env).decode('utf-8')
    if bootstrap.count('BEGIN;\n') != 1 or bootstrap.count('COMMIT;\n') != 1:
        raise ValueError('unexpected latch bootstrap structure')
    bootstrap = bootstrap.replace('BEGIN;\n', '', 1).replace('COMMIT;\n', '', 1)
    header = r'''\set ON_ERROR_STOP on
-- SQL identity checks do not identify the Supabase project. Independently
-- verify the project, pooler endpoint and TLS before running this file.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL enable_indexscan = off;
SET LOCAL enable_indexonlyscan = off;
SET LOCAL enable_bitmapscan = off;
DO $lock$
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(1129270610,1296648001)
  THEN RAISE EXCEPTION 'another migration transaction is active'; END IF;
END
$lock$;
DO $baseline$
BEGIN
  IF pg_catalog.current_database() <> 'postgres' OR current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolbypassrls)
  THEN RAISE EXCEPTION 'unexpected database or role'; END IF;
  IF pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
    OR pg_catalog.to_regnamespace('compor_migration_control') IS NOT NULL
  THEN RAISE EXCEPTION 'baseline or latch exists; inspect before proceeding'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_roles r ON r.rolname=current_user
    WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
      AND n.nspowner=r.oid AND c.relowner=r.oid AND c.relrowsecurity AND NOT c.relforcerowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite w WHERE w.ev_class=c.oid)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid)
      AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
      AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type typ ON typ.oid=a.atttypid
        JOIN pg_catalog.pg_namespace tn ON tn.oid=typ.typnamespace
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
          AND a.attnotnull AND tn.nspname='pg_catalog'
          AND ((a.attname IN ('version','filename','source_commit','sha256') AND typ.typname='text')
            OR (a.attname='applied_at' AND typ.typname='timestamptz')))
  ) THEN RAISE EXCEPTION 'unexpected legacy audit structure'; END IF;
END
$baseline$;
LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;
'''
    sql = header + audit_guard() + '''CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES
''' + ',\n'.join(rows) + ';\n' + bootstrap + audit_guard() + '''DO $baseline$
BEGIN
  IF (SELECT count(*) FROM ONLY supabase_migrations.schema_migrations) <> 17
    OR (SELECT count(*) FROM ONLY compor_migration_control.latch WHERE singleton AND run_token IS NULL AND acquired_at IS NULL) <> 1
  THEN RAISE EXCEPTION 'baseline verification failed'; END IF;
END
$baseline$;
COMMIT;
'''
    return f'-- Generated from commit {commit}\n' + sql


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: prepare_migration_baseline.py FULL_COMMIT_SHA', file=sys.stderr)
        return 2
    try:
        sys.stdout.write(prepare(sys.argv[1]))
    except Exception as exc:
        print(f'baseline preparation failed: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
