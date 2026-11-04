import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const sql=join(root,'supabase/tests/rls_two_identities_rollback.sql');
const wrapper=join(root,'supabase/tests/rls_two_identities_capture.sh');
const run=promisify(execFile);

test('psql: duas identidades, rollback e recusas contra políticas/triggers inseguros',async t=>{
 if(spawnSync('psql',['--version'],{encoding:'utf8'}).status!==0) return t.skip('psql indisponível');
 const dir=await mkdtemp(join(tmpdir(),'compor-rls-socket-'));
 const db=await PGlite.create(),port=5432;
 const server=new PGLiteSocketServer({db,path:join(dir,`.s.PGSQL.${port}`)});
 await server.start();
 t.after(async()=>{await server.stop();await db.close();await rm(dir,{recursive:true,force:true});});
 await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261103000002_agent_attempts.sql','20261103000008_agent_attempt_state.sql']) {
  await db.exec(await readFile(join(root,'supabase/migrations',name),'utf8'));
 }
 await db.exec(`insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.projects(id,owner_id,title) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','keep-existing');`);
 const args=['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p',String(port),'-U','postgres','-d','postgres','-f',sql];
 const call=()=>run('psql',args,{maxBuffer:1024*1024});
 const result=await call();assert.match(result.stdout,/RLS_SYNTHETIC_CHECKS_PASSED_AND_ROLLED_BACK/);
 const preserved=async()=>{
  const {rows}=await db.query(`select (select count(*) from auth.users)::integer as users,
   (select count(*) from public.projects)::integer as projects,(select count(*) from public.piece_versions)::integer as pieces,
   (select count(*) from public.agent_attempts)::integer as attempts`);
  assert.deepEqual(rows[0],{users:1,projects:1,pieces:0,attempts:0});
 };
 await preserved();
 // Supabase Auth's known stored expression is allowed only with exact types.
 await db.exec(`alter table auth.users add column email_confirmed_at timestamptz,
  add column phone_confirmed_at timestamptz,
  add column confirmed_at timestamptz generated always as (least(email_confirmed_at,phone_confirmed_at)) stored`);
 assert.match((await call()).stdout,/RLS_SYNTHETIC_CHECKS_PASSED_AND_ROLLED_BACK/);await preserved();
 await db.exec(`alter table auth.users drop column confirmed_at;
  alter table auth.users add column confirmed_at timestamptz generated always as (greatest(email_confirmed_at,phone_confirmed_at)) stored`);
 await assert.rejects(call(),e=>e.code!==0 && /unexpected table, RLS, trigger, rule, descendant or generated column/.test(e.stderr));
 await db.exec('alter table auth.users drop column confirmed_at');await preserved();
 await db.exec('alter table public.projects add column unexpected integer generated always as (1) stored');
 await assert.rejects(call(),e=>e.code!==0 && /unexpected table, RLS, trigger, rule, descendant or generated column/.test(e.stderr));
 await db.exec('alter table public.projects drop column unexpected');await preserved();
 await db.exec('create policy unexpected_read on public.projects for select to authenticated using(true)');
 await assert.rejects(call(),e=>e.code!==0 && /RLS check for synthetic identity A failed/.test(e.stdout));
 await db.exec('drop policy unexpected_read on public.projects');await preserved();
 await db.exec('create policy unexpected_insert on public.agent_attempts for insert to authenticated with check(true)');
 await assert.rejects(call(),e=>e.code!==0 && /cross-account insert was not denied/.test(e.stderr));
 await db.exec('drop policy unexpected_insert on public.agent_attempts');await preserved();
 await db.exec(`create function auth.unsafe() returns trigger language plpgsql as $$begin return new;end$$;
  create trigger unsafe before insert on auth.users for each row execute function auth.unsafe();`);
 await assert.rejects(call(),e=>e.code!==0 && /unexpected table, RLS, trigger, rule, descendant or generated column/.test(e.stderr));
 await preserved();
 await db.exec('drop trigger unsafe on auth.users;create table public.project_child() inherits(public.projects)');
 await assert.rejects(call(),e=>e.code!==0 && /unexpected table, RLS, trigger, rule, descendant or generated column/.test(e.stderr));
 await db.exec('drop table public.project_child');await preserved();
});

test('wrapper fixa destino, verifica CA e remove PG* herdadas',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'compor-rls-wrapper-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const fp='sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
 const openssl=join(dir,'openssl'),psql=join(dir,'psql'),ca=join(dir,'ca'),args=join(dir,'args'),envFile=join(dir,'env');
 await writeFile(ca,'synthetic');await writeFile(openssl,`#!/bin/sh\nprintf '%s\\n' '${fp}'\n`);await chmod(openssl,0o700);
 await writeFile(psql,`#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${envFile}'\n`);await chmod(psql,0o700);
 const env={...process.env,PATH:`${dir}:${process.env.PATH}`,TMPDIR:dir,PGHOST:'attacker.invalid',PGOPTIONS:'malicious'};
 let result=spawnSync('sh',[wrapper,ca],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const argv=(await readFile(args,'utf8')).split('\n'),child=(await readFile(envFile,'utf8')).split('\n');
 assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co'));assert.ok(argv.includes('-W'));
 assert.ok(child.includes('PGSSLMODE=verify-full'));assert.ok(child.includes('PGGSSENCMODE=disable'));
 assert.ok(!child.some(value=>value.startsWith('PGHOST=')||value.startsWith('PGOPTIONS=')));
 await writeFile(openssl,"#!/bin/sh\nprintf '%s\\n' 'wrong'\n");
 result=spawnSync('sh',[wrapper,ca],{env,encoding:'utf8'});assert.notEqual(result.status,0);
});
