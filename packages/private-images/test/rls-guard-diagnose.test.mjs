import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const sql=(await readFile(new URL('../../../supabase/tests/rls_guard_diagnose_readonly.sql',import.meta.url),'utf8')).replace(/^\\set .*$/m,'');

test('psql executa o diagnóstico em transação somente leitura e termina em rollback',async t=>{
 if(spawnSync('psql',['--version'],{encoding:'utf8'}).status!==0) return t.skip('psql indisponível');
 const dir=await mkdtemp(join(tmpdir(),'compor-guard-socket-')),port=5432,db=await PGlite.create();
 const server=new PGLiteSocketServer({db,path:join(dir,`.s.PGSQL.${port}`)});await server.start();
 t.after(async()=>{await server.stop();await db.close();await rm(dir,{recursive:true,force:true});});
 const path=new URL('../../../supabase/tests/rls_guard_diagnose_readonly.sql',import.meta.url).pathname;
 const {stdout}=await promisify(execFile)('psql',['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p',String(port),'-U','postgres','-d','postgres','-f',path]);
 assert.match(stdout,/\bon\b/);assert.match(stdout,/agent_attempts/);assert.match(stdout,/ROLLBACK/);
});

test('diagnóstico lista guardas existentes e não altera dados',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create schema auth;create table auth.users(id uuid primary key,marker text);
 create table public.projects(id integer primary key, generated integer generated always as (id+1) stored);
 create table public.piece_versions(id integer);create table public.agent_attempts(id integer);
 alter table public.projects enable row level security;alter table public.piece_versions enable row level security;
 insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','preserved');
 create function auth.test_trigger() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger diagnostic_trigger before insert on auth.users for each row execute function auth.test_trigger();
 create rule diagnostic_rule as on update to public.projects do instead nothing;
 create table public.child_projects() inherits(public.projects);`);
 const results=await db.exec(sql),rows=results.flatMap(r=>r.rows??[]);
 assert.ok(rows.some(r=>r.relation_name==='agent_attempts' && r.rls_required===true && r.rls_enabled===false));
 assert.ok(rows.some(r=>r.trigger_name==='diagnostic_trigger' && r.function_schema==='auth' && r.function_name==='test_trigger'));
 assert.ok(rows.some(r=>r.rule_name==='diagnostic_rule'));
 assert.ok(rows.some(r=>r.parent_name==='projects' && r.child_name==='child_projects'));
 assert.ok(rows.some(r=>r.column_name==='generated' && r.generated==='s'));
 assert.equal((await db.query('select marker from auth.users')).rows[0].marker,'preserved');
 assert.equal((await db.query('select count(*)::int as n from public.projects')).rows[0].n,0);
});

test('wrapper fixa destino e TLS e rejeita CA inesperada',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-guard-wrap-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const fp='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
 const openssl=join(dir,'openssl'),psql=join(dir,'psql'),ca=join(dir,'ca'),args=join(dir,'args'),envFile=join(dir,'env');
 await writeFile(ca,'synthetic');await writeFile(openssl,`#!/bin/sh\nprintf '%s\\n' '${fp}'\n`);await chmod(openssl,0o700);
 await writeFile(psql,`#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${envFile}'\n`);await chmod(psql,0o700);
 const script=new URL('../../../supabase/tests/rls_guard_diagnose_capture.sh',import.meta.url).pathname;
 const env={...process.env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,PGHOST:'attacker.invalid',PGOPTIONS:'malicious'};
 let result=spawnSync('sh',[script,ca],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const argv=(await readFile(args,'utf8')).split('\n'),child=(await readFile(envFile,'utf8')).split('\n');
 assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co'));assert.ok(argv.includes('-W'));
 assert.ok(child.includes('PGSSLMODE=verify-full'));assert.ok(child.includes('PGGSSENCMODE=disable'));
 assert.ok(!child.some(value=>value.startsWith('PGHOST=')||value.startsWith('PGOPTIONS=')));
 await rm(args);await writeFile(openssl,"#!/bin/sh\nprintf '%s\\n' 'wrong'\n");
 result=spawnSync('sh',[script,ca],{env,encoding:'utf8'});assert.notEqual(result.status,0);
 await assert.rejects(readFile(args,'utf8'));
});
