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
const artifacts=[prepare('scripts/prepare_compor_migrations.py','35925f0b130fb4ed0123d2b460cc42ffe2698c2f'),prepare('scripts/prepare_image_26_migration.py'),prepare('scripts/prepare_recovery_migration.py'),prepare('scripts/prepare_studio_migrations.py'),prepare('scripts/prepare_usage_model_v3_migration.py'),prepare('scripts/prepare_provider_call_ids_migration.py'),prepare('scripts/prepare_provider_call_ids_migration.py','--proof')];
const sql=await Promise.all(artifacts.slice(0,6).map(async item=>(await readFile(item.path,'utf8')).replace(/^\\.*$/gm,'')));
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const source of sql.slice(0,5))await db.exec(source);
 await db.exec(`insert into auth.users(id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.projects(id,owner_id,title)values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','preserve historical model');
  insert into public.agent_attempts(id,owner_id,project_id,idempotency_key)values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',gen_random_uuid());
  insert into public.usage_measurements(owner_id,project_id,attempt_id,part,part_id,model,state,input_tokens)values
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','agent','cccccccc-cccc-4ccc-8ccc-cccccccccccc','gpt-6-astra','completed',17),
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','image',gen_random_uuid(),'gpt-image-2.5-flare','completed',19),
   ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','image',gen_random_uuid(),'gpt-image-2.6-flare','completed',23);`);
 await db.exec(`insert into public.piece_versions(project_id,piece_id,version,content)values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'{}');
  set role authenticated;select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
  select public.reserve_studio_turn('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',repeat('a',64));
  select public.bind_studio_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','v4.historical.proof',now()+interval '4 minutes',null,0,0);
  select public.set_studio_turn_state('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','action_required','turn_history');
  select public.claim_studio_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','turn_history','call_history',repeat('a',64),repeat('b',64));
  select public.reserve_image_tool_call('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','sess_history','turn_history','call_history');reset role;`);
 return db;
}
const history=async db=>(await db.query(`select * from(select 'usage' kind,to_jsonb(m)row from public.usage_measurements m union all select 'image',to_jsonb(r) from public.image_tool_reservations r union all select 'action',to_jsonb(s) from public.studio_action_submissions s) h order by kind,row::text`)).rows;

test('bundle 16→17 preserves historical rows and refuses reapplication',async t=>{
 const db=await fixture(t),before=await history(db);
 await db.exec(sql[5]);assert.deepEqual(await history(db),before);
 assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,17);
 assert.deepEqual((await db.query("select source_commit,sha256 from compor_migration_audit.applied where version='20261105000016'")).rows[0],{source_commit:artifacts[5].source_commit,sha256:artifacts[5].migration_sha256});
 await assert.rejects(()=>db.exec(sql[5]));await db.exec('rollback');assert.deepEqual(await history(db),before);
});

test('drift and failure before audit leave the old constraint, history and sixteen audit rows',async t=>{
 for(const kind of ['history','constraint','function','failure']){
  const db=await fixture(t),before=await history(db);
  if(kind==='history')await db.exec("update compor_migration_audit.applied set sha256=repeat('0',64) where version='20261105000015'");
  if(kind==='constraint')await db.exec('alter table public.studio_action_submissions rename constraint studio_action_submissions_call_id_check to changed_check');
  if(kind==='function')await db.exec("alter function public.claim_studio_action(uuid,uuid,text,text,text,text) set search_path='pg_catalog'");
  const attempt=kind==='failure'?sql[5].replace('INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)','SELECT 1/0; INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)'):sql[5];
  await assert.rejects(()=>db.exec(attempt));await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,16);
  assert.equal((await db.query("select not exists(select 1 from pg_constraint where conrelid='public.studio_action_submissions'::regclass and conname='studio_action_submissions_call_id_v2_check') absent")).rows[0].absent,true);
  assert.deepEqual(await history(db),before);
 }
});

test('single psql applies call IDs then proves two-owner claims, conflict handling and rollback',async t=>{
 if(spawnSync('psql',['--version']).status!==0)return t.skip('psql unavailable');
 const db=await fixture(t),dir=await mkdtemp(join(tmpdir(),'compor-call-ids-socket-')),before=await history(db);
 const server=new PGLiteSocketServer({db,path:join(dir,'.s.PGSQL.5432')});await server.start();t.after(async()=>{await server.stop();await rm(dir,{recursive:true,force:true});});
 const call=async(paths,output)=>{
  try{return await run('psql',['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p','5432','-U','postgres','-d','postgres',...paths.flatMap(path=>['-f',path]),...(output?['-o',output]:[])],{env,maxBuffer:1024*1024});}
  finally{const end=Date.now()+10000;while(server.getStats().activeConnections||db.isInTransaction()){if(Date.now()>end)throw Error('disconnect rollback timed out');await new Promise(resolve=>setTimeout(resolve,5));}}
 };
 const output=join(dir,'result.txt');await call([artifacts[5].path,artifacts[6].path],output);
 const evidence=await readFile(output,'utf8');assert.match(evidence,/^COMMIT$/m);assert.match(evidence,/^ROLLBACK$/m);assert.match(evidence,/PROVIDER_CALL_IDS_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);
 assert.deepEqual(await history(db),before);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);
 await db.exec('drop policy usage_measurements_owner on public.usage_measurements;create policy usage_measurements_owner on public.usage_measurements for select to authenticated using(true)');
 await assert.rejects(()=>call([artifacts[6].path]),error=>/cross-account usage read accepted/.test(error.stderr));
 assert.deepEqual(await history(db),before);
});

test('call IDs wrapper fixes TLS/host and rejects modified apply/proof bytes before connecting',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-call-ids-wrapper-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const ca=join(dir,'ca'),openssl=join(dir,'openssl'),psql=join(dir,'psql'),args=join(dir,'args'),child=join(dir,'env');
 await writeFile(ca,'synthetic');await writeFile(openssl,"#!/bin/sh\nprintf '%s\\n' 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'\n");await chmod(openssl,0o700);
 await writeFile(psql,`#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${child}'\nwhile [ "$#" -gt 0 ]; do if [ "$1" = '-o' ]; then shift; output=$1; fi; shift; done\nprintf '%s\\n' COMMIT ROLLBACK PROVIDER_CALL_IDS_RLS_CHECKS_PASSED_AND_ROLLED_BACK > "$output"\n`);await chmod(psql,0o700);
 const wrapper=join(root,'scripts/apply_provider_call_ids_test_project.sh'),wrapperEnv={...env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,PGHOST:'attacker.invalid',PGPASSWORD:'private-synthetic',PGOPTIONS:'-c ssl=off'};
 assert.equal(spawnSync('sh',[wrapper,artifacts[5].path,artifacts[6].path,ca],{cwd:root,env:wrapperEnv}).status,0);
 const argv=(await readFile(args,'utf8')).split('\n'),actual=(await readFile(child,'utf8')).split('\n');
 assert.equal(argv.filter(value=>value==='-f').length,2);assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co'));assert.ok(argv.includes('-W'));assert.ok(actual.includes('PGSSLMODE=verify-full'));assert.ok(!actual.some(value=>/^(PGHOST|PGPASSWORD|PGOPTIONS)=/.test(value)));
 for(const proof of [false,true]){
  const changed=join(dir,proof?'proof.sql':'apply.sql');await writeFile(changed,(await readFile(artifacts[proof?6:5].path,'utf8'))+'-- changed');await rm(args,{force:true});
  assert.notEqual(spawnSync('sh',[wrapper,proof?artifacts[5].path:changed,proof?changed:artifacts[6].path,ca],{cwd:root,env:wrapperEnv}).status,0);await assert.rejects(()=>readFile(args));
 }
});
test.after(async()=>{for(const item of artifacts)await rm(new URL('.',`file://${item.path}`).pathname,{recursive:true,force:true});});
