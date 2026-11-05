import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, rm} from 'node:fs/promises';
import {execFileSync, spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const root=new URL('../../../',import.meta.url).pathname;
// This bundle is deliberately pinned to the eleven migrations reviewed and
// applied in the pilot. HEAD can contain later, separately applied migrations.
const commit='35925f0b130fb4ed0123d2b460cc42ffe2698c2f';
const prepared=JSON.parse(execFileSync('python3',['scripts/prepare_compor_migrations.py',commit],{cwd:root,encoding:'utf8'}));
const sql=(await readFile(prepared.path,'utf8')).replace(/^\\set .*$/m,'');

async function fixture(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role authenticated; create role anon;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
 return db;
}

test('recusa preparar HEAD quando há migrações adicionais não revisadas pelo pacote histórico',()=>{
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const files=execFileSync('git',['ls-tree','-r','--name-only',head,'--','supabase/migrations'],{cwd:root,encoding:'utf8'}).trim().split('\n');
 assert.ok(files.length>11, 'o HEAD deve conter migrações além das onze históricas');
 const result=spawnSync('python3',['scripts/prepare_compor_migrations.py',head],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,1);
 assert.match(result.stderr,/a lista de migrações difere da revisada/);
 assert.equal(result.stdout,'');
});

test('commit aplica as onze migrações e auditoria privada; repetição não altera o resultado',async t=>{
 const db=await fixture(t);
 await db.exec(sql);
 const rows=(await db.query('select version,source_commit,sha256 from compor_migration_audit.applied order by version')).rows;
 assert.equal(rows.length,11);assert.ok(rows.every(row=>row.source_commit===commit&&/^[0-9a-f]{64}$/.test(row.sha256)));
 assert.equal((await db.query("select count(*)::int as n from storage.buckets where id='compor-project-images' and public=false")).rows[0].n,1);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from compor_migration_audit.applied'));await db.exec('reset role');
 await assert.rejects(()=>db.exec(sql));await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int as n from compor_migration_audit.applied')).rows[0].n,11);
});

test('falha durante criação do bucket reverte todas as alterações SQL',async t=>{
 const db=await fixture(t);
 await db.exec(`create function storage.reject_bucket() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;
 create trigger fail_bucket before insert on storage.buckets for each row execute function storage.reject_bucket();`);
 await assert.rejects(()=>db.exec(sql));await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('public.projects') is null as absent")).rows[0].absent,true);
 assert.equal((await db.query("select to_regnamespace('compor_migration_audit') is null as absent")).rows[0].absent,true);
 assert.equal((await db.query('select count(*)::int as n from storage.buckets')).rows[0].n,0);
});

test('histórico ou esquema público preexistente impedem aplicação',async t=>{
 for (const existing of ['create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text)', 'create table public.prior_data(id integer)']) {
  const db=await fixture(t);await db.exec(existing);await assert.rejects(()=>db.exec(sql));await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.projects') is null as absent")).rows[0].absent,true);
 }
});

test.after(async()=>{await rm(new URL('.',`file://${prepared.path}`).pathname,{recursive:true,force:true});});
