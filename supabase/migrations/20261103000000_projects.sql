-- Apply only to an isolated Compor Supabase project after review.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(trim(title)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;
grant insert (title) on public.projects to authenticated;

create policy projects_select_owner on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_insert_owner on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
