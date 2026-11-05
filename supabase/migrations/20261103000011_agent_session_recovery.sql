-- Review and validate on the isolated pilot before applying. No API key or prompt
-- is stored. The backend verifies a domain-separated HMAC bound to the actor,
-- project and attempt before trusting this opaque provenance proof.
create table public.agent_session_recovery (
  attempt_id uuid primary key references public.agent_attempts(id),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  binding text not null check (length(binding) between 10 and 2048),
  created_at timestamptz not null default now()
);
alter table public.agent_session_recovery enable row level security;
revoke all on public.agent_session_recovery from public, anon, authenticated;

create function public.bind_agent_session_recovery(p_project_id uuid, p_attempt_id uuid, p_binding text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_binding text;
begin
  if v_owner is null or p_binding is null or length(p_binding) not between 10 and 2048
    or p_binding !~ '^v4[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then
    raise exception 'recovery unavailable' using errcode = '42501';
  end if;
  insert into public.agent_session_recovery(attempt_id,owner_id,project_id,binding)
    select a.id, v_owner, a.project_id, p_binding
    from public.agent_attempts a join public.projects p on p.id=a.project_id
    where a.id=p_attempt_id and a.project_id=p_project_id and a.owner_id=v_owner
      and p.owner_id=v_owner and a.state='started'
    on conflict (attempt_id) do nothing;
  select r.binding into v_binding from public.agent_session_recovery r
    join public.agent_attempts a on a.id=r.attempt_id
    join public.projects p on p.id=r.project_id
    where r.attempt_id=p_attempt_id and r.owner_id=v_owner and r.project_id=p_project_id
      and a.owner_id=v_owner and a.project_id=p_project_id and p.owner_id=v_owner;
  return v_binding is not null and v_binding=p_binding;
end $$;

create function public.get_agent_session_recovery(p_project_id uuid, p_idempotency_key uuid)
returns table (attempt_id uuid, attempt_state text, recovery_binding text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.state,r.binding from public.agent_attempts a
    join public.projects p on p.id=a.project_id
    join public.agent_session_recovery r on r.attempt_id=a.id and r.project_id=a.project_id and r.owner_id=a.owner_id
    where auth.uid() is not null and a.owner_id=auth.uid() and p.owner_id=auth.uid()
      and a.project_id=p_project_id and a.idempotency_key=p_idempotency_key;
$$;
revoke all on function public.bind_agent_session_recovery(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.get_agent_session_recovery(uuid,uuid) from public, anon, authenticated;
grant execute on function public.bind_agent_session_recovery(uuid,uuid,text) to authenticated;
grant execute on function public.get_agent_session_recovery(uuid,uuid) to authenticated;
