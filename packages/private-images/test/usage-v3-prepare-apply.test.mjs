import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,rm,chmod } from 'node:fs/promises';
import { execFileSync,execFile,spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const root=new URL('../../../',import.meta.url).pathname,env={...process.env,PYTHONDONTWRITEBYTECODE:'1'},run=promisify(execFile);
const prepare=(...args)=>JSON.parse(execFileSync('python3',['-B',...args],{cwd:root,env,encoding:'utf8'}));
const artifacts=[prepare('scripts/prepare_compor_migrations.py','35925f0b130fb4ed0123d2b460cc42ffe2698c2f'),prepare('scripts/prepare_image_26_migration.py'),prepare('scripts/prepare_recovery_migration.py'),prepare('scripts/prepare_studio_migrations.py'),prepare('scripts/prepare_usage_model_v3_migration.py'),prepare('scripts/prepare_usage_model_v3_migration.py','--proof')];
const sql=await Promise.all(artifacts.slice(0,5).map(async item=>(await readFile(item.path,'utf8')).replace(/^\\.*$/gm,'')));
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const source of sql.slice(0,4))await db.exec(source);
 await db.exec(`insert into auth.users(id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.projects(id,owner_id,title)values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','preserve historical model');
  insert into public.agent_attempts(id,owner_id,project_id,idempotency_key)values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid());
  insert into public.usage_measurements(owner_id,project_id,attempt_id,part,part_id,model,state,input_tokens)values
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','agent','cccccccc-cccc-4ccc-8ccc-cccccccccccc','gpt-6-astra','completed',17),
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','image',gen_random_uuid(),'gpt-image-2.5-flare','completed',19),
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','image',gen_random_uuid(),'gpt-image-2.6-flare','completed',23);`);
 return db;
}
const history=async db=>(await db.query('select to_jsonb(m)row from public.usage_measurements m order by part,part_id')).rows;

test('bundle 15→16 preserves historical models, legacy bodies and refuses reapplication',async t=>{
 const db=await fixture(t),before=await history(db);
 await db.exec(sql[4]);assert.deepEqual(await history(db),before);
 assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,16);
 assert.deepEqual((await db.query("select source_commit,sha256 from compor_migration_audit.applied where version='20261105000015'")).rows[0],{source_commit:artifacts[4].source_commit,sha256:artifacts[4].migration_sha256});
 await assert.rejects(()=>db.exec(sql[4]));await db.exec('rollback');assert.deepEqual(await history(db),before);
});

test('drift and failure before audit leave the old constraint, history and fifteen audit rows',async t=>{
 for(const kind of ['history','constraint','failure']){
  const db=await fixture(t),before=await history(db);
  if(kind==='history')await db.exec("update compor_migration_audit.applied set sha256=repeat('0',64) where version='20261105000014'");
  if(kind==='constraint')await db.exec('alter table public.usage_measurements rename constraint usage_measurements_model_v2_check to changed_check');
  const attempt=kind==='failure'?sql[4].replace('INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)','SELECT 1/0; INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)'):sql[4];
  await assert.rejects(()=>db.exec(attempt));await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,15);
  assert.equal((await db.query("select to_regprocedure('public.start_usage_measurement_v3(uuid,uuid,text,uuid,text)') is null absent")).rows[0].absent,true);
  assert.deepEqual(await history(db),before);
 }
});

test('single psql applies v3 then proves two-owner measurement, approval lineage and rollback',async t=>{
 if(spawnSync('psql',['--version']).status!==0)return t.skip('psql unavailable');
 const db=await fixture(t),dir=await mkdtemp(join(tmpdir(),'compor-usage-v3-socket-')),before=await history(db);
 const server=new PGLiteSocketServer({db,path:join(dir,'.s.PGSQL.5432')});await server.start();t.after(async()=>{await server.stop();await rm(dir,{recursive:true,force:true});});
 const call=async(paths,output)=>{
  try{return await run('psql',['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p','5432','-U','postgres','-d','postgres',...paths.flatMap(path=>['-f',path]),...(output?['-o',output]:[])],{env,maxBuffer:1024*1024});}
  finally{const end=Date.now()+10000;while(server.getStats().activeConnections||db.isInTransaction()){if(Date.now()>end)throw Error('disconnect rollback timed out');await new Promise(resolve=>setTimeout(resolve,5));}}
 };
 const output=join(dir,'result.txt');await call([artifacts[4].path,artifacts[5].path],output);
 const evidence=await readFile(output,'utf8');assert.match(evidence,/^COMMIT$/m);assert.match(evidence,/^ROLLBACK$/m);assert.match(evidence,/USAGE_MODEL_V3_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);
 assert.deepEqual(await history(db),before);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);
 await db.exec('drop policy usage_measurements_owner on public.usage_measurements;create policy usage_measurements_owner on public.usage_measurements for select to authenticated using(true)');
 await assert.rejects(()=>call([artifacts[5].path]),error=>/cross-account usage read accepted/.test(error.stderr));
 assert.deepEqual(await history(db),before);
});

test('v3 wrapper fixes TLS/host and rejects modified apply/proof bytes before connecting',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-usage-v3-wrapper-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const ca=join(dir,'ca'),openssl=join(dir,'openssl'),psql=join(dir,'psql'),args=join(dir,'args'),child=join(dir,'env');
 await writeFile(ca,'synthetic');await writeFile(openssl,"#!/bin/sh\nprintf '%s\\n' 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'\n");await chmod(openssl,0o700);
 await writeFile(psql,`#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${child}'\nwhile [ "$#" -gt 0 ]; do if [ "$1" = '-o' ]; then shift; output=$1; fi; shift; done\nprintf '%s\\n' COMMIT ROLLBACK USAGE_MODEL_V3_RLS_CHECKS_PASSED_AND_ROLLED_BACK > "$output"\n`);await chmod(psql,0o700);
 const wrapper=join(root,'scripts/apply_usage_model_v3_test_project.sh'),wrapperEnv={...env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,PGHOST:'attacker.invalid',PGPASSWORD:'private-synthetic',PGOPTIONS:'-c ssl=off'};
 assert.equal(spawnSync('sh',[wrapper,artifacts[4].path,artifacts[5].path,ca],{cwd:root,env:wrapperEnv}).status,0);
 const argv=(await readFile(args,'utf8')).split('\n'),actual=(await readFile(child,'utf8')).split('\n');
 assert.equal(argv.filter(value=>value==='-f').length,2);assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co'));assert.ok(argv.includes('-W'));assert.ok(actual.includes('PGSSLMODE=verify-full'));assert.ok(!actual.some(value=>/^(PGHOST|PGPASSWORD|PGOPTIONS)=/.test(value)));
 for(const proof of [false,true]){
  const changed=join(dir,proof?'proof.sql':'apply.sql');await writeFile(changed,(await readFile(artifacts[proof?5:4].path,'utf8'))+'-- changed');await rm(args,{force:true});
  assert.notEqual(spawnSync('sh',[wrapper,proof?artifacts[4].path:changed,proof?changed:artifacts[5].path,ca],{cwd:root,env:wrapperEnv}).status,0);await assert.rejects(()=>readFile(args));
 }
});
test.after(async()=>{for(const item of artifacts)await rm(new URL('.',`file://${item.path}`).pathname,{recursive:true,force:true});});
