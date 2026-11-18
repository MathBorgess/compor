import {readFile} from 'node:fs/promises';
export const migrationNames=[
  '20261105000013_studio_turn_metadata.sql','20261106000018_exploration_images.sql',
  '20261106000019_exploration_feedback.sql','20261106000020_exploration_batches.sql',
  '20261106000023_exploration_review_gate.sql','20261106000025_exploration_rejection_proof.sql',
  '20261115000030_project_deletion.sql','20261115000031_project_posts.sql',
  '20261117000033_exploration_parallel_batches.sql',
];
// Supabase Auth/Storage boundary is a local fixture; application migrations are real.
export const bootstrap=`create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
create table public.projects(id uuid primary key,owner_id uuid not null references auth.users(id),revision integer not null default 1);
alter table public.projects enable row level security; grant select on public.projects to authenticated;
create policy project_select on public.projects for select to authenticated using(owner_id=auth.uid());
create table public.agent_attempts(id uuid primary key default gen_random_uuid(),owner_id uuid,project_id uuid,state text default 'started',idempotency_key uuid,unique(owner_id,idempotency_key));
create table public.image_tool_reservations(id uuid primary key,owner_id uuid,project_id uuid,piece_id uuid,agent_attempt_id uuid,state text);
create table public.image_consent_declarations(reservation_id uuid,owner_id uuid);
create table public.image_tool_executions(id uuid primary key default gen_random_uuid(),owner_id uuid,reservation_id uuid,asset_id uuid default gen_random_uuid(),state text default 'running');
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security; grant select,insert,update,delete on storage.objects to authenticated;`;
export async function databaseSql({parallel=true}={}) {
  const files=parallel?migrationNames:migrationNames.slice(0,-1);
  return bootstrap+'\n'+(await Promise.all(files.map(file=>readFile(new URL(`../../../supabase/migrations/${file}`,import.meta.url),'utf8')))).join('\n');
}
