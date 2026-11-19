-- Inspect an existing reservation without claiming it or contacting the provider.
-- Only the reservation's current, unexpired foreground lease can be renewed.
create function public.image_tool_wait_status(
  p_project_id uuid, p_piece_id uuid, p_piece_version integer, p_attempt_id uuid,
  p_session_id text, p_turn_id text, p_call_id text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_reservation uuid;
  v_waiter uuid;
  v_status text;
begin
  if v_owner is null then return 'unverified'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));

  select r.id into v_reservation
  from public.image_tool_reservations r
  join public.projects p on p.id = r.project_id and p.owner_id = r.owner_id
  join public.agent_attempts a on a.id = r.agent_attempt_id and a.owner_id = r.owner_id and a.project_id = r.project_id
  join public.image_consent_declarations d on d.reservation_id = r.id and d.owner_id = r.owner_id
  where r.owner_id = v_owner and r.project_id = p_project_id and r.piece_id = p_piece_id
    and r.piece_version = p_piece_version and r.agent_attempt_id = p_attempt_id
    and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id
    and r.state = 'reserved' and a.state = 'started' and p.deleted_at is null
    and not exists (select 1 from public.project_posts post
      where post.project_id = r.project_id and post.piece_id = r.piece_id and post.deleted_at is not null)
    and not exists (select 1 from public.image_tool_executions e where e.reservation_id = r.id);
  if not found then return 'unverified'; end if;

  select w.reservation_id into v_waiter from public.foreground_image_waits w
    where w.owner_id = v_owner and w.expires_at > pg_catalog.clock_timestamp();
  if v_waiter is not null and v_waiter <> v_reservation then return 'waiting_priority'; end if;

  if exists (select 1 from public.exploration_planning_attempts p where p.owner_id = v_owner and p.state = 'unknown')
     or exists (select 1 from public.exploration_images e where e.owner_id = v_owner and e.state = 'unknown')
     or exists (select 1 from public.image_tool_executions e where e.owner_id = v_owner and e.state = 'unknown') then
    return 'blocked';
  end if;

  if exists (select 1 from public.exploration_planning_attempts p where p.owner_id = v_owner and p.state in ('starting','running')) then
    v_status := 'waiting_planning';
  elsif exists (select 1 from public.exploration_images e where e.owner_id = v_owner and e.state = 'running') then
    v_status := 'waiting_exploration';
  elsif exists (select 1 from public.image_tool_executions e where e.owner_id = v_owner and e.state = 'running') then
    v_status := 'waiting_image';
  else
    v_status := 'ready';
  end if;

  if v_waiter = v_reservation then
    update public.foreground_image_waits
      set expires_at = pg_catalog.clock_timestamp() + interval '15 seconds'
      where owner_id = v_owner and reservation_id = v_reservation and expires_at > pg_catalog.clock_timestamp();
  end if;
  return v_status;
end;
$$;
revoke all on function public.image_tool_wait_status(uuid,uuid,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.image_tool_wait_status(uuid,uuid,integer,uuid,text,text,text) to authenticated;
