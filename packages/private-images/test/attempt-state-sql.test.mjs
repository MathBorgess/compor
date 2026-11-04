import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice='11111111-1111-4111-8111-111111111111', bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project='22222222-2222-4222-8222-222222222222', attempt='44444444-4444-4444-8444-444444444444';
async function setup(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to public;grant execute on function auth.uid() to public;`);
  for(const name of ['20261103000000_projects.sql','20261103000002_agent_attempts.sql'])
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261103000008_agent_attempt_state.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)',[alice,bob]);
  await db.query('insert into public.projects(id,owner_id,title) values($1,$2,$3)',[project,alice,'Oficina']);
  await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key) values($1,$2,$3,$4)',[attempt,alice,project,'55555555-5555-4555-8555-555555555555']);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${alice}',false)`);
  return db;
}

test('conta não altera estado de tentativa diretamente',async t=>{
  const db=await setup(t);
  await assert.rejects(()=>db.query("update public.agent_attempts set state='unknown' where id=$1",[attempt]));
});

test('somente titular encerra uma tentativa iniciada e não pode reabri-la',async t=>{
  const db=await setup(t);
  await assert.rejects(()=>db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,null]));
  await assert.rejects(()=>db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,'started']));
  await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
  await assert.rejects(()=>db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,'completed']));
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(()=>db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,'completed']));
  await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false)`);
  assert.equal((await db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,'unknown'])).rows[0].finish_agent_attempt,true);
  await assert.rejects(()=>db.query('select public.finish_agent_attempt($1,$2,$3)',[project,attempt,'completed']));
  await assert.rejects(()=>db.query("update public.agent_attempts set state='started' where id=$1",[attempt]));
  assert.equal((await db.query('select state from public.agent_attempts where id=$1',[attempt])).rows[0].state,'unknown');
});

test('reserva legítima continua idempotente e pode terminar como concluída',async t=>{
  const db=await setup(t), key='66666666-6666-4666-8666-666666666666';
  const first=(await db.query('select * from public.reserve_agent_attempt($1,$2)',[project,key])).rows[0];
  assert.equal(first.is_new,true); assert.equal(first.state,'started');
  assert.equal((await db.query('select public.finish_agent_attempt($1,$2,$3)',[project,first.attempt_id,'completed'])).rows[0].finish_agent_attempt,true);
  const repeated=(await db.query('select * from public.reserve_agent_attempt($1,$2)',[project,key])).rows[0];
  assert.equal(repeated.is_new,false);assert.equal(repeated.attempt_id,first.attempt_id);assert.equal(repeated.state,'completed');
});
