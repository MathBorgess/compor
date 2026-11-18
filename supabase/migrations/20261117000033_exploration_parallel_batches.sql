-- Metadata only: no prompts, provider keys or model output.
create table public.exploration_planning_attempts (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  piece_id uuid,
  batch_id uuid not null unique,
  attempt_id uuid not null unique default gen_random_uuid(),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{64}$'),
  state text not null default 'starting' check (state in ('starting','running','completed','failed','unknown')),
  binding text check (length(binding) between 10 and 2048),
  completion_digest text check (completion_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index exploration_one_active_planner_per_owner on public.exploration_planning_attempts(owner_id) where state in ('starting','running','unknown');
alter table public.exploration_planning_attempts enable row level security;
revoke all on public.exploration_planning_attempts from public,anon,authenticated;

create function public.exploration_plan_record(p_row public.exploration_planning_attempts) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('userId',p_row.owner_id,'projectId',p_row.project_id,'conversationId',coalesce(p_row.piece_id::text,'references'),
    'batchId',p_row.batch_id,'requestId',p_row.request_id,'attemptId',p_row.attempt_id,'inputDigest',p_row.input_digest,'state',p_row.state,'binding',p_row.binding);
$$;
revoke all on function public.exploration_plan_record(public.exploration_planning_attempts) from public,anon,authenticated;

create function public.reserve_exploration_plan(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_request_id uuid,p_input_digest text,p_completion_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_row public.exploration_planning_attempts%rowtype; v_admission text;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_request_id is null or p_input_digest is null or p_input_digest !~ '^[a-f0-9]{64}$' or p_completion_digest is null or p_completion_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  select * into v_row from public.exploration_planning_attempts where request_id=p_request_id;
  if found then
    if v_row.owner_id<>v_owner or v_row.project_id<>p_project_id or v_row.piece_id is distinct from p_piece_id or v_row.batch_id<>p_batch_id or v_row.input_digest<>p_input_digest then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','existing','record',public.exploration_plan_record(v_row));
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null)) then return jsonb_build_object('status','not_found'); end if;
  if exists(select 1 from public.exploration_planning_attempts where batch_id=p_batch_id) then return jsonb_build_object('status','conflict'); end if;
  v_admission:=public.exploration_batch_admission(v_owner,p_project_id);
  if v_admission<>'ready' then return jsonb_build_object('status','busy'); end if;
  insert into public.exploration_planning_attempts(request_id,owner_id,project_id,piece_id,batch_id,input_digest,completion_digest)
    values(p_request_id,v_owner,p_project_id,p_piece_id,p_batch_id,p_input_digest,p_completion_digest) returning * into v_row;
  return jsonb_build_object('status','reserved','record',public.exploration_plan_record(v_row));
end $$;

create function public.get_exploration_plan(p_project_id uuid,p_request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select public.exploration_plan_record(t) from public.exploration_planning_attempts t join public.projects p on p.id=t.project_id
    where t.request_id=p_request_id and t.project_id=p_project_id and t.owner_id=auth.uid() and p.owner_id=auth.uid();
$$;
create function public.bind_exploration_plan(p_project_id uuid,p_request_id uuid,p_binding text,p_completion_secret text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null or p_binding is null or length(p_binding) not between 10 and 2048 or p_completion_secret is null or p_completion_secret !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  update public.exploration_planning_attempts set state='running',binding=p_binding,updated_at=clock_timestamp()
    where request_id=p_request_id and project_id=p_project_id and owner_id=v_owner and state='starting' and binding is null
      and completion_digest=encode(sha256(decode(p_completion_secret,'hex')),'hex')
      and exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner);
  return found;
end $$;
create function public.finish_exploration_plan(p_project_id uuid,p_request_id uuid,p_state text,p_completion_secret text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null or p_state is null or p_state not in ('completed','failed','unknown') then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if p_state<>'unknown' and (p_completion_secret is null or p_completion_secret !~ '^[a-f0-9]{64}$') then raise exception 'invalid request' using errcode='22023'; end if;
  update public.exploration_planning_attempts set state=p_state,updated_at=clock_timestamp(),completion_digest=case when p_state='unknown' then completion_digest else null end
    where request_id=p_request_id and project_id=p_project_id and owner_id=v_owner
      and ((p_state='unknown' and state in ('starting','running')) or (p_state='completed' and state in ('running','unknown')) or (p_state='failed' and state='running'))
      and (p_state='unknown' or completion_digest=encode(sha256(decode(p_completion_secret,'hex')),'hex'))
      and exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner);
  return found;
end $$;
revoke all on function public.reserve_exploration_plan(uuid,uuid,uuid,uuid,text,text),public.get_exploration_plan(uuid,uuid),
  public.bind_exploration_plan(uuid,uuid,text,text),public.finish_exploration_plan(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_exploration_plan(uuid,uuid,uuid,uuid,text,text),public.get_exploration_plan(uuid,uuid),
  public.bind_exploration_plan(uuid,uuid,text,text),public.finish_exploration_plan(uuid,uuid,text,text) to authenticated;

-- Three child reservations form one account-wide unit. No provider call occurs
-- in this transaction. Each child keeps its existing one-use proof and receipt.
create table public.exploration_batches (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  piece_id uuid,
  plan_digest text not null check (plan_digest ~ '^[a-f0-9]{64}$'),
  state text not null default 'running' check (state in ('running','unknown','partial','completed')),
  review_epoch integer not null check (review_epoch>0),
  review_batch_number integer not null check (review_batch_number>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  next_at timestamptz,
  closed_at timestamptz,
  check ((state='completed' and completed_at is not null and next_at=completed_at+interval '15 seconds')
    or (state<>'completed' and completed_at is null and next_at is null))
);
create unique index exploration_one_open_batch_per_owner on public.exploration_batches(owner_id) where state<>'completed' and closed_at is null;
alter table public.exploration_batches enable row level security;
revoke all on public.exploration_batches from public,anon,authenticated;
grant select on public.exploration_batches to authenticated;
create policy exploration_batches_owner on public.exploration_batches for select to authenticated using (
  owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))
);

alter table public.exploration_images add column revision bigint not null default 1 check (revision>0 and revision<=9007199254740991);
alter table public.exploration_images add column parallel_batch_id uuid references public.exploration_batches(id);
alter table public.exploration_images add column replaces_image_id uuid references public.exploration_images(id);
alter table public.exploration_images add constraint exploration_parallel_batch_link check (
  parallel_batch_id is null or (batch_id is not null and parallel_batch_id=batch_id and batch_position is not null)
);
create table public.exploration_batch_slots (
  batch_id uuid not null references public.exploration_batches(id),
  position integer not null check (position between 1 and 3),
  initial_image_id uuid not null references public.exploration_images(id) deferrable initially deferred,
  current_image_id uuid not null references public.exploration_images(id) deferrable initially deferred,
  prompt_digest text not null check (prompt_digest ~ '^[a-f0-9]{64}$'),
  primary key(batch_id,position),
  unique(initial_image_id), unique(current_image_id)
);
alter table public.exploration_batch_slots enable row level security;
revoke all on public.exploration_batch_slots from public,anon,authenticated;
grant select on public.exploration_batch_slots to authenticated;
create policy exploration_batch_slots_owner on public.exploration_batch_slots for select to authenticated using (
  exists(select 1 from public.exploration_batches b where b.id=batch_id and b.owner_id=(select auth.uid()))
);

-- Replace the single-row index with a group-aware guard BEFORE removing it.
-- Every insertion still serializes on the same advisory lock as foreground/MCP.
create function public.guard_exploration_account_group() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));
  if tg_op='UPDATE' then
    new.revision:=old.revision+case when new.state is distinct from old.state then 1 else 0 end;
  else new.revision:=1; end if;
  if new.parallel_batch_id is not null and not exists(
    select 1 from public.exploration_batches b join public.exploration_batch_slots s on s.batch_id=b.id
    where b.id=new.parallel_batch_id and b.owner_id=new.owner_id and b.project_id=new.project_id
      and s.position=new.batch_position and s.current_image_id=new.id and s.prompt_digest=new.prompt_digest
  ) then raise exception 'invalid batch member' using errcode='23514'; end if;
  if new.state in ('running','unknown') and exists(
    select 1 from public.exploration_images e where e.owner_id=new.owner_id and e.id<>new.id and e.state in ('running','unknown')
      and (new.parallel_batch_id is null or e.parallel_batch_id is distinct from new.parallel_batch_id)
  ) then raise exception 'account has unresolved work' using errcode='23505'; end if;
  return new;
end $$;
revoke all on function public.guard_exploration_account_group() from public,anon,authenticated;
create trigger exploration_account_group_before_write before insert or update on public.exploration_images
  for each row execute function public.guard_exploration_account_group();
drop index public.exploration_one_unresolved_per_owner;

-- Shared admission check, called under the owner lock. A partial batch needs an
-- explicit replacement; elapsed time never turns it into a new batch.
create function public.exploration_batch_admission(p_owner uuid,p_project uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.exploration_planning_attempts where owner_id=p_owner and exploration_planning_attempts.state='unknown')
    or exists(select 1 from public.exploration_images where owner_id=p_owner and exploration_images.state='unknown')
    or exists(select 1 from public.image_tool_executions where owner_id=p_owner and image_tool_executions.state='unknown') then return 'blocked'; end if;
  if exists(select 1 from public.exploration_planning_attempts where owner_id=p_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists(select 1 from public.exploration_images where owner_id=p_owner and exploration_images.state='running')
    or exists(select 1 from public.image_tool_executions where owner_id=p_owner and image_tool_executions.state='running')
    or exists(select 1 from public.foreground_image_waits where owner_id=p_owner and expires_at>clock_timestamp()) then return 'busy'; end if;
  if exists(select 1 from public.exploration_batches where owner_id=p_owner and exploration_batches.state<>'completed' and closed_at is null) then return 'partial'; end if;
  perform public.ensure_exploration_review_gate(p_owner,p_project);
  if exists(select 1 from public.exploration_review_gates where owner_id=p_owner and project_id=p_project and awaiting_feedback) then return 'awaiting_feedback'; end if;
  if exists(select 1 from public.exploration_batches where owner_id=p_owner and project_id=p_project and next_at>clock_timestamp()) then return 'cooldown'; end if;
  return 'ready';
end $$;
revoke all on function public.exploration_batch_admission(uuid,uuid) from public,anon,authenticated;

create function public.reserve_exploration_batch_proven(
  p_project_id uuid,p_batch_id uuid,p_piece_id uuid,p_plan_digest text,
  p_image_ids uuid[],p_prompt_digests text[],p_rejection_digests text[]
) returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_batch public.exploration_batches%rowtype;
  v_gate public.exploration_review_gates%rowtype; v_admission text; i integer;
begin
  if v_owner is null or p_project_id is null or p_batch_id is null or p_plan_digest is null or p_plan_digest !~ '^[a-f0-9]{64}$'
    or array_ndims(p_image_ids) is distinct from 1 or array_lower(p_image_ids,1) is distinct from 1 or cardinality(p_image_ids)<>3
    or array_ndims(p_prompt_digests) is distinct from 1 or array_lower(p_prompt_digests,1) is distinct from 1 or cardinality(p_prompt_digests)<>3
    or array_ndims(p_rejection_digests) is distinct from 1 or array_lower(p_rejection_digests,1) is distinct from 1 or cardinality(p_rejection_digests)<>3
    or (select count(distinct x) from unnest(p_image_ids) x)<>3
    or exists(select 1 from unnest(p_prompt_digests||p_rejection_digests) x where x is null or x !~ '^[a-f0-9]{64}$')
    then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_batch from public.exploration_batches where id=p_batch_id;
  if found then
    if v_batch.owner_id<>v_owner or v_batch.project_id<>p_project_id or v_batch.piece_id is distinct from p_piece_id or v_batch.plan_digest<>p_plan_digest
      or (select array_agg(initial_image_id order by position) from public.exploration_batch_slots where batch_id=p_batch_id) is distinct from p_image_ids
      or (select array_agg(prompt_digest order by position) from public.exploration_batch_slots where batch_id=p_batch_id) is distinct from p_prompt_digests
      then raise exception 'unavailable' using errcode='42501'; end if;
    -- Fresh proof digests on a replay are intentionally ignored, never installed.
    return query select v_batch.state,false; return;
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null))
    then raise exception 'unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.exploration_planning_attempts where batch_id=p_batch_id and owner_id=v_owner and project_id=p_project_id and piece_id is not distinct from p_piece_id and exploration_planning_attempts.state='completed') then raise exception 'unavailable' using errcode='42501'; end if;
  v_admission:=public.exploration_batch_admission(v_owner,p_project_id);
  if v_admission<>'ready' then return query select v_admission,false; return; end if;
  -- Do not mix a historical serial fragment with a new atomic batch. Preserve
  -- already counted rounds and history, but start a distinct review number.
  update public.exploration_review_gates set batch_number=batch_number+1,completed_in_batch=0,batch_engaged=false
    where owner_id=v_owner and project_id=p_project_id and completed_in_batch>0;
  select * into v_gate from public.exploration_review_gates where owner_id=v_owner and project_id=p_project_id;
  insert into public.exploration_batches(id,owner_id,project_id,piece_id,plan_digest,review_epoch,review_batch_number)
    values(p_batch_id,v_owner,p_project_id,p_piece_id,p_plan_digest,v_gate.epoch,v_gate.batch_number);
  for i in 1..3 loop
    insert into public.exploration_batch_slots(batch_id,position,initial_image_id,current_image_id,prompt_digest)
      values(p_batch_id,i,p_image_ids[i],p_image_ids[i],p_prompt_digests[i]);
    insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state,batch_id,batch_position,parallel_batch_id,review_epoch,review_batch_number)
      values(p_image_ids[i],v_owner,p_project_id,p_prompt_digests[i],'running',p_batch_id,i,p_batch_id,v_gate.epoch,v_gate.batch_number);
    insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest)
      values(p_image_ids[i],v_owner,p_project_id,p_rejection_digests[i]);
  end loop;
  return query select 'running'::text,true;
end $$;

-- The transition runs once per durable child result, in any arrival order.
create function public.refresh_exploration_batch() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_batch public.exploration_batches%rowtype; v_state text; v_count integer; v_completed integer;
  v_running integer; v_unknown integer; v_finished timestamptz;
begin
  if new.parallel_batch_id is null or new.state=old.state then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text,0));
  select * into v_batch from public.exploration_batches where id=new.parallel_batch_id;
  select count(*),count(*) filter(where e.state='completed'),count(*) filter(where e.state='running'),count(*) filter(where e.state='unknown')
    into v_count,v_completed,v_running,v_unknown
    from public.exploration_batch_slots s join public.exploration_images e on e.id=s.current_image_id where s.batch_id=v_batch.id;
  if v_count<>3 then raise exception 'incomplete batch' using errcode='23514'; end if;
  v_state:=case when v_unknown>0 then 'unknown' when v_running>0 then 'running' when v_completed=3 then 'completed' else 'partial' end;
  if v_state='completed' and v_batch.state<>'completed' then
    v_finished:=clock_timestamp();
    update public.exploration_batches set state='completed',updated_at=v_finished,completed_at=v_finished,next_at=v_finished+interval '15 seconds' where id=v_batch.id;
    update public.exploration_review_gates set
      unattended_batches=case when batch_engaged then unattended_batches else least(2,unattended_batches+1) end,
      awaiting_feedback=awaiting_feedback or (not batch_engaged and unattended_batches>=1),
      batch_number=batch_number+1,completed_in_batch=0,batch_engaged=false
      where owner_id=v_batch.owner_id and project_id=v_batch.project_id and epoch=v_batch.review_epoch and batch_number=v_batch.review_batch_number;
  elsif v_batch.state<>'completed' then
    update public.exploration_batches set state=v_state,updated_at=clock_timestamp() where id=v_batch.id;
  end if;
  return new;
end $$;
revoke all on function public.refresh_exploration_batch() from public,anon,authenticated;
create trigger exploration_batch_after_state after update of state on public.exploration_images
  for each row execute function public.refresh_exploration_batch();

-- Keep legacy semantics for historical individual receipts. Parallel completion
-- uses the batch trigger instead of counting every third arrival as a round.
create function public.finish_exploration_image_serial_internal(p_project_id uuid,p_id uuid,p_state text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_image public.exploration_images%rowtype; v_gate public.exploration_review_gates%rowtype;
begin
  if v_owner is null or p_state not in ('unknown','completed') then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if p_state='completed' and not exists(select 1 from storage.objects o where o.bucket_id='compor-exploration-images' and o.name=v_owner::text||'/'||p_project_id::text||'/'||p_id::text||'.png') then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_images e set state=p_state,updated_at=now()
    where e.id=p_id and e.project_id=p_project_id and e.owner_id=v_owner
      and (e.state='running' or (p_state='completed' and e.state='unknown'))
      and exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner)
    returning * into v_image;
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  if p_state='completed' then
    perform public.ensure_exploration_review_gate(v_owner,p_project_id);
    select * into v_gate from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id;
    if v_image.ordinal>v_gate.baseline_ordinal then
      update public.exploration_images set review_epoch=v_gate.epoch,review_batch_number=v_gate.batch_number where id=p_id;
      update public.exploration_review_gates set
        completed_in_batch=case when v_gate.completed_in_batch=2 then 0 else v_gate.completed_in_batch+1 end,
        batch_number=case when v_gate.completed_in_batch=2 then v_gate.batch_number+1 else v_gate.batch_number end,
        unattended_batches=case when v_gate.completed_in_batch=2 and not v_gate.batch_engaged then least(2,v_gate.unattended_batches+1) else v_gate.unattended_batches end,
        awaiting_feedback=case when v_gate.completed_in_batch=2 and not v_gate.batch_engaged and v_gate.unattended_batches>=1 then true else v_gate.awaiting_feedback end,
        batch_engaged=case when v_gate.completed_in_batch=2 then false else v_gate.batch_engaged end
        where owner_id=v_owner and project_id=p_project_id;
    end if;
  end if;
  return true;
end $$;
revoke all on function public.finish_exploration_image_serial_internal(uuid,uuid,text) from public,anon,authenticated;
create or replace function public.finish_exploration_image_internal(p_project_id uuid,p_id uuid,p_state text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null or p_state is null or p_state not in ('unknown','completed') then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.exploration_images where id=p_id and owner_id=v_owner and project_id=p_project_id and parallel_batch_id is not null)
    then return public.finish_exploration_image_serial_internal(p_project_id,p_id,p_state); end if;
  if p_state='completed' and not exists(select 1 from storage.objects where bucket_id='compor-exploration-images' and name=v_owner::text||'/'||p_project_id::text||'/'||p_id::text||'.png')
    then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_images set state=p_state,updated_at=clock_timestamp()
    where id=p_id and owner_id=v_owner and project_id=p_project_id and (state='running' or (state='unknown' and p_state='completed'))
      and exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner);
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.finish_exploration_image_internal(uuid,uuid,text) from public,anon,authenticated;

create function public.replace_rejected_exploration_batch_slot_proven(
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
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state='unknown')
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='unknown')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='unknown') then return query select 'blocked'::text,false; return; end if;
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='running')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='running')
    or exists(select 1 from public.foreground_image_waits where owner_id=v_owner and expires_at>clock_timestamp()) then return query select 'busy'::text,false; return; end if;
  if v_batch.state<>'partial' or v_batch.closed_at is not null or v_slot.current_image_id<>p_previous_id
    or not exists(select 1 from public.exploration_images where id=p_previous_id and exploration_images.state='rejected') then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_batch_slots set current_image_id=p_id where batch_id=p_batch_id and position=p_position;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state,batch_id,batch_position,parallel_batch_id,replaces_image_id,review_epoch,review_batch_number)
    values(p_id,v_owner,p_project_id,p_prompt_digest,'running',p_batch_id,p_position,p_batch_id,p_previous_id,v_batch.review_epoch,v_batch.review_batch_number);
  insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest) values(p_id,v_owner,p_project_id,p_rejection_digest);
  update public.exploration_batches set state='running',updated_at=clock_timestamp() where id=p_batch_id;
  return query select 'running'::text,true;
end $$;

create function public.get_exploration_batch(p_project_id uuid,p_batch_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('batch_id',b.id,'project_id',b.project_id,'piece_id',b.piece_id,'plan_digest',b.plan_digest,'state',b.state,
    'created_at',b.created_at,'updated_at',b.updated_at,'completed_at',b.completed_at,'next_at',b.next_at,'closed_at',b.closed_at,
    'images',(select jsonb_agg(jsonb_build_object('id',e.id,'project_id',e.project_id,'prompt_digest',e.prompt_digest,'state',e.state,
      'ordinal',e.ordinal,'revision',e.revision,'batch_position',e.batch_position,'replaces_image_id',e.replaces_image_id,'created_at',e.created_at,'updated_at',e.updated_at) order by s.position)
      from public.exploration_batch_slots s join public.exploration_images e on e.id=s.current_image_id where s.batch_id=b.id))
  from public.exploration_batches b where b.id=p_batch_id and b.project_id=p_project_id;
$$;

-- Old clients use only known admission statuses, and cannot circumvent an open
-- parallel batch or its server-side cooldown. Existing receipts stay readable.
create function public.reserve_exploration_image_serial_internal(p_project_id uuid,p_id uuid,p_prompt_digest text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_row public.exploration_images%rowtype;
begin
  if v_owner is null or p_id is null or p_project_id is null or p_prompt_digest is null or p_prompt_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner) then raise exception 'unavailable' using errcode='42501'; end if;
  select * into v_row from public.exploration_images e where e.id=p_id and e.owner_id=v_owner;
  if found then
    if v_row.project_id<>p_project_id or v_row.prompt_digest<>p_prompt_digest then raise exception 'unavailable' using errcode='42501'; end if;
    return query select v_row.state,false; return;
  end if;
  if exists(select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='unknown') or exists(select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='unknown') then return query select 'blocked'::text,false; return; end if;
  if exists(select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='running') or exists(select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='running') or exists(select 1 from public.foreground_image_waits w where w.owner_id=v_owner and w.expires_at>now()) then return query select 'busy'::text,false; return; end if;
  perform public.ensure_exploration_review_gate(v_owner,p_project_id);
  if exists(select 1 from public.exploration_review_gates g where g.owner_id=v_owner and g.project_id=p_project_id and g.awaiting_feedback) then return query select 'awaiting_feedback'::text,false; return; end if;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state) values(p_id,v_owner,p_project_id,p_prompt_digest,'running');
  return query select 'running'::text,true;
end $$;
revoke all on function public.reserve_exploration_image_serial_internal(uuid,uuid,text) from public,anon,authenticated;
create or replace function public.reserve_exploration_image(p_project_id uuid,p_id uuid,p_prompt_digest text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_admission text;
begin
  if v_owner is null then raise exception 'unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.exploration_images where id=p_id and owner_id=v_owner and project_id=p_project_id) then
    if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null) then raise exception 'unavailable' using errcode='42501'; end if;
    v_admission:=public.exploration_batch_admission(v_owner,p_project_id);
    if v_admission<>'ready' then return query select case v_admission when 'partial' then 'awaiting_feedback' when 'cooldown' then 'busy' else v_admission end,false; return; end if;
  end if;
  return query select * from public.reserve_exploration_image_serial_internal(p_project_id,p_id,p_prompt_digest);
end $$;
revoke all on function public.reserve_exploration_image(uuid,uuid,text) from public,anon,authenticated;

revoke all on function public.reserve_exploration_batch_proven(uuid,uuid,uuid,text,uuid[],text[],text[]),
  public.replace_rejected_exploration_batch_slot_proven(uuid,uuid,integer,uuid,uuid,text,text),public.get_exploration_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_exploration_batch_proven(uuid,uuid,uuid,text,uuid[],text[],text[]),
  public.replace_rejected_exploration_batch_slot_proven(uuid,uuid,integer,uuid,uuid,text,text),public.get_exploration_batch(uuid,uuid) to authenticated;

-- Foreground execution shares the same owner lock and never overlaps planning.
create or replace function public.claim_image_tool_execution(p_reservation_id uuid)
returns table (execution_id uuid, asset_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_reservation_state text; v_attempt_state text; v_id uuid; v_asset uuid; v_state text; v_waiter uuid;
begin
  if v_owner is null or p_reservation_id is null then raise exception 'invalid request' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
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
    or exists (select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='running')
    or exists (select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='running') then
    insert into public.foreground_image_waits(owner_id,reservation_id,expires_at)
      values(v_owner,p_reservation_id,now()+interval '15 seconds')
      on conflict(owner_id) do update set expires_at=excluded.expires_at;
    return query select null::uuid,null::uuid,'busy'::text,false; return;
  end if;
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.reservation_id=p_reservation_id;
  insert into public.image_tool_executions(owner_id,reservation_id) values(v_owner,p_reservation_id)
    returning id,image_tool_executions.asset_id into v_id,v_asset;
  return query select v_id,v_asset,'running'::text,true;
end;
$$;

-- Conservative deletion guard: legacy exploration and studio turns have no post
-- scope, so they block deletion of any post in that project until reconciled.
create function public.project_has_pending_generation(p_owner uuid,p_project uuid,p_piece uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.exploration_planning_attempts where owner_id=p_owner and project_id=p_project
      and state in ('starting','running','unknown') and (p_piece is null or piece_id is null or piece_id=p_piece))
    or exists(select 1 from public.exploration_images e left join public.exploration_batches b on b.id=e.parallel_batch_id
      where e.owner_id=p_owner and e.project_id=p_project and e.state in ('running','unknown')
        and (p_piece is null or b.piece_id is null or b.piece_id=p_piece))
    or exists(select 1 from public.image_tool_executions e join public.image_tool_reservations r on r.id=e.reservation_id
      where e.owner_id=p_owner and r.owner_id=p_owner and r.project_id=p_project and e.state in ('running','unknown')
        and (p_piece is null or r.piece_id=p_piece))
    or exists(select 1 from public.studio_turns where owner_id=p_owner and project_id=p_project and studio_turns.state in ('starting','running','action_required','unknown'));
$$;
revoke all on function public.project_has_pending_generation(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.delete_project_from_list(p_project_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype;
begin
  if p_project_id is null or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>2147483646 then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  select * into project from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if project.deleted_at is not null then return jsonb_build_object('status','deleted','projectId',project.id); end if;
  if project.revision<>p_expected_revision then return jsonb_build_object('status','conflict','currentRevision',project.revision); end if;
  if public.project_has_pending_generation(auth.uid(),p_project_id,null) then return jsonb_build_object('status','pending'); end if;
  update public.exploration_batches set closed_at=clock_timestamp() where owner_id=auth.uid() and project_id=p_project_id and state='partial' and closed_at is null;
  update public.projects set deleted_at=now(),revision=revision+1 where id=project.id;
  return jsonb_build_object('status','deleted','projectId',project.id);
end $$;
revoke all on function public.delete_project_from_list(uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_project_from_list(uuid,integer) to authenticated;

create or replace function public.delete_project_post(p_project_id uuid,p_piece_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.project_posts%rowtype;
begin
  if p_piece_id is null then raise exception 'invalid_request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) and deleted_at is null for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if public.project_has_pending_generation(auth.uid(),p_project_id,p_piece_id) then return jsonb_build_object('status','pending'); end if;
  update public.exploration_batches set closed_at=clock_timestamp() where owner_id=auth.uid() and project_id=p_project_id and piece_id=p_piece_id and state='partial' and closed_at is null;
  insert into public.project_posts(project_id,piece_id,deleted_at) values(p_project_id,p_piece_id,now()) on conflict(project_id,piece_id) do update set deleted_at=coalesce(public.project_posts.deleted_at,excluded.deleted_at);
  select * into item from public.project_posts where project_id=p_project_id and piece_id=p_piece_id;
  return jsonb_build_object('status','deleted','post',jsonb_build_object('projectId',item.project_id,'pieceId',item.piece_id,'name',item.name,'deleted',true));
end $$;

-- Serialize legacy studio admission with deletion; existing receipts survive.
create or replace function public.reserve_studio_turn(p_project_id uuid,p_request_id uuid,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_existing public.studio_turns%rowtype; v_attempt uuid;
begin
 if v_owner is null or p_request_id is null or p_input_digest is null or p_input_digest !~ '^[0-9a-f]{64}$' then raise exception 'unavailable' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 perform 1 from public.projects where id=p_project_id and owner_id=v_owner for update;
 if not found then return jsonb_build_object('status','not_found');end if;
 select * into v_existing from public.studio_turns where request_id=p_request_id;
 if found then
  if v_existing.owner_id<>v_owner or v_existing.project_id<>p_project_id or v_existing.input_digest<>p_input_digest then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','existing','turn',to_jsonb(v_existing));
 end if;
 if exists(select 1 from public.projects where id=p_project_id and deleted_at is not null) then return jsonb_build_object('status','not_found'); end if;
 if exists(select 1 from public.studio_turns where project_id=p_project_id and studio_turns.state in ('starting','running','action_required','unknown'))then return jsonb_build_object('status','busy');end if;
 insert into public.agent_attempts(owner_id,project_id,idempotency_key) values(v_owner,p_project_id,p_request_id)
  on conflict(owner_id,idempotency_key)do nothing returning id into v_attempt;
 if v_attempt is null then return jsonb_build_object('status','conflict');end if;
 insert into public.studio_turns(request_id,owner_id,project_id,attempt_id,input_digest) values(p_request_id,v_owner,p_project_id,v_attempt,p_input_digest) returning * into v_existing;
 return jsonb_build_object('status','reserved','turn',to_jsonb(v_existing));
end $$;
