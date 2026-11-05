#!/usr/bin/env python3
"""Prepare an incremental, audited call_/exec_ migration or rollback proof."""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from prepare_compor_migrations import MIGRATIONS, git
import prepare_studio_migrations as studio
import prepare_usage_model_v3_migration as usage
import prepare_image_26_migration as image

ROOT=Path(__file__).resolve().parent.parent
NAME='20261105000016_provider_call_ids.sql'
SOURCE_COMMIT='2375eab3f390a5343a32abf78ab1df01736e0f3a'
DIGEST='997f7e476b3347f397381c743940ac5c83fa7b6da907d4677516cb02af035c54'
IMAGE_SIGNATURE='public.reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text)'

def content():
    data=git('show',f'{SOURCE_COMMIT}:supabase/migrations/{NAME}')
    if hashlib.sha256(data).hexdigest()!=DIGEST:
        raise ValueError('migração difere do blob revisado')
    return data.decode()

def image_source():
    name='20261103000004_image_tool_reservations.sql'
    data=git('show',f'{image.BASE_COMMIT}:supabase/migrations/{name}')
    if hashlib.sha256(data).hexdigest()!=MIGRATIONS[name]:
        raise ValueError('origem da reserva de imagem mudou')
    return data.decode()

def reserve_spec(data):
    # This RPC returns TABLE, so also verify its set-returning result contract.
    match=re.search(r'create(?: or replace)? function public\.reserve_image_tool_call\(.*?as \$\$(.*?)\$\$;',data,re.S)
    if not match:
        raise ValueError('RPC de imagem não encontrada')
    return (IMAGE_SIGNATURE,hashlib.sha256(match.group(1).encode()).hexdigest(),True,'record','plpgsql')

def functions(applied):
    data=content() if applied else image_source()
    specs={**studio.function_specs(studio.blobs()),**studio.function_specs([image_source()]),**studio.function_specs([usage.content()])}
    if applied:
        specs.update(studio.function_specs([data]))
    specs['reserve_image_tool_call']=reserve_spec(data)
    result=studio.function_guard(specs)
    return result+f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{IMAGE_SIGNATURE}') AND proretset AND pg_get_function_result(oid)='TABLE(reservation_id uuid, state text, is_new boolean)') THEN RAISE EXCEPTION 'unexpected image reservation result'; END IF; END $$;\n"

def audit_guard():
    rows=studio.audit_rows(True)+f",\n('{usage.NAME[:14]}','{usage.NAME}','{usage.SOURCE_COMMIT}','{usage.DIGEST}')"
    rows+=f",\n('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}')"
    actual='SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied'
    return "DO $$ BEGIN IF EXISTS (("+actual+' EXCEPT ALL VALUES\n'+rows+') UNION ALL (VALUES\n'+rows+' EXCEPT ALL '+actual+")) THEN RAISE EXCEPTION 'unexpected migration audit'; END IF; END $$;\n"

def call_constraint(applied):
    pattern='^(call|exec)_[A-Za-z0-9_-]{1,128}$' if applied else '^call_[A-Za-z0-9_-]{1,128}$'
    name='studio_action_submissions_call_id_v2_check' if applied else 'studio_action_submissions_call_id_check'
    return f"""CREATE TEMP TABLE expected_provider_call(call_id text CHECK(call_id ~ '{pattern}')) ON COMMIT DROP;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.studio_action_submissions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%call_id%')<>1
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.studio_action_submissions'::regclass AND c.conname='{name}'
   AND pg_get_constraintdef(c.oid)=(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='pg_temp.expected_provider_call'::regclass AND contype='c')) THEN RAISE EXCEPTION 'unexpected call identifier constraint'; END IF;
END $$;
DROP TABLE pg_temp.expected_provider_call;
"""

def prepare():
    before=usage.prefix(True)+'LOCK TABLE ONLY public.studio_action_submissions IN ACCESS EXCLUSIVE MODE;\n'+functions(False)+call_constraint(False)
    after=functions(True)+call_constraint(True)
    after+=f"INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256) VALUES('{NAME[:14]}','{NAME}','{SOURCE_COMMIT}','{DIGEST}');\n"
    after+=audit_guard()+'SELECT version,filename,source_commit,sha256 FROM ONLY compor_migration_audit.applied ORDER BY version;\nCOMMIT;\n'
    return(before+content()+after).encode()

def prepare_proof():
    # Reuse the unchanged v3 guards with the exact next audit manifest. No old
    # applied package is edited or reapplied; only this new proof is generated.
    before=usage.prefix(True)
    old=usage.audit_guard(True)
    if before.count(old)!=1:
        raise ValueError('estrutura do pacote anterior mudou')
    before=before.replace(old,audit_guard(),1)+functions(True)+call_constraint(True)+studio.snapshot_sql(usage.TABLES,False)
    before+="SET LOCAL compor_studio_proof.guarded='true';\n"
    bodies=[]
    for name in ['studio_rls_rollback_body.sql','usage_model_v3_rls_body.sql']:
        body=(ROOT/'supabase/tests'/name).read_text()
        if not body.endswith('RESET ROLE;\nROLLBACK;\n'):
            raise ValueError('estrutura da prova anterior mudou')
        bodies.append(body.removesuffix('ROLLBACK;\n'))
    bodies.append((ROOT/'supabase/tests/provider_call_ids_rls_body.sql').read_text())
    after=studio.snapshot_sql(usage.TABLES,True).replace('STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK','PROVIDER_CALL_IDS_RLS_CHECKS_PASSED_AND_ROLLED_BACK')
    return(before+''.join(bodies)+after).encode()

def main():
    args=sys.argv[1:]
    proof=bool(args and args[0] in ('--proof','--verify-proof'))
    data=prepare_proof() if proof else prepare()
    if len(args)==2 and args[0] in ('--verify','--verify-proof'):
        path=Path(args[1])
        if not path.is_absolute() or path.is_symlink() or not path.is_file() or path.read_bytes()!=data:
            raise ValueError('arquivo SQL difere do pacote revisado')
        print(hashlib.sha256(data).hexdigest());return
    if args not in ([],['--proof']):
        raise ValueError('uso: prepare_provider_call_ids_migration.py [--proof | --verify /apply.sql | --verify-proof /proof.sql]')
    os.umask(0o077)
    path=Path(tempfile.mkdtemp(prefix='compor-call-ids-proof-' if proof else 'compor-call-ids-migration-'))/('proof.sql' if proof else 'apply.sql')
    path.write_bytes(data)
    print(json.dumps({'path':str(path),'sha256':hashlib.sha256(data).hexdigest(),'source_commit':SOURCE_COMMIT,'migration_sha256':DIGEST,'expected_audit_before':16,'expected_audit_after':17}))

if __name__=='__main__':
    try:main()
    except(ValueError,OSError,subprocess.CalledProcessError)as error:
        print(f'Preparação falhou: {error}',file=sys.stderr);sys.exit(1)
