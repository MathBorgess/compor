import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

test('gate compartilhado pausa dois lotes, serializa interação e protege retomada',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
   create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id));
   alter table public.projects enable row level security; grant select on public.projects to authenticated;
   create policy project_select on public.projects for select to authenticated using(owner_id=auth.uid());
   create table public.agent_attempts(id uuid primary key,owner_id uuid,project_id uuid,state text);
   create table public.image_tool_reservations(id uuid primary key,owner_id uuid,project_id uuid,agent_attempt_id uuid,state text);
   create table public.image_consent_declarations(reservation_id uuid,owner_id uuid);
   create table public.image_tool_executions(id uuid primary key default gen_random_uuid(),owner_id uuid,reservation_id uuid,asset_id uuid default gen_random_uuid(),state text default 'running');
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;`);
  for(const file of ['20261106000018_exploration_images.sql','20261106000019_exploration_feedback.sql','20261106000020_exploration_batches.sql'])await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',project='00000000-0000-4000-8000-000000000003',otherProject='00000000-0000-4000-8000-000000000004';
  const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,digest='a'.repeat(64);
  await db.query('insert into auth.users values ($1),($2)',[owner,other]);await db.query('insert into public.projects values ($1,$2),($3,$4)',[project,owner,otherProject,other]);
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  async function reserve(id,projectId=project){return (await db.query('select * from public.reserve_exploration_image($1,$2,$3)',[projectId,id,digest])).rows[0];}
  async function finish(id,projectId=project,actor=owner){await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['compor-exploration-images',`${actor}/${projectId}/${id}.png`]);await db.query("select public.finish_exploration_image($1,$2,'completed')",[projectId,id]);}
  // Legacy history, including six completed images, must not count toward the new gate.
  for(let n=1;n<=6;n++){assert.equal((await reserve(uid(n))).is_new,true);await finish(uid(n));}
  await db.exec('reset role');await db.exec(await readFile(new URL('../../supabase/migrations/20261106000023_exploration_review_gate.sql',import.meta.url),'utf8'));await db.exec('set role authenticated');
  assert.equal((await db.query('select public.exploration_review_status($1) as status',[project])).rows[0].status,'active');
  for(let n=7;n<=12;n++){assert.equal((await reserve(uid(n))).is_new,true);await finish(uid(n));}
  assert.deepEqual(await reserve(uid(13)),{state:'awaiting_feedback',is_new:false});
  assert.equal((await db.query('select public.exploration_review_status($1) as status',[project])).rows[0].status,'awaiting_feedback');
  // A different tab using the batched API cannot bypass the same gate.
  assert.deepEqual((await db.query('select * from public.reserve_exploration_image_batched($1,$2,$3,$4,1)',[project,uid(14),digest,uid(100)])).rows,[{state:'awaiting_feedback',is_new:false}]);
  await db.query("insert into public.generated_image_signals(id,project_id,image_id,action,comment) values($1,$2,$3,'selected','')",[uid(101),project,uid(12)]);
  assert.deepEqual(await reserve(uid(15)),{state:'awaiting_feedback',is_new:false},'late selection does not resume');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  assert.equal((await db.query('select * from public.exploration_review_gates')).rows.length,0);await assert.rejects(db.query('select public.resume_exploration_review($1)',[project]));
  await assert.rejects(db.query('select public.exploration_review_status($1)',[project]));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  assert.equal((await db.query('select public.resume_exploration_review($1) as status',[project])).rows[0].status,'resumed');
  assert.equal((await db.query('select public.resume_exploration_review($1) as status',[project])).rows[0].status,'not_paused');
  for(let n=20;n<=22;n++){assert.equal((await reserve(uid(n))).is_new,true);await finish(uid(n));}
  // Selecting a completed image before the second batch closes resets the window.
  await db.query("insert into public.generated_image_signals(id,project_id,image_id,action,comment) values($1,$2,$3,'comment','gosto desta')",[uid(102),project,uid(20)]);
  for(let n=23;n<=25;n++){assert.equal((await reserve(uid(n))).is_new,true);await finish(uid(n));}
  assert.equal((await reserve(uid(26))).is_new,true);await finish(uid(26));
  await db.query("insert into public.generated_image_signals(id,project_id,image_id,action,comment) values($1,$2,$3,'selected','')",[uid(103),project,uid(26)]);
  for(let n=27;n<=31;n++){assert.equal((await reserve(uid(n))).is_new,true);await finish(uid(n));}
  assert.equal((await reserve(uid(32))).is_new,true);await finish(uid(32));
  assert.equal((await reserve(uid(33))).is_new,true);await finish(uid(33));
  assert.equal((await reserve(uid(34))).is_new,true);await finish(uid(34));
  assert.deepEqual(await reserve(uid(35)),{state:'awaiting_feedback',is_new:false},'interação no lote parcial descarta apenas o lote em questão');
  await db.exec('reset role');
  await db.query("insert into public.image_tool_executions(owner_id,state) values($1,'unknown')",[owner]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select public.resume_exploration_review($1) as status',[project])).rows[0].status,'blocked');
  assert.deepEqual(await reserve(uid(36)),{state:'blocked',is_new:false},'incerteza prevalece sobre a pausa visual');
 } finally {await db.close();}
});
