#!/usr/bin/env python3
"""Prepare the explicit-model migration/proof for the dedicated pilot only."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from prepare_compor_migrations import MIGRATIONS, git
import prepare_studio_migrations as studio
import prepare_image_26_migration as image

ROOT = Path(__file__).resolve().parent.parent
NAME = '20261105000015_usage_model_v3.sql'
SOURCE_COMMIT = 'ea0424907af132243ce040d0edfd8f47b8304955'
READ_COMMIT = 'cbb1e027bfec06783c13da51f2c38e6dc4ee8ca0'
DIGEST = 'd0b672c2454e8275a899480dbe852e1e5ef1fc3cf6a1d422e96c26ec0fa799c3'
TABLES = studio.BASE_TABLES + studio.NEW_TABLES + ['public.usage_measurements', 'public.image_tool_reservations', 'public.image_tool_executions', 'public.image_tool_result_submissions']


def content():
    data = git('show', f'{READ_COMMIT}:supabase/migrations/{NAME}')
    if hashlib.sha256(data).hexdigest() != DIGEST:
        raise ValueError('migração difere do blob revisado')
    return data.decode()


def audit_guard(applied):
    rows = studio.audit_rows(True)
    if applied:
        rows += f",\n('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}')"
    actual = 'SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied'
    return "DO $$ BEGIN IF EXISTS ((" + actual + ' EXCEPT ALL VALUES\n' + rows + ') UNION ALL (VALUES\n' + rows + ' EXCEPT ALL ' + actual + ")) THEN RAISE EXCEPTION 'unexpected migration audit'; END IF; END $$;\n"


def legacy_specs():
    sources = []
    for name, commit, digest in [('20261103000009_usage_measurements.sql', image.BASE_COMMIT, MIGRATIONS['20261103000009_usage_measurements.sql']), (image.NAME, image.READ_COMMIT, image.DIGEST)]:
        data = git('show', f'{commit}:supabase/migrations/{name}')
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('origem da medição legada mudou')
        sources.append(data.decode())
    return studio.function_specs(sources)


def model_guard(applied):
    model = "model in ('gpt-6-astra','gpt-6.1-terra')" if applied else "model='gpt-6-astra'"
    constraint = 'usage_measurements_model_v3_check' if applied else 'usage_measurements_model_v2_check'
    return """CREATE TEMP TABLE expected_usage_model(part text,model text,
 CHECK ((part in ('agent','agent_resume') and """ + model + """) or (part='image' and model in ('gpt-image-2.5-flare','gpt-image-2.6-flare')))) ON COMMIT DROP;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.usage_measurements'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%model%')<>1
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.usage_measurements'::regclass AND c.conname='""" + constraint + """'
   AND pg_get_constraintdef(c.oid)=(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='pg_temp.expected_usage_model'::regclass AND contype='c'))
 THEN RAISE EXCEPTION 'unexpected usage model constraint'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.usage_measurements'::regclass)<>1
  OR NOT has_table_privilege('authenticated','public.usage_measurements','SELECT')
  OR has_table_privilege('authenticated','public.usage_measurements','INSERT,UPDATE,DELETE')
  OR has_any_column_privilege('authenticated','public.usage_measurements','INSERT,UPDATE')
  OR has_table_privilege('anon','public.usage_measurements','SELECT,INSERT,UPDATE,DELETE')
  OR has_any_column_privilege('anon','public.usage_measurements','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'unexpected usage permissions'; END IF;
END $$;
DROP TABLE pg_temp.expected_usage_model;
"""


def prefix(applied):
    value = studio.audit_prefix().replace('\\set ON_ERROR_STOP on\n', studio.CONNECTION_EVIDENCE, 1)
    value += "SET LOCAL statement_timeout='30s';\nLOCK TABLE ONLY " + ','.join(TABLES) + ' IN SHARE ROW EXCLUSIVE MODE;\n'
    if not applied:
        value += 'LOCK TABLE ONLY public.usage_measurements IN ACCESS EXCLUSIVE MODE;\n'
    return value + studio.table_guard(TABLES) + studio.column_guard(True) + audit_guard(applied) + studio.function_guard(legacy_specs()) + model_guard(applied)


def prepare():
    data = content()
    before = prefix(False) + "DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='start_usage_measurement_v3') THEN RAISE EXCEPTION 'v3 already exists; inspect before retry'; END IF; END $$;\n"
    after = studio.function_guard({**legacy_specs(), **studio.function_specs([data])}) + model_guard(True)
    after += f"INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) VALUES('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}');\n"
    after += audit_guard(True) + 'SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n'
    return (before + data + after).encode()


def prepare_proof():
    data = content()
    old_body = (ROOT / 'supabase/tests/studio_rls_rollback_body.sql').read_text()
    if not old_body.endswith('RESET ROLE;\nROLLBACK;\n'):
        raise ValueError('estrutura da prova anterior mudou')
    old_body = old_body.removesuffix('ROLLBACK;\n')
    body = (ROOT / 'supabase/tests/usage_model_v3_rls_body.sql').read_text()
    before = prefix(True) + studio.function_guard(studio.function_specs([data])) + studio.snapshot_sql(TABLES, False)
    before += "SET LOCAL compor_studio_proof.guarded='true';\n"
    after = studio.snapshot_sql(TABLES, True).replace('STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK', 'USAGE_MODEL_V3_RLS_CHECKS_PASSED_AND_ROLLED_BACK')
    return (before + old_body + body + after).encode()


def main():
    args = sys.argv[1:]
    proof = bool(args and args[0] in ('--proof', '--verify-proof'))
    data = prepare_proof() if proof else prepare()
    if len(args) == 2 and args[0] in ('--verify', '--verify-proof'):
        path = Path(args[1])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes() != data:
            raise ValueError('arquivo SQL difere do pacote revisado')
        print(hashlib.sha256(data).hexdigest())
        return
    if args not in ([], ['--proof']):
        raise ValueError('uso: prepare_usage_model_v3_migration.py [--proof | --verify /apply.sql | --verify-proof /proof.sql]')
    os.umask(0o077)
    path = Path(tempfile.mkdtemp(prefix='compor-usage-v3-proof-' if proof else 'compor-usage-v3-migration-')) / ('proof.sql' if proof else 'apply.sql')
    path.write_bytes(data)
    print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'source_commit': SOURCE_COMMIT, 'migration_sha256': DIGEST, 'expected_audit_before': 15, 'expected_audit_after': 16}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Preparação falhou: {error}', file=sys.stderr)
        sys.exit(1)
