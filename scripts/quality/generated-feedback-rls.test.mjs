import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
test('planos e sinais gerados exigem o dono, projeto e imagem exatos',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.projects(id uuid primary key,owner_id uuid not null);create table public.exploration_images(id uuid primary key,owner_id uuid not null,project_id uuid not null,state text not null);alter table public.projects enable row level security;alter table public.exploration_images enable row level security;grant select on public.projects,public.exploration_images to authenticated;create policy ps on public.projects for select to authenticated using(owner_id=auth.uid());create policy es on public.exploration_images for select to authenticated using(owner_id=auth.uid());`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261106000019_exploration_feedback.sql',import.meta.url),'utf8'));
  const u1='00000000-0000-4000-8000-000000000001',u2='00000000-0000-4000-8000-000000000002',p1='00000000-0000-4000-8000-000000000003',p2='00000000-0000-4000-8000-000000000004',image='00000000-0000-4000-8000-000000000005',signal='00000000-0000-4000-8000-000000000006';
  await db.query('insert into auth.users values ($1),($2)',[u1,u2]);await db.query('insert into public.projects values ($1,$2),($3,$4)',[p1,u1,p2,u2]);await db.query('insert into public.exploration_images values ($1,$2,$3,$4)',[image,u1,p1,'running']);
  await db.exec('set role authenticated');await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',u1]);
  await assert.rejects(db.query('insert into public.exploration_plans(image_id,project_id,composition,contrast) values ($1,$2,$3,$4)',[image,p2,'grid','calmo']));
  await db.query('insert into public.exploration_plans(image_id,project_id,composition,contrast) values ($1,$2,$3,$4)',[image,p1,'grid','calmo']);
  await assert.rejects(db.query('insert into public.generated_image_signals(id,project_id,image_id,action) values ($1,$2,$3,$4)',[signal,p1,image,'selected']));
  await db.exec('reset role');await db.query('update public.exploration_images set state=$1 where id=$2',['completed',image]);await db.exec('set role authenticated');
  await db.query('insert into public.generated_image_signals(id,project_id,image_id,action) values ($1,$2,$3,$4)',[signal,p1,image,'selected']);
  await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',u2]);
  assert.equal((await db.query('select * from public.generated_image_signals')).rows.length,0);assert.equal((await db.query('select * from public.exploration_plans')).rows.length,0);
  await assert.rejects(db.query('insert into public.generated_image_signals(id,project_id,image_id,action) values ($1,$2,$3,$4)',[signal,p1,image,'rejected']));
 }finally{await db.close();}
});
