import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const root=new URL('../../../',import.meta.url).pathname;
const base='35925f0b130fb4ed0123d2b460cc42ffe2698c2f';
const original=JSON.parse(execFileSync('python3',['scripts/prepare_compor_migrations.py',base],{cwd:root,encoding:'utf8'}));
const prepared=JSON.parse(execFileSync('python3',['scripts/prepare_image_26_migration.py'],{cwd:root,encoding:'utf8'}));
const initialSql=(await readFile(original.path,'utf8')).replace(/^\\set .*$/m,'');
const applySql=(await readFile(prepared.path,'utf8')).replace(/^\\set .*$/m,'');
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated;create role anon;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
 await db.exec(initialSql);return db;
}

test('migra uma única vez, preserva auditoria e função antiga',async t=>{
 const db=await fixture(t);
 await db.exec(applySql);
 const rows=(await db.query('select version,source_commit,sha256 from compor_migration_audit.applied order by version')).rows;
 assert.equal(rows.length,12);
 assert.deepEqual(rows.at(-1),{version:'20261105000012',source_commit:prepared.source_commit,sha256:prepared.migration_sha256});
 const functions=(await db.query("select to_regprocedure('public.start_usage_measurement(uuid,uuid,text,uuid)') is not null as old, to_regprocedure('public.start_usage_measurement_v2(uuid,uuid,text,uuid)') is not null as new")).rows[0];
 assert.deepEqual(functions,{old:true,new:true});
 await assert.rejects(()=>db.exec(applySql));await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int as n from compor_migration_audit.applied')).rows[0].n,12);
});

test('recusa hash histórico ou constraint alterados sem alterar o esquema',async t=>{
 for(const change of ["update compor_migration_audit.applied set sha256=repeat('0',64) where version='20261103000000'", "do $$declare n text;begin select conname into n from pg_constraint where conrelid='public.usage_measurements'::regclass and contype='c' and pg_get_constraintdef(oid) like '%gpt-image-2.5-flare%';execute format('alter table public.usage_measurements drop constraint %I',n);end$$;alter table public.usage_measurements add constraint altered_model check (model in ('gpt-6-astra','gpt-image-2.5-flare'))"]){
  const db=await fixture(t);await db.exec(change);
  await assert.rejects(()=>db.exec(applySql));await db.exec('rollback');
  assert.equal((await db.query("select to_regprocedure('public.start_usage_measurement_v2(uuid,uuid,text,uuid)') is null as absent")).rows[0].absent,true);
  assert.equal((await db.query('select count(*)::int as n from compor_migration_audit.applied')).rows[0].n,11);
 }
});

test('falha antes do registro desfaz a migração inteira',async t=>{
 const db=await fixture(t);
 const failing=applySql.replace('INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)', 'SELECT 1/0; INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)');
 assert.notEqual(failing,applySql);
 await assert.rejects(()=>db.exec(failing));await db.exec('rollback');
 assert.equal((await db.query("select to_regprocedure('public.start_usage_measurement_v2(uuid,uuid,text,uuid)') is null as absent")).rows[0].absent,true);
 assert.equal((await db.query('select count(*)::int as n from compor_migration_audit.applied')).rows[0].n,11);
});

test('verificador recusa adulteração do pacote',async()=>{
 assert.equal(spawnSync('python3',['scripts/prepare_image_26_migration.py','--verify',prepared.path],{cwd:root}).status,0);
 await writeFile(prepared.path,applySql+'-- changed');
 assert.notEqual(spawnSync('python3',['scripts/prepare_image_26_migration.py','--verify',prepared.path],{cwd:root}).status,0);
});

test.after(async()=>{await rm(new URL('.',`file://${prepared.path}`).pathname,{recursive:true,force:true});await rm(new URL('.',`file://${original.path}`).pathname,{recursive:true,force:true});});
