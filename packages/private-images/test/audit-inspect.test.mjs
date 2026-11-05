import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,chmod,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const sql=await readFile(new URL('../../../supabase/tests/audit_inspect_readonly.sql',import.meta.url),'utf8');
const guarded=[...sql.matchAll(/SELECT EXISTS \(\n SELECT 1 FROM pg_class c[\s\S]*?\) AS (bucket|audit)_safe_to_read \\gset/g)];
const guards=guarded.filter(match=>match[1]==='audit').map(match=>match[0].replace('\\gset',';'));
const bucketGuards=guarded.filter(match=>match[1]==='bucket').map(match=>match[0].replace('\\gset',';'));
const history=sql.match(/SELECT version, filename, source_commit, sha256, applied_at\s+FROM ONLY compor_migration_audit\.applied[\s\S]*?ORDER BY version LIMIT 12;/)?.[0];
const structure=`create schema compor_migration_audit;
 create table compor_migration_audit.applied(version text primary key,filename text not null,source_commit text not null,sha256 text not null,applied_at timestamptz not null default now());
 alter table compor_migration_audit.applied enable row level security;`;

test('guard só permite a estrutura esperada e ignora descendentes',async t=>{
 assert.equal(guards.length,2);assert.equal(guards[0],guards[1]);assert.ok(history);
 const db=new PGlite();t.after(()=>db.close());await db.exec('set search_path=pg_catalog');
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
 await db.exec(structure);
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,true);
 await db.exec(`insert into compor_migration_audit.applied(version,filename,source_commit,sha256) values
 ('20261103000000','20261103000000_projects.sql',repeat('a',40),repeat('b',64));
 create table compor_migration_audit.child() inherits (compor_migration_audit.applied);
 insert into compor_migration_audit.child(version,filename,source_commit,sha256) values
 ('20261103000001','20261103000001_piece_versions.sql',repeat('c',40),repeat('d',64));`);
 const rows=(await db.query(history)).rows;assert.equal(rows.length,1);assert.equal(rows[0].version,'20261103000000');
 await db.exec('create policy unexpected on compor_migration_audit.applied for select using(true)');
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
});

test('guard recusa tabela não esperada, regra, trigger e tipos trocados',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('set search_path=pg_catalog');
 await db.exec('create schema compor_migration_audit;create view compor_migration_audit.applied as select 1 as version');
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
 await db.exec('drop view compor_migration_audit.applied;drop schema compor_migration_audit');await db.exec(structure);
 await db.exec('create rule unexpected as on update to compor_migration_audit.applied do instead nothing');
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
 await db.exec(`drop rule unexpected on compor_migration_audit.applied;
 create function compor_migration_audit.unexpected() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger unexpected before insert on compor_migration_audit.applied for each row execute function compor_migration_audit.unexpected()`);
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
 await db.exec('drop trigger unexpected on compor_migration_audit.applied;alter table compor_migration_audit.applied alter column filename type varchar');
 assert.equal((await db.query(guards[0])).rows[0].audit_safe_to_read,false);
});

test('bucket só é lido quando a tabela Storage tem a estrutura conhecida',async t=>{
 assert.equal(bucketGuards.length,2);assert.equal(bucketGuards[0],bucketGuards[1]);
 const db=new PGlite();t.after(()=>db.close());await db.exec('set search_path=pg_catalog');
 assert.equal((await db.query(bucketGuards[0])).rows[0].bucket_safe_to_read,false);
 await db.exec(`create role supabase_storage_admin;create schema storage;
 create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 alter table storage.buckets owner to supabase_storage_admin;`);
 assert.equal((await db.query(bucketGuards[0])).rows[0].bucket_safe_to_read,true);
 await db.exec('create policy unexpected on storage.buckets for select using(true)');
 assert.equal((await db.query(bucketGuards[0])).rows[0].bucket_safe_to_read,false);
});

test('captura fixa projeto e TLS e remove variáveis PostgreSQL herdadas',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-audit-wrap-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const fp='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
 const openssl=join(dir,'openssl'),psql=join(dir,'psql'),ca=join(dir,'ca'),args=join(dir,'args'),envFile=join(dir,'env');
 await writeFile(ca,'synthetic');await writeFile(openssl,`#!/bin/sh\nprintf '%s\\n' '${fp}'\n`);await chmod(openssl,0o700);
 await writeFile(psql,`#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${envFile}'\n`);await chmod(psql,0o700);
 const script=new URL('../../../supabase/tests/audit_inspect_capture.sh',import.meta.url).pathname;
 const env={...process.env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,PGHOST:'attacker.invalid',PGOPTIONS:'malicious'};
 const run=spawnSync('sh',[script,ca],{env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const argv=(await readFile(args,'utf8')).split('\n');const child=(await readFile(envFile,'utf8')).split('\n');
 assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co'));assert.ok(argv.includes('-W'));
 assert.ok(child.includes('PGSSLMODE=verify-full'));assert.ok(child.includes('PGGSSENCMODE=disable'));
 assert.ok(!child.some(value=>value.startsWith('PGHOST=')||value.startsWith('PGOPTIONS=')));
 await unlink(args);await writeFile(openssl,"#!/bin/sh\nprintf '%s\\n' 'wrong'\n");
 const rejected=spawnSync('sh',[script,ca],{env,encoding:'utf8'});assert.notEqual(rejected.status,0);
 await assert.rejects(readFile(args,'utf8'));
});
