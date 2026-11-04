-- Experimental only. Reservation is not approval or permission to generate.
create table public.image_tool_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  piece_id uuid not null,
  piece_version integer not null,
  agent_attempt_id uuid not null references public.agent_attempts(id),
  session_id text not null,
  turn_id text not null,
  call_id text not null,
  state text not null default 'reserved' check (state in ('reserved', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, piece_id, piece_version) references public.piece_versions(project_id, piece_id, version),
  unique (session_id, turn_id, call_id)
);
alter table public.image_tool_reservations enable row level security;
revoke all on public.image_tool_reservations from public, anon, authenticated;
grant select on public.image_tool_reservations to authenticated;
create policy image_tool_reservations_select_owner on public.image_tool_reservations
  for select to authenticated using ((select auth.uid()) = owner_id);

-- This validates ownership and linkage, not consent or provider-session provenance.
create function public.reserve_image_tool_call(p_project_id uuid, p_piece_id uuid, p_piece_version integer, p_attempt_id uuid, p_session_id text, p_turn_id text, p_call_id text)
returns table (reservation_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_id uuid; v_state text; v_attempt_state text;
begin
  if v_owner is null or p_project_id is null or p_piece_id is null or p_piece_version is null or p_piece_version < 1 or p_attempt_id is null or
     p_session_id is null or p_session_id !~ '^sess_[A-Za-z0-9_-]{1,128}$' or
     p_turn_id is null or p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$' or
     p_call_id is null or p_call_id !~ '^call_[A-Za-z0-9_-]{1,128}$' or
     pg_catalog.strpos(pg_catalog.lower(p_session_id || p_turn_id || p_call_id), 'sk-') > 0 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  select a.state into v_attempt_state from public.projects p join public.piece_versions v on v.project_id = p.id
    join public.agent_attempts a on a.project_id = p.id
    where p.id = p_project_id and p.owner_id = v_owner and v.piece_id = p_piece_id and v.version = p_piece_version
      and a.id = p_attempt_id and a.owner_id = v_owner;
  if not found then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  select r.id, r.state into v_id, v_state from public.image_tool_reservations r
    where r.owner_id = v_owner and r.project_id = p_project_id and r.piece_id = p_piece_id and r.piece_version = p_piece_version
      and r.agent_attempt_id = p_attempt_id and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id;
  if v_id is not null then return query select v_id, v_state, false; return; end if;
  if v_attempt_state <> 'started' then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  insert into public.image_tool_reservations(owner_id, project_id, piece_id, piece_version, agent_attempt_id, session_id, turn_id, call_id)
    values(v_owner, p_project_id, p_piece_id, p_piece_version, p_attempt_id, p_session_id, p_turn_id, p_call_id)
    on conflict (session_id, turn_id, call_id) do nothing returning id into v_id;
  if v_id is not null then return query select v_id, 'reserved'::text, true; return; end if;
  select r.id, r.state into v_id, v_state from public.image_tool_reservations r
    where r.owner_id = v_owner and r.project_id = p_project_id and r.piece_id = p_piece_id and r.piece_version = p_piece_version
      and r.agent_attempt_id = p_attempt_id and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id;
  if v_id is null then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  return query select v_id, v_state, false;
end;
$$;

create function public.mark_image_tool_call_unknown(p_project_id uuid, p_session_id text, p_turn_id text, p_call_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.image_tool_reservations r set state = 'unknown', updated_at = now()
    where r.owner_id = (select auth.uid()) and r.project_id = p_project_id and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id and r.state = 'reserved';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.mark_image_tool_call_unknown(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text) to authenticated;
grant execute on function public.mark_image_tool_call_unknown(uuid,text,text,text) to authenticated;
