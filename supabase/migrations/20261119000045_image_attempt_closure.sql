-- Closes a provider refusal without leaving the account blocked, and gives an
-- unconfirmed or dead run a deadline plus an explicit close. Applying this file
-- on a remote database waits for Matheus: do it only when no image generation
-- is in flight. Rows already running without a lease become closable.
-- This does not change RLS policies. New functions use the same authenticated
-- execute grant as the existing image RPCs.

alter table public.image_tool_executions
  add column if not exists lease_expires_at timestamptz,
  add column if not exists unconfirmed_expires_at timestamptz,
  add column if not exists closure_reason text,
  add column if not exists provider_outcome text;

alter table public.image_tool_executions drop constraint if exists image_tool_executions_state_check;
alter table public.image_tool_executions
  add constraint image_tool_executions_state_check
    check (state in ('running','unknown','completed','quality_held','failed'));
alter table public.image_tool_executions drop constraint if exists image_tool_executions_closure_check;
alter table public.image_tool_executions
  add constraint image_tool_executions_closure_check check (
    (state = 'failed'
      and closure_reason in ('provider_rejected_400','provider_rejected_429','result_unknown')
      and provider_outcome in ('failure','retryable','unconfirmed')
      and (
        (closure_reason = 'provider_rejected_400' and provider_outcome = 'failure')
        or (closure_reason = 'provider_rejected_429' and provider_outcome = 'retryable')
        or (closure_reason = 'result_unknown' and provider_outcome in ('retryable','unconfirmed'))
      ))
    or (state <> 'failed' and closure_reason is null and provider_outcome is null)
  );

alter table public.exploration_images
  add column if not exists lease_expires_at timestamptz,
  add column if not exists unconfirmed_expires_at timestamptz,
  add column if not exists closure_reason text,
  add column if not exists provider_outcome text;

alter table public.exploration_images drop constraint if exists exploration_images_state_check;
alter table public.exploration_images
  add constraint exploration_images_state_check
    check (state in ('running','unknown','completed','rejected','closed_unknown','quality_held','failed'));
alter table public.exploration_images drop constraint if exists exploration_images_closure_check;
alter table public.exploration_images
  add constraint exploration_images_closure_check check (
    (state = 'failed'
      and closure_reason in ('provider_rejected_400','provider_rejected_429','result_unknown')
      and provider_outcome in ('failure','retryable','unconfirmed')
      and (
        (closure_reason = 'provider_rejected_400' and provider_outcome = 'failure')
        or (closure_reason = 'provider_rejected_429' and provider_outcome = 'retryable')
        or (closure_reason = 'result_unknown' and provider_outcome in ('retryable','unconfirmed'))
      ))
    or (state <> 'failed' and closure_reason is null and provider_outcome is null)
  );

drop index if exists public.exploration_position_per_batch;
create unique index exploration_position_per_batch
  on public.exploration_images(owner_id, project_id, batch_id, batch_position)
  where batch_id is not null and state not in ('rejected','quality_held','failed');

create or replace function public.stamp_image_work_lease()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.state = 'running' and new.lease_expires_at is null then
    new.lease_expires_at := pg_catalog.clock_timestamp() + interval '8 minutes';
  end if;
  return new;
end $$;

drop trigger if exists image_tool_executions_stamp_lease on public.image_tool_executions;
create trigger image_tool_executions_stamp_lease
  before insert on public.image_tool_executions
  for each row execute function public.stamp_image_work_lease();

drop trigger if exists exploration_images_stamp_lease on public.exploration_images;
create trigger exploration_images_stamp_lease
  before insert on public.exploration_images
  for each row execute function public.stamp_image_work_lease();

-- Moves a dead run out of waiting and, after the unconfirmed deadline, closes
-- it without contacting a provider or inserting another reservation.
create or replace function public.expire_image_work(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null then return; end if;
  update public.image_tool_executions
    set state = 'unknown',
        unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'running'
      and (lease_expires_at is null or lease_expires_at <= pg_catalog.clock_timestamp());
  update public.exploration_images
    set state = 'unknown',
        unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'running'
      and (lease_expires_at is null or lease_expires_at <= pg_catalog.clock_timestamp());
  update public.image_tool_executions
    set unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'unknown' and unconfirmed_expires_at is null;
  update public.exploration_images
    set unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'unknown' and unconfirmed_expires_at is null;
  update public.image_tool_executions
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'unknown'
      and unconfirmed_expires_at <= pg_catalog.clock_timestamp();
  update public.exploration_images
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and state = 'unknown'
      and unconfirmed_expires_at <= pg_catalog.clock_timestamp();
end $$;

create or replace function public.fail_image_tool_execution(
  p_execution_id uuid, p_closure_reason text, p_provider_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_reason text; v_outcome text;
begin
  if v_owner is null or p_execution_id is null
     or p_closure_reason not in ('provider_rejected_400','provider_rejected_429','result_unknown')
     or p_provider_outcome not in ('failure','retryable','unconfirmed')
     or (p_closure_reason = 'provider_rejected_400' and p_provider_outcome <> 'failure')
     or (p_closure_reason = 'provider_rejected_429' and p_provider_outcome <> 'retryable')
     or (p_closure_reason = 'result_unknown' and p_provider_outcome not in ('retryable','unconfirmed')) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, e.closure_reason, e.provider_outcome into v_state, v_reason, v_outcome
    from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id
    join public.projects p on p.id = r.project_id
    where e.id = p_execution_id and e.owner_id = v_owner and r.owner_id = v_owner and p.owner_id = v_owner
    for update of e;
  if not found then raise exception 'execution unavailable' using errcode = '42501'; end if;
  if v_state = 'failed' then return v_reason = p_closure_reason and v_outcome = p_provider_outcome; end if;
  if v_state <> 'running' then raise exception 'execution unavailable' using errcode = '42501'; end if;
  update public.image_tool_executions
    set state = 'failed', closure_reason = p_closure_reason, provider_outcome = p_provider_outcome,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_execution_id;
  return true;
end $$;

create or replace function public.image_execution_closure(p_execution_id uuid)
returns table(closure_reason text, provider_outcome text)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or p_execution_id is null then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  return query
    select e.closure_reason, e.provider_outcome
    from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id
    join public.projects p on p.id = r.project_id
    where e.id = p_execution_id and e.owner_id = v_owner and e.state = 'failed'
      and r.owner_id = v_owner and p.owner_id = v_owner;
end $$;

-- Explicit close. It never inserts a reservation and never calls a provider.
-- A run still inside its lease stays running.
create or replace function public.close_unconfirmed_image_work()
returns text language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_closed integer := 0; v_count integer;
begin
  if v_owner is null then raise exception 'unavailable' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  update public.image_tool_executions
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = v_owner and (
      state = 'unknown'
      or (state = 'running' and (lease_expires_at is null or lease_expires_at <= pg_catalog.clock_timestamp()))
    );
  get diagnostics v_count = row_count; v_closed := v_closed + v_count;
  update public.exploration_images
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where owner_id = v_owner and (
      state = 'unknown'
      or (state = 'running' and (lease_expires_at is null or lease_expires_at <= pg_catalog.clock_timestamp()))
    );
  get diagnostics v_count = row_count; v_closed := v_closed + v_count;
  if v_closed > 0 then return 'closed'; end if;
  return 'already_closed';
end $$;

create or replace function public.image_account_hold(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_project uuid; v_title text; v_state text; v_screen text;
begin
  if v_owner is null or p_project_id is null then return jsonb_build_object('screen','none'); end if;
  if not exists(select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_owner and p.deleted_at is null) then
    return jsonb_build_object('screen','none');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  perform public.expire_image_work(v_owner);
  select item.project_id, item.title, item.state into v_project, v_title, v_state
  from (
    select r.project_id, p.title, e.state, e.created_at
      from public.image_tool_executions e
      join public.image_tool_reservations r on r.id = e.reservation_id and r.owner_id = e.owner_id
      join public.projects p on p.id = r.project_id and p.owner_id = e.owner_id
      where e.owner_id = v_owner and e.state in ('running','unknown') and p.deleted_at is null
    union all
    select e.project_id, p.title, e.state, e.created_at
      from public.exploration_images e
      join public.projects p on p.id = e.project_id and p.owner_id = e.owner_id
      where e.owner_id = v_owner and e.state in ('running','unknown') and p.deleted_at is null
  ) item
  order by item.created_at
  limit 1;
  if not found then return jsonb_build_object('screen','none'); end if;
  v_screen := case when v_state = 'running' then 'running_with_lease' else 'result_unknown' end;
  return jsonb_build_object(
    'screen', v_screen,
    'projectId', v_project,
    'projectTitle', v_title,
    'sameProject', v_project = p_project_id
  );
end $$;

create or replace function public.fail_exploration_image(
  p_project_id uuid, p_id uuid, p_rejection_secret text, p_closure_reason text, p_provider_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_digest text; v_state text; v_reason text; v_outcome text;
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null
     or p_rejection_secret !~ '^[a-f0-9]{64}$'
     or p_closure_reason not in ('provider_rejected_400','provider_rejected_429','result_unknown')
     or p_provider_outcome not in ('failure','retryable','unconfirmed')
     or (p_closure_reason = 'provider_rejected_400' and p_provider_outcome <> 'failure')
     or (p_closure_reason = 'provider_rejected_429' and p_provider_outcome <> 'retryable')
     or (p_closure_reason = 'result_unknown' and p_provider_outcome not in ('retryable','unconfirmed')) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, e.closure_reason, e.provider_outcome into v_state, v_reason, v_outcome
    from public.exploration_images e
    where e.id = p_id and e.owner_id = v_owner and e.project_id = p_project_id
    for update;
  if not found then raise exception 'unavailable' using errcode = '42501'; end if;
  if v_state = 'failed' then return v_reason = p_closure_reason and v_outcome = p_provider_outcome; end if;
  select p.digest into v_digest from public.exploration_rejection_proofs p
    where p.image_id = p_id and p.owner_id = v_owner and p.project_id = p_project_id;
  if not found or v_digest <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex') then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  if v_state <> 'running' then raise exception 'unavailable' using errcode = '42501'; end if;
  update public.exploration_images
    set state = 'failed', closure_reason = p_closure_reason, provider_outcome = p_provider_outcome,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_id;
  delete from public.exploration_rejection_proofs p
    where p.image_id = p_id and p.owner_id = v_owner and p.project_id = p_project_id;
  return true;
end $$;

create or replace function public.image_tool_wait_status(
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
  perform public.expire_image_work(v_owner);

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
  elsif exists (select 1 from public.exploration_images e where e.owner_id = v_owner and e.state = 'running'
                and e.lease_expires_at > pg_catalog.clock_timestamp()) then
    v_status := 'waiting_exploration';
  elsif exists (select 1 from public.image_tool_executions e where e.owner_id = v_owner and e.state = 'running'
                and e.lease_expires_at > pg_catalog.clock_timestamp()) then
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
end $$;

create or replace function public.claim_image_tool_execution(p_reservation_id uuid)
returns table (execution_id uuid, asset_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_reservation_state text; v_attempt_state text; v_id uuid; v_asset uuid; v_state text; v_waiter uuid;
begin
  if v_owner is null or p_reservation_id is null then raise exception 'invalid request' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  perform public.expire_image_work(v_owner);
  select r.state, a.state into v_reservation_state, v_attempt_state
    from public.image_tool_reservations r join public.agent_attempts a on a.id = r.agent_attempt_id
    join public.projects p on p.id = r.project_id
    where r.id = p_reservation_id and r.owner_id = v_owner and a.owner_id = v_owner
      and a.project_id = r.project_id and p.owner_id = v_owner for update of r, a;
  if not found then raise exception 'execution unavailable' using errcode = '42501'; end if;
  select e.id,e.asset_id,e.state into v_id,v_asset,v_state from public.image_tool_executions e
    where e.reservation_id=p_reservation_id and e.owner_id=v_owner;
  if v_id is not null then return query select v_id,v_asset,v_state,false; return; end if;
  if not exists(select 1 from public.image_tool_reservations r join public.projects p on p.id=r.project_id where r.id=p_reservation_id and p.deleted_at is null
    and not exists(select 1 from public.project_posts pp where pp.project_id=r.project_id and pp.piece_id=r.piece_id and pp.deleted_at is not null)) then raise exception 'execution unavailable' using errcode='42501'; end if;
  if v_reservation_state <> 'reserved' or v_attempt_state <> 'started' or not exists (
    select 1 from public.image_consent_declarations d where d.reservation_id=p_reservation_id and d.owner_id=v_owner
  ) then raise exception 'execution unavailable' using errcode = '42501'; end if;
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.expires_at <= now();
  select w.reservation_id into v_waiter from public.foreground_image_waits w where w.owner_id=v_owner;
  if v_waiter is not null and v_waiter <> p_reservation_id then
    return query select null::uuid,null::uuid,'busy'::text,false; return;
  end if;
  if exists (select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state='unknown')
    or exists (select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='unknown')
    or exists (select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='unknown') then
    return query select null::uuid,null::uuid,'blocked'::text,false; return;
  end if;
  if exists (select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists (select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='running' and e.lease_expires_at > pg_catalog.clock_timestamp())
    or exists (select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='running' and e.lease_expires_at > pg_catalog.clock_timestamp()) then
    insert into public.foreground_image_waits(owner_id,reservation_id,expires_at)
      values(v_owner,p_reservation_id,now()+interval '15 seconds')
      on conflict(owner_id) do update set expires_at=excluded.expires_at;
    return query select null::uuid,null::uuid,'busy'::text,false; return;
  end if;
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.reservation_id=p_reservation_id;
  insert into public.image_tool_executions(owner_id,reservation_id,lease_expires_at)
    values(v_owner,p_reservation_id,pg_catalog.clock_timestamp() + interval '8 minutes')
    returning id,image_tool_executions.asset_id into v_id,v_asset;
  return query select v_id,v_asset,'running'::text,true;
end $$;

create or replace function public.mark_image_tool_execution_unknown(p_execution_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text;
begin
  select e.state into v_state from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id
    join public.projects p on p.id = r.project_id
    where e.id = p_execution_id and e.owner_id = v_owner and r.owner_id = v_owner and p.owner_id = v_owner for update of e;
  if not found or v_state = 'completed' then raise exception 'execution unavailable' using errcode = '42501'; end if;
  if v_state = 'running' then
    update public.image_tool_executions
      set state = 'unknown',
          unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
          updated_at = pg_catalog.clock_timestamp()
      where id = p_execution_id;
  end if;
  return true;
end $$;

create or replace function public.exploration_batch_admission(p_owner uuid, p_project uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public.expire_image_work(p_owner);
  if exists(select 1 from public.exploration_planning_attempts where owner_id=p_owner and exploration_planning_attempts.state='unknown')
    or exists(select 1 from public.exploration_images where owner_id=p_owner and exploration_images.state='unknown')
    or exists(select 1 from public.image_tool_executions where owner_id=p_owner and image_tool_executions.state='unknown') then return 'blocked'; end if;
  if exists(select 1 from public.exploration_planning_attempts where owner_id=p_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists(select 1 from public.exploration_images where owner_id=p_owner and exploration_images.state='running' and exploration_images.lease_expires_at > pg_catalog.clock_timestamp())
    or exists(select 1 from public.image_tool_executions where owner_id=p_owner and image_tool_executions.state='running' and image_tool_executions.lease_expires_at > pg_catalog.clock_timestamp())
    or exists(select 1 from public.foreground_image_waits where owner_id=p_owner and expires_at>clock_timestamp()) then return 'busy'; end if;
  if exists(select 1 from public.exploration_batches where owner_id=p_owner and exploration_batches.state<>'completed' and closed_at is null) then return 'partial'; end if;
  perform public.ensure_exploration_review_gate(p_owner,p_project);
  if exists(select 1 from public.exploration_review_gates where owner_id=p_owner and project_id=p_project and awaiting_feedback) then return 'awaiting_feedback'; end if;
  if exists(select 1 from public.exploration_batches where owner_id=p_owner and project_id=p_project and next_at>clock_timestamp()) then return 'cooldown'; end if;
  return 'ready';
end $$;

revoke all on function public.stamp_image_work_lease(), public.expire_image_work(uuid) from public, anon, authenticated;
revoke all on function public.fail_image_tool_execution(uuid,text,text), public.image_execution_closure(uuid),
  public.close_unconfirmed_image_work(), public.image_account_hold(uuid), public.fail_exploration_image(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.fail_image_tool_execution(uuid,text,text), public.image_execution_closure(uuid),
  public.close_unconfirmed_image_work(), public.image_account_hold(uuid), public.fail_exploration_image(uuid,uuid,text,text,text)
  to authenticated;
