-- A one-use capability lets the server record a definitive provider rejection
-- without trusting a status supplied by the browser. The preimage exists only
-- in the server request that created the reservation; a crash keeps the result
-- uncertain. Existing reservations never receive a new capability.
alter table public.exploration_images drop constraint exploration_images_state_check;
alter table public.exploration_images add constraint exploration_images_state_check
  check (state in ('running','unknown','completed','rejected'));
-- A confirmed rejection did not produce an image. Keep the historical record,
-- but allow the same batch position to be attempted with a fresh request ID.
drop index public.exploration_position_per_batch;
create unique index exploration_position_per_batch on public.exploration_images(owner_id,project_id,batch_id,batch_position)
  where batch_id is not null and state <> 'rejected';

create table public.exploration_rejection_proofs (
  image_id uuid primary key references public.exploration_images(id),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  digest text not null check (digest ~ '^[a-f0-9]{64}$')
);
alter table public.exploration_rejection_proofs enable row level security;
revoke all on public.exploration_rejection_proofs from public,anon,authenticated;

create function public.reserve_exploration_image_proven(p_project_id uuid,p_id uuid,p_prompt_digest text,p_rejection_digest text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_state text; v_new boolean;
begin
  if v_owner is null or p_rejection_digest is null or p_rejection_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode='22023';
  end if;
  select r.state,r.is_new into v_state,v_new from public.reserve_exploration_image(p_project_id,p_id,p_prompt_digest) r;
  if v_new then
    insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest)
      values(p_id,v_owner,p_project_id,p_rejection_digest);
  end if;
  return query select v_state,v_new;
end $$;

create function public.reserve_exploration_image_batched_proven(p_project_id uuid,p_id uuid,p_prompt_digest text,p_batch_id uuid,p_batch_position integer,p_rejection_digest text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_state text; v_new boolean;
begin
  if v_owner is null or p_rejection_digest is null or p_rejection_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode='22023';
  end if;
  select r.state,r.is_new into v_state,v_new from public.reserve_exploration_image_batched(p_project_id,p_id,p_prompt_digest,p_batch_id,p_batch_position) r;
  if v_new then
    insert into public.exploration_rejection_proofs(image_id,owner_id,project_id,digest)
      values(p_id,v_owner,p_project_id,p_rejection_digest);
  end if;
  return query select v_state,v_new;
end $$;

create function public.reject_exploration_image(p_project_id uuid,p_id uuid,p_rejection_secret text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_digest text;
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null or p_rejection_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select p.digest into v_digest from public.exploration_rejection_proofs p
    where p.image_id=p_id and p.owner_id=v_owner and p.project_id=p_project_id;
  if not found or v_digest<>pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex') then
    raise exception 'unavailable' using errcode='42501';
  end if;
  update public.exploration_images e set state='rejected',updated_at=pg_catalog.now()
    where e.id=p_id and e.owner_id=v_owner and e.project_id=p_project_id and e.state='running'
      and exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=v_owner);
  if not found then raise exception 'unavailable' using errcode='42501'; end if;
  delete from public.exploration_rejection_proofs p where p.image_id=p_id and p.owner_id=v_owner and p.project_id=p_project_id;
  return true;
end $$;

-- A client can write objects under its own reservation. Only the protected
-- completion RPC may call this implementation after consuming its proof.
create function public.finish_exploration_image_internal(p_project_id uuid,p_id uuid,p_state text) returns boolean
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
revoke all on function public.finish_exploration_image_internal(uuid,uuid,text) from public,anon,authenticated;

-- Legacy clients may only make the state more conservative. Existing unknown
-- reservations cannot be cleared without trusted evidence after this migration.
create or replace function public.finish_exploration_image(p_project_id uuid,p_id uuid,p_state text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_state is distinct from 'unknown' then raise exception 'unavailable' using errcode='42501'; end if;
  return public.finish_exploration_image_internal(p_project_id,p_id,p_state);
end $$;

create function public.complete_exploration_image_proven(p_project_id uuid,p_id uuid,p_rejection_secret text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_digest text;
begin
  if v_owner is null or p_project_id is null or p_id is null or p_rejection_secret is null or p_rejection_secret !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  select p.digest into v_digest from public.exploration_rejection_proofs p
    where p.image_id=p_id and p.owner_id=v_owner and p.project_id=p_project_id;
  if not found or v_digest<>pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_rejection_secret,'hex')),'hex') then
    raise exception 'unavailable' using errcode='42501';
  end if;
  delete from public.exploration_rejection_proofs p where p.image_id=p_id and p.owner_id=v_owner and p.project_id=p_project_id;
  -- Any error, including missing bytes or wrong state, rolls back the deletion.
  return public.finish_exploration_image_internal(p_project_id,p_id,'completed');
end $$;

-- Old application instances fail closed rather than create unprotected work.
revoke execute on function public.reserve_exploration_image(uuid,uuid,text) from authenticated;
revoke execute on function public.reserve_exploration_image_batched(uuid,uuid,text,uuid,integer) from authenticated;
revoke all on function public.reserve_exploration_image_proven(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reserve_exploration_image_batched_proven(uuid,uuid,text,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.reject_exploration_image(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_exploration_image_proven(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_exploration_image_proven(uuid,uuid,text,text) to authenticated;
grant execute on function public.reserve_exploration_image_batched_proven(uuid,uuid,text,uuid,integer,text) to authenticated;
grant execute on function public.reject_exploration_image(uuid,uuid,text) to authenticated;
grant execute on function public.complete_exploration_image_proven(uuid,uuid,text) to authenticated;
