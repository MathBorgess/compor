import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root=fileURLToPath(new URL('../../../',import.meta.url)),run=promisify(execFile);
const sql=join(root,'supabase/tests/recovery_rls_rollback.sql');
test('psql valida recuperação entre duas identidades, preserva dados e recusa adulterações',async t=>{
 if(spawnSync('psql',['--version']).status!==0)return t.skip('psql indisponível');
 const dir=await mkdtemp(join(tmpdir(),'compor-recovery-socket-'));
 const db=await PGlite.create(),port=5432,server=new PGLiteSocketServer({db,path:join(dir,`.s.PGSQL.${port}`)});
 await server.start();t.after(async()=>{await server.stop();await db.close();await rm(dir,{recursive:true,force:true});});
 await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const name of ['20261103000000_projects.sql','20261103000001_piece_versions.sql','20261103000002_agent_attempts.sql','20261103000008_agent_attempt_state.sql','20261103000011_agent_session_recovery.sql']) await db.exec(await readFile(join(root,'supabase/migrations',name),'utf8'));
 await db.exec(`insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.projects(id,owner_id,title) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','keep-existing');`);
 const args=['-X','-v','ON_ERROR_STOP=1','-h',dir,'-p',String(port),'-U','postgres','-d','postgres','-f',sql];
 const waitForDisconnect=async()=>{
  const deadline=Date.now()+10000;
  while(server.getStats().activeConnections!==0 || db.isInTransaction()){
   if(Date.now()>deadline)throw Error('pglite socket did not finish disconnect rollback');
   await new Promise(resolve=>setTimeout(resolve,5));
  }
 };
 const call=async()=>{try{return await run('psql',args,{maxBuffer:1024*1024});}finally{await waitForDisconnect();}};
 const preserved=async()=>{
  const {rows}=await db.query(`select (select count(*) from auth.users)::integer users,
   (select count(*) from public.projects)::integer projects,(select count(*) from public.agent_attempts)::integer attempts,
   (select count(*) from public.agent_session_recovery)::integer recovery`);
  assert.deepEqual(rows[0],{users:1,projects:1,attempts:0,recovery:0});
 };
 assert.match((await call()).stdout,/RECOVERY_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);await preserved();
 const captured=join(dir,'capture.txt');
 await run('psql',[...args,'-o',captured],{maxBuffer:1024*1024});
 await waitForDisconnect();
 const evidence=await readFile(captured,'utf8');
 assert.match(evidence,/^ROLLBACK$/m);assert.match(evidence,/RECOVERY_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);await preserved();
 await db.exec('grant select on public.agent_session_recovery to authenticated');
 await assert.rejects(call(),e=>e.code!==0 && /unexpected recovery table privileges/.test(e.stderr));await preserved();
 await db.exec('revoke select on public.agent_session_recovery from authenticated');
 await db.exec('create policy unexpected on public.agent_session_recovery to authenticated using (true)');
 await assert.rejects(call(),e=>e.code!==0 && /unexpected recovery table privileges/.test(e.stderr));await preserved();
 await db.exec('drop policy unexpected on public.agent_session_recovery');
 await db.exec('alter function public.bind_agent_session_recovery(uuid,uuid,text) security invoker');
 await assert.rejects(call(),e=>e.code!==0 && /unexpected recovery function or permissions/.test(e.stderr));await preserved();
 await db.exec('alter function public.bind_agent_session_recovery(uuid,uuid,text) security definer');
 await db.exec(`create function auth.unsafe() returns trigger language plpgsql as $$begin return new;end$$;
  create trigger unsafe before insert on auth.users for each row execute function auth.unsafe()`);
 await assert.rejects(call(),e=>e.code!==0 && /unexpected table, RLS, trigger/.test(e.stderr));await preserved();
 await db.exec('drop trigger unsafe on auth.users');
 await db.exec(`create or replace function public.bind_agent_session_recovery(p_project_id uuid,p_attempt_id uuid,p_binding text)
  returns boolean language plpgsql security definer set search_path='' as $$begin return true;end$$`);
 await assert.rejects(call(),e=>e.code!==0 && /unexpected recovery function or permissions/.test(e.stderr));await preserved();
});
