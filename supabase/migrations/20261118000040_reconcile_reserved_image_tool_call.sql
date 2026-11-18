-- Reconciliation follows the original call's reservation across versions of
-- the same post. Fencing succeeds only when no execution has been claimed.
create or replace function public.fence_unsubmitted_image_tool_call(
  p_project_id uuid,p_piece_id uuid,p_piece_version integer,p_attempt_id uuid,
  p_session_id text,p_turn_id text,p_call_id text
) returns text language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_reservation uuid;
  v_state text;
  v_new boolean;
begin
  if v_owner is null or p_project_id is null or p_piece_id is null or
     p_piece_version is null or p_piece_version < 1 or p_attempt_id is null or
     p_session_id is null or p_session_id !~ '^sess_[A-Za-z0-9_-]{1,128}$' or
     p_turn_id is null or p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$' or
     p_call_id is null or p_call_id !~ '^(call|exec)_[A-Za-z0-9_-]{1,128}$' or
     pg_catalog.strpos(pg_catalog.lower(p_session_id || p_turn_id || p_call_id), 'sk-') > 0 then
    raise exception 'invalid request' using errcode='22023';
  end if;

  -- Both execution claims take this lock. The existing-row branch locks only
  -- the reservation, since declaring consent can hold it while locking the attempt.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  perform 1 from public.projects p
    join public.piece_versions v on v.project_id=p.id
    join public.agent_attempts a on a.project_id=p.id
    where p.id=p_project_id and p.owner_id=v_owner
      and v.piece_id=p_piece_id and v.version=p_piece_version
      and a.id=p_attempt_id and a.owner_id=v_owner;
  if not found then raise exception 'reservation unavailable' using errcode='42501'; end if;

  select r.id,r.state into v_reservation,v_state
    from public.image_tool_reservations r
    where r.owner_id=v_owner and r.project_id=p_project_id and r.piece_id=p_piece_id
      and r.agent_attempt_id=p_attempt_id and r.session_id=p_session_id
      and r.turn_id=p_turn_id and r.call_id=p_call_id
    for update of r;
  if not found then
    select r.reservation_id,r.state,r.is_new into v_reservation,v_state,v_new
      from public.reserve_image_tool_call(p_project_id,p_piece_id,p_piece_version,p_attempt_id,p_session_id,p_turn_id,p_call_id) r;
    -- If a concurrent reserve inserted first, leave its row for the next call.
    -- This branch holds the attempt lock and must not lock the raced reservation.
    if v_new is distinct from true then return 'unverified'; end if;
  end if;

  if exists(select 1 from public.image_tool_executions e where e.reservation_id=v_reservation) then
    return 'unverified';
  end if;
  if v_state='unknown' and exists(select 1 from public.image_non_dispatch_fences f
      where f.reservation_id=v_reservation and f.owner_id=v_owner) then
    return 'fenced';
  end if;
  if v_state is distinct from 'reserved' then return 'unverified'; end if;

  update public.image_tool_reservations set state='unknown',updated_at=now()
    where id=v_reservation;
  insert into public.image_non_dispatch_fences(reservation_id,owner_id) values(v_reservation,v_owner);
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.reservation_id=v_reservation;
  return 'fenced';
end $$;

-- A closed turn can release its browser marker when the original reservations
-- are all fenced without claims. Preserve the legacy completed/no-reservation path.
create or replace function public.confirm_closed_image_attempt(p_project_id uuid,p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_attempt uuid;
  v_attempt_state text;
  v_turn_state text;
begin
  if v_owner is null or p_project_id is null or p_request_id is null then
    raise exception 'unavailable' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select a.id,a.state,t.state into v_attempt,v_attempt_state,v_turn_state
    from public.studio_turns t
    join public.agent_attempts a on a.id=t.attempt_id and a.owner_id=t.owner_id and a.project_id=t.project_id
    join public.projects p on p.id=t.project_id and p.owner_id=t.owner_id
    where t.owner_id=v_owner and t.project_id=p_project_id and t.request_id=p_request_id
      and t.state in ('completed','failed')
    for update of a;
  if not found then return 'unverified'; end if;
  if (v_turn_state='completed' and v_attempt_state<>'completed')
    or (v_turn_state='failed' and v_attempt_state<>'unknown') then
    return 'unverified';
  end if;

  if not exists(select 1 from public.image_tool_reservations r where r.agent_attempt_id=v_attempt) then
    if v_turn_state='completed' then return 'confirmed'; end if;
    return 'unverified';
  end if;
  if exists(select 1 from public.image_tool_reservations r
      where r.agent_attempt_id=v_attempt and (
        r.owner_id<>v_owner or r.project_id<>p_project_id or r.state<>'unknown'
        or not exists(select 1 from public.image_non_dispatch_fences f where f.reservation_id=r.id and f.owner_id=v_owner)
        or exists(select 1 from public.image_tool_executions e where e.reservation_id=r.id)
      )) then
    return 'unverified';
  end if;
  if v_turn_state='failed' then return 'failed_without_dispatch'; end if;
  return 'confirmed';
end $$;

revoke all on function public.fence_unsubmitted_image_tool_call(uuid,uuid,integer,uuid,text,text,text),
  public.confirm_closed_image_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fence_unsubmitted_image_tool_call(uuid,uuid,integer,uuid,text,text,text),
  public.confirm_closed_image_attempt(uuid,uuid) to authenticated;
