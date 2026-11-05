import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const root=new URL('../../../',import.meta.url).pathname;
const initial=JSON.parse(execFileSync('python3',['scripts/prepare_compor_migrations.py','35925f0b130fb4ed0123d2b460cc42ffe2698c2f'],{cwd:root,encoding:'utf8'}));
const image=JSON.parse(execFileSync('python3',['scripts/prepare_image_26_migration.py'],{cwd:root,encoding:'utf8'}));
const recovery=JSON.parse(execFileSync('python3',['scripts/prepare_recovery_migration.py'],{cwd:root,encoding:'utf8'}));
const sql=async p=>(await readFile(p,'utf8')).replace(/^\\set .*$/m,'');
const initialSql=await sql(initial.path), imageSql=await sql(image.path), recoverySql=await sql(recovery.path);
async function fixture(t,applyImage=true){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
 await db.exec(initialSql);if(applyImage)await db.exec(imageSql);return db;
}

test('aplica uma única vez e audita apenas após a migração de imagem',async t=>{
 const db=await fixture(t); await db.exec(recoverySql);
 const rows=(await db.query('select version,source_commit,sha256 from compor_migration_audit.applied order by version')).rows;
 assert.equal(rows.length,13);assert.deepEqual(rows.find(x=>x.version==='20261103000011'),{version:'20261103000011',source_commit:recovery.source_commit,sha256:recovery.migration_sha256});
 await assert.rejects(()=>db.exec(recoverySql));await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,13);
});

test('nega acesso direto e impede vínculo ou leitura de outra conta',async t=>{
 const db=await fixture(t);await db.exec(recoverySql);
 const a='10000000-0000-0000-0000-000000000001', b='10000000-0000-0000-0000-000000000002';
 const p='20000000-0000-0000-0000-000000000001', q='20000000-0000-0000-0000-000000000002';
 const x='30000000-0000-0000-0000-000000000001', y='30000000-0000-0000-0000-000000000002';
 const k='40000000-0000-0000-0000-000000000001', l='40000000-0000-0000-0000-000000000002';
 await db.query('insert into auth.users(id) values ($1),($2)',[a,b]);
 await db.query('insert into public.projects(id,owner_id,title) values ($1,$2,$3),($4,$5,$6)',[p,a,'A',q,b,'B']);
 await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key) values ($1,$2,$3,$4),($5,$6,$7,$8)',[x,a,p,k,y,b,q,l]);
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false)`);
 await assert.rejects(()=>db.query('select * from public.agent_session_recovery'));
 await assert.rejects(()=>db.query('insert into public.agent_session_recovery(attempt_id,owner_id,project_id,binding) values ($1,$2,$3,$4)',[x,a,p,'v4.abc.def']));
 assert.equal((await db.query('select public.bind_agent_session_recovery($1,$2,$3) ok',[p,x,'v4.abc.def'])).rows[0].ok,true);
 assert.equal((await db.query('select public.bind_agent_session_recovery($1,$2,$3) ok',[p,x,'v4.abc.def'])).rows[0].ok,true);
 assert.equal((await db.query('select public.bind_agent_session_recovery($1,$2,$3) ok',[p,x,'v4.other.def'])).rows[0].ok,false);
 assert.equal((await db.query('select public.bind_agent_session_recovery($1,$2,$3) ok',[q,y,'v4.cross.tenant'])).rows[0].ok,false);
 assert.equal((await db.query('select * from public.get_agent_session_recovery($1,$2)',[q,l])).rows.length,0);
 assert.equal((await db.query('select * from public.get_agent_session_recovery($1,$2)',[p,k])).rows.length,1);
 await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);
 assert.equal((await db.query('select * from public.get_agent_session_recovery($1,$2)',[p,k])).rows.length,0);
 assert.equal((await db.query('select public.bind_agent_session_recovery($1,$2,$3) ok',[q,y,'v4.ghi.jkl'])).rows[0].ok,true);
 assert.equal((await db.query('select * from public.get_agent_session_recovery($1,$2)',[q,l])).rows.length,1);
 await db.exec('reset role;set role anon');
 await assert.rejects(()=>db.query('select * from public.get_agent_session_recovery($1,$2)',[p,k]));
});

test('recusa estado divergente e reverte erro antes da auditoria',async t=>{
 for(const change of ['missing','hash','object','failure']){
  const db=await fixture(t,change!=='missing');
  if(change==='hash')await db.exec("update compor_migration_audit.applied set sha256=repeat('0',64) where version='20261103000000'");
  if(change==='object')await db.exec('create table public.agent_session_recovery(id uuid)');
  const attempt=change==='failure'?recoverySql.replace('INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)', 'SELECT 1/0; INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)'):recoverySql;
  await assert.rejects(()=>db.exec(attempt));await db.exec('rollback');
  assert.equal((await db.query("select to_regprocedure('public.bind_agent_session_recovery(uuid,uuid,text)') is null absent")).rows[0].absent,true);
  assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n,change==='missing'?11:12);
 }
});

test('verificador recusa alteração do pacote',async()=>{
 assert.equal(spawnSync('python3',['scripts/prepare_recovery_migration.py','--verify',recovery.path],{cwd:root}).status,0);
 await writeFile(recovery.path,recoverySql+'-- changed');
 assert.notEqual(spawnSync('python3',['scripts/prepare_recovery_migration.py','--verify',recovery.path],{cwd:root}).status,0);
});

test.after(async()=>{for(const p of [initial.path,image.path,recovery.path])await rm(new URL('.',`file://${p}`).pathname,{recursive:true,force:true});});
