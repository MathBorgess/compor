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
      and closure_reason is not null and provider_outcome is not null
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
alter table public.exploration_images
  add constraint exploration_images_failure_outcome_check check (
    (state = 'failed'
      and closure_reason is not null and provider_outcome is not null
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
-- These helpers run with the owner's advisory lock held by the caller.
create function public.settle_failed_post_image_work(
  p_owner uuid, p_execution_id uuid, p_reason text, p_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_work record; v_request uuid; v_turn_state text; v_turn_id text; v_quality_reason text;
begin
  select e.state, e.asset_id, r.project_id, r.piece_id, r.piece_version,
    r.agent_attempt_id, r.turn_id, a.state as attempt_state
  into v_work
  from public.image_tool_executions e
  join public.image_tool_reservations r on r.id = e.reservation_id and r.owner_id = e.owner_id
  join public.agent_attempts a on a.id = r.agent_attempt_id
    and a.owner_id = r.owner_id and a.project_id = r.project_id
  join public.projects p on p.id = r.project_id and p.owner_id = e.owner_id
  where e.id = p_execution_id and e.owner_id = p_owner
  for update of e, a;
  if not found or v_work.state not in ('running','unknown') or v_work.attempt_state = 'completed' then
    return false;
  end if;

  select t.request_id, t.state, t.turn_id, t.image_quality_reason
  into v_request, v_turn_state, v_turn_id, v_quality_reason
  from public.studio_turns t
  where t.attempt_id = v_work.agent_attempt_id and t.owner_id = p_owner and t.project_id = v_work.project_id
  for update;
  if found and (v_turn_id is distinct from v_work.turn_id or v_turn_state not in ('running','action_required','unknown','failed')
      or v_quality_reason is not null) then
    return false;
  end if;

  if exists (
      select 1 from storage.objects o
      where o.bucket_id = 'compor-project-images'
        and o.name = p_owner::text || '/' || v_work.project_id::text || '/' || v_work.piece_id::text
          || '/' || v_work.piece_version::text || '/' || v_work.asset_id::text || '.png'
    ) or exists (
      select 1 from public.image_tool_result_submissions s where s.execution_id = p_execution_id
    ) or exists (
      select 1 from public.image_tool_reservations r
      join public.image_tool_executions other on other.reservation_id = r.id and other.owner_id = r.owner_id
      where r.agent_attempt_id = v_work.agent_attempt_id and r.owner_id = p_owner
        and other.id <> p_execution_id and other.state <> 'failed'
    ) then
    return false;
  end if;

  update public.image_tool_executions
    set state = 'failed', closure_reason = p_reason, provider_outcome = p_outcome,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_execution_id;
  if v_request is not null then
    update public.studio_turns set state = 'failed', updated_at = pg_catalog.clock_timestamp()
      where request_id = v_request;
  end if;
  update public.agent_attempts set state = 'unknown', updated_at = pg_catalog.clock_timestamp()
    where id = v_work.agent_attempt_id and state = 'started';
  update public.usage_measurements set state = 'unknown', ended_at = pg_catalog.clock_timestamp()
    where owner_id = p_owner and project_id = v_work.project_id and attempt_id = v_work.agent_attempt_id
      and part = 'agent' and part_id = v_work.agent_attempt_id and state = 'started';
  return true;
end $$;

create function public.expire_image_work(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
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
  for v_id in select id from public.image_tool_executions
    where owner_id = p_owner and state = 'unknown'
      and unconfirmed_expires_at <= pg_catalog.clock_timestamp()
  loop
    perform public.settle_failed_post_image_work(p_owner, v_id, 'result_unknown', 'unconfirmed');
  end loop;
  update public.exploration_images e
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where e.owner_id = p_owner and e.state = 'unknown'
      and e.unconfirmed_expires_at <= pg_catalog.clock_timestamp()
      and not exists (select 1 from storage.objects o where o.bucket_id = 'compor-exploration-images'
        and o.name = e.owner_id::text || '/' || e.project_id::text || '/' || e.id::text || '.png');
end $$;

create function public.fail_image_tool_execution(
  p_execution_id uuid, p_secret text, p_closure_reason text, p_provider_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_reason text; v_outcome text; v_digest text;
begin
  if v_owner is null or p_execution_id is null or p_secret is null or p_secret !~ '^[a-f0-9]{64}$'
     or p_closure_reason is null or p_provider_outcome is null
     or not (
       (p_closure_reason = 'provider_rejected_400' and p_provider_outcome = 'failure')
       or (p_closure_reason in ('provider_rejected_429','result_unknown') and p_provider_outcome = 'retryable')
     ) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, e.closure_reason, e.provider_outcome, c.digest into v_state, v_reason, v_outcome, v_digest
    from public.image_tool_executions e
    join public.post_image_quality_claims c on c.execution_id = e.id and c.owner_id = e.owner_id
    where e.id = p_execution_id and e.owner_id = v_owner
    for update of e;
  if not found or v_digest <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_secret,'hex')),'hex') then
    raise exception 'execution unavailable' using errcode = '42501';
  end if;
  if v_state = 'failed' then return v_reason = p_closure_reason and v_outcome = p_provider_outcome; end if;
  if v_state <> 'running' then raise exception 'execution unavailable' using errcode = '42501'; end if;
  return public.settle_failed_post_image_work(v_owner, p_execution_id, p_closure_reason, p_provider_outcome);
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
create function public.close_unconfirmed_image_work(p_project_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_id uuid; v_closed integer := 0; v_count integer;
begin
  if v_owner is null or p_project_id is null or not exists (
    select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_owner and p.deleted_at is null
  ) then raise exception 'unavailable' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  for v_id in
    select e.id from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id and r.owner_id = e.owner_id
    where e.owner_id = v_owner and r.project_id = p_project_id and e.state in ('unknown','running')
      and (e.lease_expires_at is null or e.lease_expires_at <= pg_catalog.clock_timestamp())
  loop
    if public.settle_failed_post_image_work(v_owner, v_id, 'result_unknown', 'unconfirmed') then
      v_closed := v_closed + 1;
    end if;
  end loop;
  update public.exploration_images e
    set state = 'failed', closure_reason = 'result_unknown', provider_outcome = 'unconfirmed',
        updated_at = pg_catalog.clock_timestamp()
    where e.owner_id = v_owner and e.project_id = p_project_id and e.state in ('unknown','running')
      and (e.lease_expires_at is null or e.lease_expires_at <= pg_catalog.clock_timestamp())
      and not exists (select 1 from storage.objects o where o.bucket_id = 'compor-exploration-images'
        and o.name = e.owner_id::text || '/' || e.project_id::text || '/' || e.id::text || '.png');
  get diagnostics v_count = row_count;
  if v_closed + v_count > 0 then return 'closed'; end if;
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

create function public.fail_exploration_image(
  p_project_id uuid, p_id uuid, p_rejection_secret text, p_closure_reason text, p_provider_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_digest text; v_state text; v_reason text; v_outcome text;
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null
     or p_rejection_secret !~ '^[a-f0-9]{64}$'
     or p_closure_reason is null or p_provider_outcome is null
     or not (
       (p_closure_reason = 'provider_rejected_400' and p_provider_outcome = 'failure')
       or (p_closure_reason in ('provider_rejected_429','result_unknown') and p_provider_outcome = 'retryable')
     ) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, e.closure_reason, e.provider_outcome, proof.digest into v_state, v_reason, v_outcome, v_digest
    from public.exploration_images e
    join public.exploration_rejection_proofs proof
      on proof.image_id = e.id and proof.owner_id = e.owner_id and proof.project_id = e.project_id
    where e.id = p_id and e.owner_id = v_owner and e.project_id = p_project_id
    for update of e;
  if not found or v_digest <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex') then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  if v_state = 'failed' then return v_reason = p_closure_reason and v_outcome = p_provider_outcome; end if;
  if v_state <> 'running' or exists (
    select 1 from storage.objects o where o.bucket_id = 'compor-exploration-images'
      and o.name = v_owner::text || '/' || p_project_id::text || '/' || p_id::text || '.png'
  ) then raise exception 'unavailable' using errcode = '42501'; end if;
  update public.exploration_images
    set state = 'failed', closure_reason = p_closure_reason, provider_outcome = p_provider_outcome,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_id;
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

-- An authenticated user alone cannot retire a technically live lease. Old
-- deployed clients keep the existing RPC for historical or expired work.
create function public.mark_image_tool_execution_unknown(p_execution_id uuid, p_secret text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_lease timestamptz; v_digest text;
begin
  if v_owner is null or p_execution_id is null or (p_secret is not null and p_secret !~ '^[a-f0-9]{64}$') then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, e.lease_expires_at into v_state, v_lease from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id and r.owner_id = e.owner_id
    join public.projects p on p.id = r.project_id and p.owner_id = r.owner_id
    where e.id = p_execution_id and e.owner_id = v_owner for update of e;
  if not found or v_state not in ('running','unknown') then
    raise exception 'execution unavailable' using errcode = '42501';
  end if;
  if p_secret is null then
    if v_lease > pg_catalog.clock_timestamp() then raise exception 'execution unavailable' using errcode = '42501'; end if;
  else
    select c.digest into v_digest from public.post_image_quality_claims c
      where c.execution_id = p_execution_id and c.owner_id = v_owner;
    if not found or v_digest <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_secret,'hex')),'hex') then
      raise exception 'execution unavailable' using errcode = '42501';
    end if;
  end if;
  if v_state = 'running' then
    update public.image_tool_executions
      set state = 'unknown', lease_expires_at = null,
          unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
          updated_at = pg_catalog.clock_timestamp()
      where id = p_execution_id;
  end if;
  return true;
end $$;

create or replace function public.mark_image_tool_execution_unknown(p_execution_id uuid)
returns boolean language sql security definer set search_path = '' as $$
  select public.mark_image_tool_execution_unknown(p_execution_id, null);
$$;

create function public.mark_exploration_image_unknown_proven(
  p_project_id uuid, p_id uuid, p_rejection_secret text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_digest text;
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null
     or p_rejection_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select e.state, proof.digest into v_state, v_digest
    from public.exploration_images e
    join public.exploration_rejection_proofs proof
      on proof.image_id = e.id and proof.owner_id = e.owner_id and proof.project_id = e.project_id
    where e.id = p_id and e.owner_id = v_owner and e.project_id = p_project_id
    for update of e;
  if not found or v_state not in ('running','unknown')
     or v_digest <> pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex') then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  if v_state = 'running' then
    update public.exploration_images
      set state = 'unknown', lease_expires_at = null,
          unconfirmed_expires_at = pg_catalog.clock_timestamp() + interval '10 minutes',
          updated_at = pg_catalog.clock_timestamp()
      where id = p_id;
  end if;
  return true;
end $$;

create or replace function public.finish_exploration_image(p_project_id uuid, p_id uuid, p_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null or p_state is distinct from 'unknown' then raise exception 'unavailable' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  if not exists (select 1 from public.exploration_images e
    where e.id = p_id and e.owner_id = v_owner and e.project_id = p_project_id
      and (e.lease_expires_at is null or e.lease_expires_at <= pg_catalog.clock_timestamp()))
    then raise exception 'unavailable' using errcode = '42501'; end if;
  return public.finish_exploration_image_internal(p_project_id, p_id, p_state);
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

-- A stored result can complete after an uncertain acknowledgement, but never after closure.
create or replace function public.complete_image_tool_execution(p_execution_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_asset uuid; v_project uuid; v_piece uuid; v_version integer; v_path text;
begin
 if v_owner is null then raise exception 'execution unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 select e.state, e.asset_id, r.project_id, r.piece_id, r.piece_version
   into v_state, v_asset, v_project, v_piece, v_version
   from public.image_tool_executions e join public.image_tool_reservations r on r.id=e.reservation_id
   join public.projects p on p.id=r.project_id
   where e.id=p_execution_id and e.owner_id=v_owner and r.owner_id=v_owner and p.owner_id=v_owner for update of e;
 if not found or v_state not in ('running','unknown','completed') then raise exception 'execution unavailable' using errcode='42501'; end if;
 if v_state='completed' then return true; end if;
 v_path := v_owner::text || '/' || v_project::text || '/' || v_piece::text || '/' || v_version::text || '/' || v_asset::text || '.png';
 if not exists(select 1 from storage.objects o where o.bucket_id='compor-project-images' and o.name=v_path) then
   raise exception 'asset unavailable' using errcode='42501';
 end if;
 update public.image_tool_executions set state='completed',updated_at=now() where id=p_execution_id;
 return true;
end $$;

create or replace function public.confirm_closed_image_attempt(p_project_id uuid,p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_attempt uuid;v_attempt_state text;v_turn_state text;v_reason text;
begin
 if v_owner is null or p_project_id is null or p_request_id is null then
   raise exception 'unavailable' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 select a.id,a.state,t.state,t.image_quality_reason into v_attempt,v_attempt_state,v_turn_state,v_reason
   from public.studio_turns t
   join public.agent_attempts a on a.id=t.attempt_id and a.owner_id=t.owner_id and a.project_id=t.project_id
   join public.projects p on p.id=t.project_id and p.owner_id=t.owner_id
   where t.owner_id=v_owner and t.project_id=p_project_id and t.request_id=p_request_id
     and t.state in ('completed','failed')
   for update of a;
 if not found then return 'unverified'; end if;
 if (v_turn_state='completed' and v_attempt_state<>'completed')
   or (v_turn_state='failed' and v_attempt_state<>'unknown') then return 'unverified'; end if;
 if v_reason is not null then return v_reason; end if;
 if v_turn_state = 'failed'
   and exists (
     select 1 from public.studio_turns t
     join public.image_tool_reservations r on r.agent_attempt_id = t.attempt_id
       and r.owner_id = t.owner_id and r.project_id = t.project_id and r.turn_id = t.turn_id
     join public.image_tool_executions e on e.reservation_id = r.id and e.owner_id = r.owner_id
     where t.request_id = p_request_id and t.owner_id = v_owner and t.project_id = p_project_id and e.state = 'failed'
       and not exists (select 1 from public.image_tool_result_submissions s where s.execution_id = e.id)
       and not exists (select 1 from storage.objects o where o.bucket_id = 'compor-project-images'
         and o.name = v_owner::text || '/' || r.project_id::text || '/' || r.piece_id::text
           || '/' || r.piece_version::text || '/' || e.asset_id::text || '.png')
   ) and not exists (
     select 1 from public.image_tool_reservations r
     join public.image_tool_executions e on e.reservation_id = r.id and e.owner_id = r.owner_id
     where r.agent_attempt_id = v_attempt and r.owner_id = v_owner and e.state <> 'failed'
   ) then return 'failed_image_attempt'; end if;
 if not exists(select 1 from public.image_tool_reservations r where r.agent_attempt_id=v_attempt) then
   if v_turn_state='completed' then return 'confirmed'; end if;
   return 'unverified';
 end if;
 if exists(select 1 from public.image_tool_reservations r where r.agent_attempt_id=v_attempt and (
   r.owner_id<>v_owner or r.project_id<>p_project_id or r.state<>'unknown'
   or not exists(select 1 from public.image_non_dispatch_fences f where f.reservation_id=r.id and f.owner_id=v_owner)
   or exists(select 1 from public.image_tool_executions e where e.reservation_id=r.id)
 )) then return 'unverified'; end if;
 if v_turn_state='failed' then return 'failed_without_dispatch'; end if;
 return 'confirmed';
end $$;

-- A failed child is terminal and may be explicitly replaced by a new proven intent.
create or replace function public.reserve_exploration_intent(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_intent_id uuid,p_expected_epoch bigint,
  p_context_digest text,p_credential_digest text,p_proof_digest text,p_purpose text,p_position integer,p_previous_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_row public.exploration_intents%rowtype; v_epoch bigint;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_intent_id is null or p_expected_epoch is null or p_expected_epoch<0 or p_expected_epoch>=9007199254740991
    or p_context_digest is null or p_context_digest !~ '^[a-f0-9]{64}$' or p_credential_digest is null or p_credential_digest !~ '^[a-f0-9]{64}$'
    or p_proof_digest is null or p_proof_digest !~ '^[a-f0-9]{64}$' or p_purpose is null or p_purpose not in ('batch','replacement')
    or (p_purpose='batch' and (p_position is not null or p_previous_id is not null))
    or (p_purpose='replacement' and (p_position is null or p_position not between 1 and 3 or p_previous_id is null))
    then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  select * into v_row from public.exploration_intents where id=p_intent_id;
  if found then
    if v_row.owner_id<>v_owner or v_row.project_id<>p_project_id or v_row.piece_id is distinct from p_piece_id or v_row.batch_id<>p_batch_id
      or v_row.context_digest<>p_context_digest or v_row.credential_digest<>p_credential_digest or v_row.expected_epoch<>p_expected_epoch
      or v_row.purpose<>p_purpose or v_row.position is distinct from p_position or v_row.previous_id is distinct from p_previous_id
      then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','existing','intent',public.exploration_intent_record(v_row));
  end if;
  if exists(select 1 from public.exploration_intent_revocations where owner_id=v_owner and intent_id=p_intent_id) then return jsonb_build_object('status','revoked'); end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null))
    then return jsonb_build_object('status','not_found'); end if;
  insert into public.exploration_intent_epochs(owner_id) values(v_owner) on conflict do nothing;
  select epoch into v_epoch from public.exploration_intent_epochs where owner_id=v_owner;
  if p_expected_epoch<>v_epoch then return jsonb_build_object('status','conflict'); end if;
  if exists(select 1 from public.exploration_intents where owner_id=v_owner and state='active') then return jsonb_build_object('status','busy'); end if;
  if p_purpose='replacement' and not exists(
    select 1 from public.exploration_batches b join public.exploration_batch_slots s on s.batch_id=b.id
      join public.exploration_images e on e.id=s.current_image_id
    where b.id=p_batch_id and b.owner_id=v_owner and b.project_id=p_project_id and b.piece_id is not distinct from p_piece_id
      and b.closed_at is null and s.position=p_position and s.current_image_id=p_previous_id and e.state in ('rejected','quality_held','failed')
  ) then return jsonb_build_object('status','conflict'); end if;
  update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
  insert into public.exploration_intents(id,owner_id,project_id,piece_id,batch_id,context_digest,credential_digest,proof_digest,purpose,position,previous_id,expected_epoch,epoch)
    values(p_intent_id,v_owner,p_project_id,p_piece_id,p_batch_id,p_context_digest,p_credential_digest,p_proof_digest,p_purpose,p_position,p_previous_id,p_expected_epoch,v_epoch) returning * into v_row;
  return jsonb_build_object('status','reserved','intent',public.exploration_intent_record(v_row));
end $$;

create or replace function public.replace_rejected_exploration_batch_slot_proven(
  p_project_id uuid,p_batch_id uuid,p_position integer,p_previous_id uuid,p_id uuid,p_prompt_digest text,p_rejection_digest text
) returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_batch public.exploration_batches%rowtype; v_slot public.exploration_batch_slots%rowtype; v_image public.exploration_images%rowtype;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_position is null or p_position not between 1 and 3
    or p_previous_id is null or p_id is null or p_id=p_previous_id or p_prompt_digest is null or p_prompt_digest !~ '^[a-f0-9]{64}$'
    or p_rejection_digest is null or p_rejection_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select * into v_batch from public.exploration_batches b where b.id=p_batch_id and b.owner_id=v_owner and b.project_id=p_project_id
    and exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner);
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_slot from public.exploration_batch_slots where batch_id=p_batch_id and position=p_position;
  if v_slot.prompt_digest is distinct from p_prompt_digest then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_image from public.exploration_images where id=p_id;
  if found then
    if v_image.owner_id<>v_owner or v_image.project_id<>p_project_id or v_image.parallel_batch_id is distinct from p_batch_id
      or v_image.batch_position<>p_position or v_image.replaces_image_id is distinct from p_previous_id or v_image.prompt_digest<>p_prompt_digest
      then raise exception 'unavailable' using errcode='42501'; end if;
    return query select v_image.state,false; return;
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (v_batch.piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=v_batch.piece_id and deleted_at is null))
    then raise exception 'unavailable' using errcode='42501'; end if;
  perform public.expire_image_work(v_owner);
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state='unknown')
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='unknown')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='unknown') then return query select 'blocked'::text,false; return; end if;
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='running')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='running')
    or exists(select 1 from public.foreground_image_waits where owner_id=v_owner and expires_at>clock_timestamp()) then return query select 'busy'::text,false; return; end if;
  if v_batch.state<>'partial' or v_batch.closed_at is not null or v_slot.current_image_id<>p_previous_id
    or not exists(select 1 from public.exploration_images where id=p_previous_id and exploration_images.state in ('rejected','quality_held','failed')) then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_batch_slots set current_image_id=p_id where batch_id=p_batch_id and position=p_position;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state,batch_id,batch_position,parallel_batch_id,replaces_image_id,review_epoch,review_batch_number)
    values(p_id,v_owner,p_project_id,p_prompt_digest,'running',p_batch_id,p_position,p_batch_id,p_previous_id,v_batch.review_epoch,v_batch.review_batch_number);
  insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest) values(p_id,v_owner,p_project_id,p_rejection_digest);
  update public.exploration_batches set state='running',updated_at=clock_timestamp() where id=p_batch_id;
  return query select 'running'::text,true;
end $$;

revoke all on function public.stamp_image_work_lease(), public.expire_image_work(uuid),
  public.settle_failed_post_image_work(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_image_tool_execution(uuid,text,text,text), public.image_execution_closure(uuid),
  public.close_unconfirmed_image_work(uuid), public.image_account_hold(uuid), public.fail_exploration_image(uuid,uuid,text,text,text),
  public.mark_image_tool_execution_unknown(uuid,text), public.mark_exploration_image_unknown_proven(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.fail_image_tool_execution(uuid,text,text,text), public.image_execution_closure(uuid),
  public.close_unconfirmed_image_work(uuid), public.image_account_hold(uuid), public.fail_exploration_image(uuid,uuid,text,text,text),
  public.mark_image_tool_execution_unknown(uuid,text), public.mark_exploration_image_unknown_proven(uuid,uuid,text)
  to authenticated;
