#!/usr/bin/env python3
"""Prepare/verify the two reviewed studio migrations or their rollback proof.

Never connects to a database. Application and proof wrappers pin the pilot host.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from prepare_compor_migrations import MIGRATIONS, git
import prepare_image_26_migration as image
import prepare_recovery_migration as recovery

ROOT = Path(__file__).resolve().parent.parent
READ_COMMIT = '7a3d50a4cd3f289b84c3e502d80e3a199e37ef87'
SOURCES = [
    ('20261105000013_studio_turn_metadata.sql', '4cc8f9ebe372f5f2ea028c6ff480998778ee99c1', '7d8fd22588e865ebac063c62be57f9bb7e89d3cd24d9beacae705886a1a12c9e'),
    ('20261105000014_version_metadata.sql', '237b1dde1159408a430bd447e7000a4ef176f28a', 'e6b01622c81d2f86d13175c9def11938f932d2c1b9abc44d426d06c5bd5fa62f'),
]
BASE_TABLES = ['auth.users', 'public.projects', 'public.piece_versions', 'public.agent_attempts']
NEW_TABLES = ['public.studio_turns', 'public.studio_action_submissions', 'public.piece_version_metadata']
PREVIOUS_PROOF_SHA = 'e49f6df0f1669179a9d7df2b94b2375cdf14d0ca7f6829e75d5e21cf102e61b7'
CONNECTION_EVIDENCE = '\\set ON_ERROR_STOP on\n\\conninfo\nSELECT ssl,version,cipher,bits FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid();\n'


def blobs():
    result = []
    if git('rev-parse', '--verify', f'{READ_COMMIT}^{{commit}}').decode().strip() != READ_COMMIT:
        raise ValueError('commit de origem inválido')
    for name, _commit, digest in SOURCES:
        data = git('show', f'{READ_COMMIT}:supabase/migrations/{name}')
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'hash não corresponde: {name}')
        result.append(data.decode())
    return result


def audit_rows(include_new=False):
    rows = [(name, image.BASE_COMMIT, digest) for name, digest in MIGRATIONS.items()]
    rows += [(image.NAME, image.SOURCE_COMMIT, image.DIGEST), (recovery.NAME, recovery.SOURCE_COMMIT, recovery.DIGEST)]
    if include_new:
        rows += [(name, commit, digest) for name, commit, digest in SOURCES]
    return ',\n'.join(f"('{name[:14]}','{name}','{commit}','{digest}')" for name, commit, digest in rows)


def audit_guard(include_new=False):
    rows = audit_rows(include_new)
    return "DO $$ BEGIN IF EXISTS (\n(SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied EXCEPT ALL VALUES\n" + rows + ") UNION ALL (VALUES\n" + rows + " EXCEPT ALL SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied)\n) THEN RAISE EXCEPTION 'unexpected migration audit'; END IF; END $$;\n"


def audit_prefix():
    previous = recovery.prepare().decode()
    anchor = 'LOCK TABLE ONLY public.projects, public.agent_attempts IN ACCESS SHARE MODE;\n'
    if previous.count(anchor) != 1:
        raise ValueError('estrutura inesperada do pacote anterior')
    prefix = previous.split(anchor)[0]
    if prefix.count('unexpected audit table') != 2 or prefix.count('LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS EXCLUSIVE MODE;') != 1:
        raise ValueError('guardas da auditoria não correspondem')
    return prefix


def table_guard(tables):
    # Preserve the reviewed managed-auth generated-column exception, and refuse
    # custom executable hooks before any synthetic insert or replacement RPC.
    data = (ROOT / 'supabase/tests/recovery_rls_rollback.sql').read_bytes()
    if hashlib.sha256(data).hexdigest() != PREVIOUS_PROOF_SHA:
        raise ValueError('guarda de tabelas anterior mudou')
    text = data.decode()
    start = text.index('DO $$\nDECLARE affected oid[];')
    end = text.index('\n\n-- Verify the exact reviewed definer bodies', start)
    guard = text[start:end]
    array = 'affected := ARRAY[' + ','.join(f"'{name}'::regclass" for name in tables) + '];'
    guard, count = re.subn(r'affected := ARRAY\[.*?\];', array, guard, count=1, flags=re.S)
    if count != 1 or guard.count('affected[2:5]') != 1:
        raise ValueError('estrutura da guarda de tabelas mudou')
    guard = guard.replace('affected[2:5]', f'affected[2:{len(tables)}]')
    guard = guard.replace('IF EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected) AND relkind',
        "IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=ANY(affected[2:" + str(len(tables)) + "]) AND r.rolname<>current_user)\n     OR EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected) AND relkind")
    guard = guard.replace('WHERE inhparent=ANY(affected)', 'WHERE inhparent=ANY(affected) OR inhrelid=ANY(affected)')
    # ROLLBACK does not undo external callbacks or sequence increments. Index
    # expressions/predicates and access-method/opclass callbacks run on INSERT,
    # including the audit INSERT in the application bundle.
    index_guard = r'''
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive OR c.relkind<>'i')
  ) OR EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=i.indexrelid
    JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND p.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND n.nspname<>'pg_catalog'
  ) OR EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=i.indexrelid
    JOIN pg_operator o ON d.refclassid='pg_operator'::regclass AND o.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=o.oprnamespace
    LEFT JOIN pg_proc p ON p.oid=o.oprcode LEFT JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND (n.nspname<>'pg_catalog' OR pn.nspname IS DISTINCT FROM 'pg_catalog')
  ) OR EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am a ON a.oid=c.relam
    LEFT JOIN pg_proc p ON p.oid=a.amhandler LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND n.nspname IS DISTINCT FROM 'pg_catalog'
  ) OR EXISTS (
    SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indcollation::oid[]) x(collation_id)
    LEFT JOIN pg_collation c ON c.oid=x.collation_id LEFT JOIN pg_namespace n ON n.oid=c.collnamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND x.collation_id<>0 AND n.nspname IS DISTINCT FROM 'pg_catalog'
  ) OR EXISTS (
    SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indclass::oid[]) x(class_id)
    LEFT JOIN pg_opclass c ON c.oid=x.class_id LEFT JOIN pg_namespace cn ON cn.oid=c.opcnamespace
    LEFT JOIN pg_opfamily f ON f.oid=c.opcfamily LEFT JOIN pg_namespace fn ON fn.oid=f.opfnamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND (cn.nspname IS DISTINCT FROM 'pg_catalog' OR fn.nspname IS DISTINCT FROM 'pg_catalog')
  ) OR EXISTS (
    SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indclass::oid[]) x(class_id)
    JOIN pg_opclass c ON c.oid=x.class_id JOIN pg_amproc a ON a.amprocfamily=c.opcfamily
    LEFT JOIN pg_proc p ON p.oid=a.amproc LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND n.nspname IS DISTINCT FROM 'pg_catalog'
  ) OR EXISTS (
    SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indclass::oid[]) x(class_id)
    JOIN pg_opclass c ON c.oid=x.class_id JOIN pg_amop a ON a.amopfamily=c.opcfamily
    LEFT JOIN pg_operator o ON o.oid=a.amopopr LEFT JOIN pg_namespace n ON n.oid=o.oprnamespace
    LEFT JOIN pg_proc p ON p.oid=o.oprcode LEFT JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE i.indrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND (n.nspname IS DISTINCT FROM 'pg_catalog' OR pn.nspname IS DISTINCT FROM 'pg_catalog')
  ) THEN RAISE EXCEPTION 'unexpected index callback, operator, opclass, family, collation or access method'; END IF;
  -- Pinned built-ins need not have pg_depend rows. Inspect function/operator
  -- OIDs in their stored expression trees as well, so nextval and other
  -- volatile built-ins cannot escape rollback through a default/check/policy.
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      AND attnum>0 AND NOT attisdropped AND attidentity<>'')
  OR EXISTS (
    WITH expressions AS (
      SELECT adbin::text AS code FROM pg_attrdef WHERE adrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass])
      UNION ALL SELECT conbin::text FROM pg_constraint WHERE conrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND conbin IS NOT NULL
      UNION ALL SELECT polqual::text FROM pg_policy WHERE polrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND polqual IS NOT NULL
      UNION ALL SELECT polwithcheck::text FROM pg_policy WHERE polrelid=ANY(affected || ARRAY['compor_migration_audit.applied'::regclass]) AND polwithcheck IS NOT NULL
    ), refs AS (
      SELECT m.parts[1] AS kind,m.parts[2]::oid AS target FROM expressions e
      CROSS JOIN LATERAL regexp_matches(e.code,':(funcid|opfuncid|opno) ([0-9]+)','g') AS m(parts)
    )
    SELECT 1 FROM refs r LEFT JOIN pg_operator o ON r.kind='opno' AND o.oid=r.target
    JOIN pg_proc p ON p.oid=CASE WHEN r.kind='opno' THEN o.oprcode::oid ELSE r.target END
    WHERE p.provolatile='v' AND p.oid<>'pg_catalog.gen_random_uuid()'::regprocedure
  ) THEN RAISE EXCEPTION 'unexpected identity or volatile default, constraint or policy'; END IF;
'''
    if guard.count('END $$;') != 1:
        raise ValueError('fim da guarda de tabelas mudou')
    guard = guard.replace('END $$;', index_guard + 'END $$;')
    return guard + '\n'


def column_guard(include_new=False):
    shapes = {
        'projects': [('id','uuid',True),('owner_id','uuid',True),('title','text',True),('created_at','timestamp with time zone',True)],
        'piece_versions': [('project_id','uuid',True),('piece_id','uuid',True),('version','integer',True),('content','jsonb',True),('created_at','timestamp with time zone',True)],
        'agent_attempts': [('id','uuid',True),('owner_id','uuid',True),('project_id','uuid',True),('idempotency_key','uuid',True),('state','text',True),('created_at','timestamp with time zone',True),('updated_at','timestamp with time zone',True)],
    }
    if include_new:
        shapes['projects'].append(('revision','integer',True))
        shapes['studio_turns'] = [(n,'uuid',True) for n in ('request_id','owner_id','project_id','attempt_id')] + [('input_digest','text',True),('state','text',True),('session_binding','text',False),('session_expires_at','timestamp with time zone',False),('prior_turn_id','text',False),('turn_id','text',False),('initial_input_tokens','bigint',False),('initial_output_tokens','bigint',False),('created_at','timestamp with time zone',True),('updated_at','timestamp with time zone',True)]
        shapes['studio_action_submissions'] = [(n,'uuid',True) for n in ('id','owner_id','project_id','request_id')] + [(n,'text',True) for n in ('turn_id','call_id','action_digest','result_digest','state')] + [('created_at','timestamp with time zone',True)]
        shapes['piece_version_metadata'] = [('project_id','uuid',True),('piece_id','uuid',True),('version','integer',True),('base_version','integer',False),('approval_state','text',True),('approval_origin_version','integer',False),('approved_by','uuid',False),('approved_at','timestamp with time zone',False),('revision','integer',True)]
    expected = ',\n'.join(f"('{table}','{name}','{kind}',{str(required).lower()})" for table, columns in shapes.items() for name, kind, required in columns)
    names = ','.join(f"'{table}'" for table in shapes)
    actual = "SELECT c.relname::text,a.attname::text,format_type(a.atttypid,a.atttypmod),a.attnotnull FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN (" + names + ") AND a.attnum>0 AND NOT a.attisdropped"
    return "DO $$ BEGIN IF EXISTS ((" + actual + ' EXCEPT ALL VALUES\n' + expected + ') UNION ALL (VALUES\n' + expected + ' EXCEPT ALL ' + actual + ")) THEN RAISE EXCEPTION 'unexpected studio table columns'; END IF; END $$;\n"


def function_specs(contents):
    found = {}
    pattern = r'create(?: or replace)? function public\.(\w+)\(([^)]*)\)\s*returns (\w+) language (\w+)(.*?)as \$\$(.*?)\$\$;'
    for content in contents:
        for match in re.finditer(pattern, content, re.I | re.S):
            name, args, result, language, flags, body = match.groups()
            signature = 'public.' + name + '(' + ','.join(arg.strip().split()[-1] for arg in args.split(',') if arg.strip()) + ')'
            found[name] = (signature, hashlib.sha256(body.encode()).hexdigest(), 'security definer' in flags.lower(), result.lower(), language.lower())
    return found


def function_guard(specs):
    rows = ',\n'.join(f"('{sig}','{digest}',{str(definer).lower()},'{result}','{language}')" for sig, digest, definer, result, language in specs.values())
    return """DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT * FROM (VALUES
""" + rows + """
 ) AS expected(signature,body_sha256,is_definer,result_type,language_name) LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=to_regprocedure(f.signature) AND r.rolname=current_user AND p.prosecdef=f.is_definer
    AND p.proconfig=ARRAY['search_path=""'] AND p.prokind='f' AND l.lanname=f.language_name
    AND p.prorettype=to_regtype(f.result_type)
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f.body_sha256)
   OR has_function_privilege('anon',f.signature,'EXECUTE')
   OR has_function_privilege('authenticated',f.signature,'EXECUTE')<>f.is_definer THEN
   RAISE EXCEPTION 'unexpected studio function or permissions: %',f.signature;
  END IF;
 END LOOP;
END $$;
"""


def prepare():
    contents = blobs()
    prefix = audit_prefix() + 'SET LOCAL statement_timeout=\'30s\';\n'
    prefix += 'LOCK TABLE ONLY public.projects,public.piece_versions,public.agent_attempts IN ACCESS EXCLUSIVE MODE;\n'
    prefix += table_guard(BASE_TABLES) + column_guard() + audit_guard()
    names = ','.join("'" + name + "'" for name in function_specs(contents) if name != 'save_piece_version')
    prefix += "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (" + names + "))\n"
    prefix += ' OR ' + ' OR '.join(f"to_regclass('{name}') IS NOT NULL" for name in NEW_TABLES)
    prefix += " OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.projects'::regclass AND attname='revision' AND NOT attisdropped) THEN RAISE EXCEPTION 'studio objects already exist; inspect before retry'; END IF; END $$;\n"
    previous = git('show', f'{image.BASE_COMMIT}:supabase/migrations/20261103000001_piece_versions.sql').decode()
    if hashlib.sha256(previous.encode()).hexdigest() != MIGRATIONS['20261103000001_piece_versions.sql']:
        raise ValueError('RPC legado não corresponde à origem revisada')
    prefix += function_guard(function_specs([previous]))
    suffix = '\nINSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) VALUES\n'
    suffix += ',\n'.join(f"('{name[:14]}','{name}','{commit}','{digest}')" for name, commit, digest in SOURCES) + ';\n'
    suffix += audit_guard(True)
    suffix += 'SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n'
    return (prefix.replace('\\set ON_ERROR_STOP on\n', CONNECTION_EVIDENCE, 1) + '\n'.join(contents) + column_guard(True) + function_guard(function_specs(contents)) + suffix).encode()


def prepare_proof():
    contents = blobs()
    tables = BASE_TABLES + NEW_TABLES
    prefix = audit_prefix().replace('IN ACCESS EXCLUSIVE MODE;', 'IN SHARE ROW EXCLUSIVE MODE;')
    prefix += "SET LOCAL statement_timeout='30s';\nLOCK TABLE ONLY " + ','.join(tables) + ' IN SHARE ROW EXCLUSIVE MODE;\n'
    prefix += table_guard(tables) + column_guard(True) + audit_guard(True) + function_guard(function_specs(contents))
    prefix += """DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN ('public.studio_turns'::regclass,'public.studio_action_submissions'::regclass)) THEN RAISE EXCEPTION 'unexpected technical table policy'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.piece_version_metadata'::regclass)<>1 THEN RAISE EXCEPTION 'unexpected metadata policies'; END IF;
 IF has_table_privilege('authenticated','public.piece_version_metadata','INSERT,UPDATE,DELETE')
  OR has_any_column_privilege('authenticated','public.piece_version_metadata','INSERT,UPDATE')
  OR NOT has_table_privilege('authenticated','public.piece_version_metadata','SELECT')
  OR has_table_privilege('anon','public.piece_version_metadata','SELECT,INSERT,UPDATE,DELETE')
  OR has_any_column_privilege('anon','public.piece_version_metadata','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'unexpected metadata privileges'; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['public.studio_turns','public.studio_action_submissions'] LOOP
  IF has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege('authenticated',t,'SELECT,INSERT,UPDATE')
   OR has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege('anon',t,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'unexpected technical table grants'; END IF;
 END LOOP;
END $$;
"""
    body = (ROOT / 'supabase/tests/studio_rls_rollback_body.sql').read_text()
    return (prefix.replace('\\set ON_ERROR_STOP on\n', CONNECTION_EVIDENCE, 1) + snapshot_sql(tables, False) + "SET LOCAL compor_studio_proof.guarded='true';\n" + body + snapshot_sql(tables, True)).encode()


def snapshot_sql(tables, verify):
    # Checksums stay in psql variables: no existing row or creative content is
    # printed or copied into the evidence. Refuse a large/non-pilot dataset.
    statements = []
    for index, table in enumerate(tables + ['compor_migration_audit.applied']):
        query = "SELECT count(*)::integer AS n,encode(sha256(convert_to(coalesce(string_agg(row_digest,',' ORDER BY row_digest),''),'UTF8')),'hex') AS digest FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_digest FROM ONLY " + table + ' t) snapshot'
        if not verify:
            statements += [f"DO $$ BEGIN IF (SELECT count(*) FROM ONLY {table})>10000 THEN RAISE EXCEPTION 'snapshot budget exceeded'; END IF; END $$;",
                f'SELECT n AS snap_{index}_count,digest AS snap_{index}_digest FROM ({query}) measured \\gset']
        else:
            statements += [f"SELECT n=:'snap_{index}_count'::integer AND digest=:'snap_{index}_digest' AS snapshot_ok FROM ({query}) measured \\gset",
                "\\if :snapshot_ok\n\\else\n  \\echo 'Post-rollback snapshot changed; evidence is not a passing proof'\n  SELECT 1/0;\n\\endif"]
    if verify:
        statements.append("SELECT 'STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK' AS result;")
    return '\n'.join(statements) + '\n'


def main():
    args = sys.argv[1:]
    proof = bool(args and args[0] in ('--proof', '--verify-proof'))
    data = prepare_proof() if proof else prepare()
    if len(args) == 2 and args[0] in ('--verify', '--verify-proof'):
        path = Path(args[1])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes() != data:
            raise ValueError('SQL difere do pacote revisado')
        print(hashlib.sha256(data).hexdigest())
        return
    if args not in ([], ['--proof']):
        raise ValueError('uso: prepare_studio_migrations.py [--proof | --verify /apply.sql | --verify-proof /proof.sql]')
    os.umask(0o077)
    path = Path(tempfile.mkdtemp(prefix='compor-studio-proof-' if proof else 'compor-studio-migration-')) / ('proof.sql' if proof else 'apply.sql')
    path.write_bytes(data)
    print(json.dumps({'path': str(path), 'sha256': hashlib.sha256(data).hexdigest(), 'migrations': [{'filename': n, 'source_commit': c, 'sha256': d} for n, c, d in SOURCES], 'expected_audit_before': 13, 'expected_audit_after': 15}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Preparação falhou: {error}', file=sys.stderr)
        sys.exit(1)
