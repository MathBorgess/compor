-- A known hold follows generation but precedes Storage. The receipt consumes
-- the same server-owned proof as completion or verified credential refusal.
alter table public.exploration_images
  add column quality_reason text,
  drop constraint exploration_images_state_check,
  add constraint exploration_images_state_check
    check (state in ('running','unknown','completed','rejected','closed_unknown','quality_held')),
  add constraint exploration_images_quality_reason_check
    check ((state='quality_held' and quality_reason is not null
      and quality_reason in ('image_quality_rejected','image_quality_inconclusive'))
      or (state<>'quality_held' and quality_reason is null));

drop index public.exploration_position_per_batch;
create unique index exploration_position_per_batch on public.exploration_images(owner_id,project_id,batch_id,batch_position)
  where batch_id is not null and state not in ('rejected','quality_held');

create function public.hold_exploration_image_quality(p_project_id uuid,p_id uuid,p_rejection_secret text,p_quality_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null
    or p_rejection_secret !~ '^[a-f0-9]{64}$' or p_quality_reason is null
    or p_quality_reason not in ('image_quality_rejected','image_quality_inconclusive') then
    raise exception 'invalid request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  delete from public.exploration_rejection_proofs p where p.image_id=p_id and p.owner_id=v_owner and p.project_id=p_project_id
    and p.digest=pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex');
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_images e set state='quality_held',quality_reason=p_quality_reason,updated_at=pg_catalog.clock_timestamp()
    where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id and e.state='running'
      and exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner)
      and not exists(select 1 from storage.objects o where o.bucket_id='compor-exploration-images'
        and o.name=v_owner::text||'/'||p_project_id::text||'/'||p_id::text||'.png');
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public.hold_exploration_image_quality(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.hold_exploration_image_quality(uuid,uuid,text,text) to authenticated;

create or replace function public.compor_exploration_path_authorized(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]png$'
    and split_part(p_name,'/',1) = (select auth.uid())::text
    and exists (select 1 from public.exploration_images e join public.projects p on p.id=e.project_id
      where e.state<>'quality_held' and e.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
      and e.project_id::text=split_part(p_name,'/',2)
      and e.id::text=replace(split_part(p_name,'/',3),'.png','')), false);
$$;

-- An explicit replacement consumes a new intent for the same held or rejected slot.
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
      and b.closed_at is null and s.position=p_position and s.current_image_id=p_previous_id and e.state in ('rejected','quality_held')
  ) then return jsonb_build_object('status','conflict'); end if;
  update public.exploration_intent_epochs set epoch=epoch+1 where owner_id=v_owner returning epoch into v_epoch;
  insert into public.exploration_intents(id,owner_id,project_id,piece_id,batch_id,context_digest,credential_digest,proof_digest,purpose,position,previous_id,expected_epoch,epoch)
    values(p_intent_id,v_owner,p_project_id,p_piece_id,p_batch_id,p_context_digest,p_credential_digest,p_proof_digest,p_purpose,p_position,p_previous_id,p_expected_epoch,v_epoch) returning * into v_row;
  return jsonb_build_object('status','reserved','intent',public.exploration_intent_record(v_row));
end $$;

-- The public intent/snapshot wrappers still guard this internal replacement.
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
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state='unknown')
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='unknown')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='unknown') then return query select 'blocked'::text,false; return; end if;
  if exists(select 1 from public.exploration_planning_attempts where owner_id=v_owner and exploration_planning_attempts.state in ('starting','running'))
    or exists(select 1 from public.exploration_images where owner_id=v_owner and exploration_images.state='running')
    or exists(select 1 from public.image_tool_executions where owner_id=v_owner and image_tool_executions.state='running')
    or exists(select 1 from public.foreground_image_waits where owner_id=v_owner and expires_at>clock_timestamp()) then return query select 'busy'::text,false; return; end if;
  if v_batch.state<>'partial' or v_batch.closed_at is not null or v_slot.current_image_id<>p_previous_id
    or not exists(select 1 from public.exploration_images where id=p_previous_id and exploration_images.state in ('rejected','quality_held')) then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_batch_slots set current_image_id=p_id where batch_id=p_batch_id and position=p_position;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state,batch_id,batch_position,parallel_batch_id,replaces_image_id,review_epoch,review_batch_number)
    values(p_id,v_owner,p_project_id,p_prompt_digest,'running',p_batch_id,p_position,p_batch_id,p_previous_id,v_batch.review_epoch,v_batch.review_batch_number);
  insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest) values(p_id,v_owner,p_project_id,p_rejection_digest);
  update public.exploration_batches set state='running',updated_at=clock_timestamp() where id=p_batch_id;
  return query select 'running'::text,true;
end $$;

create or replace function public.get_exploration_batch(p_project_id uuid,p_batch_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('batch_id',b.id,'project_id',b.project_id,'piece_id',b.piece_id,'plan_digest',b.plan_digest,'state',b.state,
    'created_at',b.created_at,'updated_at',b.updated_at,'completed_at',b.completed_at,'next_at',b.next_at,'closed_at',b.closed_at,
    'images',(select jsonb_agg(jsonb_build_object('id',e.id,'project_id',e.project_id,'prompt_digest',e.prompt_digest,'state',e.state,
      'ordinal',e.ordinal,'revision',e.revision,'batch_position',e.batch_position,'replaces_image_id',e.replaces_image_id,'created_at',e.created_at,'updated_at',e.updated_at)
        || case when e.state='quality_held' then jsonb_build_object('quality_reason',e.quality_reason) else '{}'::jsonb end order by s.position)
      from public.exploration_batch_slots s join public.exploration_images e on e.id=s.current_image_id where s.batch_id=b.id))
  from public.exploration_batches b where b.id=p_batch_id and b.project_id=p_project_id;
$$;
