import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, stat, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('captura rejeita conninfo e destino inválido antes de iniciar psql e força TLS',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-preflight-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const cert=join(dir,'ca.pem');await writeFile(cert,'certificado sintético');
 await writeFile(join(dir,'psql'),`#!/bin/sh
printf called > "$(dirname "$0")/called"
[ "$PGSSLMODE" = verify-full ] && [ "$PGGSSENCMODE" = disable ] && [ -n "$PGSSLROOTCERT" ] || exit 3
! printenv PGPASSWORD >/dev/null && ! printenv PGOPTIONS >/dev/null && ! printenv PGHOSTADDR >/dev/null || exit 4
out=''; force=''; host=''; port=''; user=''; name='';
while [ "$#" -gt 0 ]; do case "$1" in -o) shift; out="$1";; -W) force=1;; -h) shift; host="$1";; -p) shift; port="$1";; -U) shift; user="$1";; -d) shift; name="$1";; esac; shift; done
[ -n "$out" ] && [ "$force" = 1 ] && [ "$host" = db.test.supabase.co ] && [ "$port" = 5432 ] && [ "$user" = postgres.project-ref ] && [ "$name" = postgres ] || exit 5
printf 'somente metadados\n' > "$out"
`,{mode:0o700});
 const script=fileURLToPath(new URL('../../../supabase/tests/preflight_capture.sh',import.meta.url));
 const env={PATH:`${dir}:/usr/bin:/bin:/usr/sbin:/sbin`,TMPDIR:dir,COMPOR_DB_HOST:'db.test.supabase.co',COMPOR_DB_PORT:'5432',COMPOR_DB_USER:'postgres.project-ref',COMPOR_DB_NAME:'postgres',COMPOR_CA_CERT:cert,PGPASSWORD:'fake-secret',PGOPTIONS:'-c search_path=hostile',PGHOSTADDR:'127.0.0.1',PGGSSENCMODE:'require'};
 for(const overrides of [{COMPOR_DB_NAME:'host=evil sslmode=disable dbname=postgres'},{COMPOR_DB_NAME:'postgresql://evil/db?sslmode=disable'},{COMPOR_DB_HOST:'db.test.supabase.co?sslmode=disable'},{COMPOR_DB_HOST:'127.0.0.1'},{COMPOR_DB_HOST:'-evil.supabase.co'},{COMPOR_DB_PORT:'5432 sslmode=disable'},{COMPOR_DB_PORT:'65536'},{COMPOR_DB_PORT:'0'},{COMPOR_DB_USER:'postgres host=evil'},{COMPOR_CA_CERT:join(dir,'missing.pem')}]){
  const result=spawnSync('/bin/sh',[script],{env:{...env,...overrides},encoding:'utf8'});assert.notEqual(result.status,0);assert.equal((await stat(join(dir,'called')).catch(()=>null)),null);
 }
 const result=spawnSync('/bin/sh',[script],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/fake-secret/);
 const path=result.stdout.trim();assert.equal(await readFile(path,'utf8'),'somente metadados\n');assert.equal((await stat(path)).mode&0o077,0);
});
