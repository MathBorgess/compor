-- Review and exercise against an isolated Supabase project before use.
create table public.agent_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null references public.projects(id),
  idempotency_key uuid not null,
  state text not null default 'started' check (state in ('started', 'completed', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

alter table public.agent_attempts enable row level security;
revoke all on public.agent_attempts from public, anon, authenticated;
grant select on public.agent_attempts to authenticated;
grant insert (project_id, idempotency_key) on public.agent_attempts to authenticated;
grant update (state, updated_at) on public.agent_attempts to authenticated;

create policy agent_attempts_select_owner on public.agent_attempts
  for select to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );
create policy agent_attempts_insert_owner on public.agent_attempts
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );
create policy agent_attempts_update_owner on public.agent_attempts
  for update to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create function public.reserve_agent_attempt(p_project_id uuid, p_idempotency_key uuid)
returns table (attempt_id uuid, state text, is_new boolean)
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_state text;
begin
  insert into public.agent_attempts (project_id, idempotency_key)
    values (p_project_id, p_idempotency_key)
    on conflict (owner_id, idempotency_key) do nothing
    returning id into v_id;
  if v_id is not null then
    return query select v_id, 'started'::text, true;
  else
    select a.id, a.state into v_id, v_state from public.agent_attempts a
      where a.owner_id = (select auth.uid()) and a.idempotency_key = p_idempotency_key and a.project_id = p_project_id;
    if v_id is null then raise exception 'attempt unavailable' using errcode = '42501'; end if;
    return query select v_id, v_state, false;
  end if;
end;
$$;

create function public.finish_agent_attempt(p_project_id uuid, p_attempt_id uuid, p_state text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_state not in ('completed', 'unknown') then raise exception 'invalid state' using errcode = '22023'; end if;
  update public.agent_attempts a set state = p_state, updated_at = now()
    where a.id = p_attempt_id and a.project_id = p_project_id and a.owner_id = (select auth.uid()) and a.state = 'started';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'attempt unavailable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.reserve_agent_attempt(uuid, uuid) from public, anon;
revoke all on function public.finish_agent_attempt(uuid, uuid, text) from public, anon;
grant execute on function public.reserve_agent_attempt(uuid, uuid) to authenticated;
grant execute on function public.finish_agent_attempt(uuid, uuid, text) to authenticated;
