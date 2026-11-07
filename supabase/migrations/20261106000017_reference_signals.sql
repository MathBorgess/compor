-- Apply only after review and isolated RLS validation. No implicit preference is stored.
create table public.reference_signals (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null references public.projects(id),
  origin_url text not null check (char_length(origin_url) between 1 and 300),
  board text not null check (char_length(board) between 1 and 120),
  action text not null check (action in ('selected','rejected','comment')),
  comment text not null default '' check (char_length(comment) <= 1000 and (action <> 'comment' or char_length(trim(comment)) > 0)),
  supersedes uuid,
  created_at timestamptz not null default now(),
  unique (id, owner_id, project_id, origin_url, board),
  foreign key (supersedes, owner_id, project_id, origin_url, board) references public.reference_signals (id, owner_id, project_id, origin_url, board),
  check (supersedes is distinct from id)
);
create index reference_signals_project_time on public.reference_signals (owner_id, project_id, created_at desc, id desc);
alter table public.reference_signals enable row level security;
revoke all on public.reference_signals from public, anon, authenticated;
grant select on public.reference_signals to authenticated;
grant insert (id,project_id,origin_url,board,action,comment,supersedes) on public.reference_signals to authenticated;
create policy reference_signals_select on public.reference_signals for select to authenticated using (owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy reference_signals_insert on public.reference_signals for insert to authenticated with check (owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
