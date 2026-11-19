-- A generated candidate may be withheld without sending an asset or resuming
-- the pending provider action. Only the new execution claimant knows the proof.
alter table public.image_tool_executions
  drop constraint image_tool_executions_state_check,
  add constraint image_tool_executions_state_check check (state in ('running','unknown','completed','quality_held'));

alter table public.studio_turns add column image_quality_reason text
  check (image_quality_reason is null or
    (state='failed' and image_quality_reason in ('image_quality_rejected','image_quality_inconclusive')));

create table public.post_image_quality_claims (
  execution_id uuid primary key references public.image_tool_executions(id),
  owner_id uuid not null references auth.users(id),
  digest text not null check (digest ~ '^[a-f0-9]{64}$')
);
alter table public.post_image_quality_claims enable row level security;
revoke all on public.post_image_quality_claims from public,anon,authenticated;

create function public.claim_post_image_execution_proven(
  p_reservation_id uuid,p_quality_digest text,p_authority_request_id uuid default null,
  p_manifest_digest text default null,p_consent_secret text default null
) returns table(execution_id uuid,asset_id uuid,state text,is_new boolean)
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_claim record;
begin
 if v_owner is null or p_quality_digest is null or p_quality_digest !~ '^[a-f0-9]{64}$'
    or (p_authority_request_id is null and (p_manifest_digest is not null or p_consent_secret is not null))
    or (p_authority_request_id is not null and p_manifest_digest is null) then
   raise exception 'invalid request' using errcode='22023';
 end if;
 if p_authority_request_id is null then
   select * into strict v_claim from public.claim_image_tool_execution(p_reservation_id);
 else
   select * into strict v_claim from public.claim_image_tool_execution_authorized(
     p_reservation_id,p_authority_request_id,p_manifest_digest,p_consent_secret);
 end if;
 if v_claim.is_new then
   insert into public.post_image_quality_claims(execution_id,owner_id,digest)
     values(v_claim.execution_id,v_owner,p_quality_digest);
 end if;
 return query select v_claim.execution_id,v_claim.asset_id,v_claim.state,v_claim.is_new;
end $$;

create function public.hold_post_image_candidate(p_execution_id uuid,p_quality_secret text,p_quality_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=auth.uid();v_execution_state text;v_attempt_state text;v_turn_state text;
 v_request uuid;v_attempt uuid;v_project uuid;v_reason text;v_digest text;v_asset_path text;
begin
 if v_owner is null or p_execution_id is null or p_quality_secret is null
    or p_quality_secret !~ '^[a-f0-9]{64}$' or p_quality_reason is null
    or p_quality_reason not in ('image_quality_rejected','image_quality_inconclusive') then
   raise exception 'invalid request' using errcode='22023';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 select e.state,a.state,t.state,t.request_id,a.id,p.id,t.image_quality_reason,c.digest,
        v_owner::text || '/' || r.project_id::text || '/' || r.piece_id::text || '/' ||
          r.piece_version::text || '/' || e.asset_id::text || '.png'
 into v_execution_state,v_attempt_state,v_turn_state,v_request,v_attempt,v_project,v_reason,v_digest,v_asset_path
 from public.image_tool_executions e
 join public.post_image_quality_claims c on c.execution_id=e.id and c.owner_id=e.owner_id
 join public.image_tool_reservations r on r.id=e.reservation_id and r.owner_id=e.owner_id
 join public.agent_attempts a on a.id=r.agent_attempt_id and a.owner_id=r.owner_id and a.project_id=r.project_id
 join public.studio_turns t on t.attempt_id=a.id and t.owner_id=a.owner_id and t.project_id=a.project_id and t.turn_id=r.turn_id
 join public.projects p on p.id=r.project_id and p.owner_id=r.owner_id
 where e.id=p_execution_id and e.owner_id=v_owner
 for update of e,a,t;
 if not found or v_digest<>pg_catalog.encode(pg_catalog.sha256(pg_catalog.decode(p_quality_secret,'hex')),'hex') then
   raise exception 'quality outcome unavailable' using errcode='42501';
 end if;
 if v_execution_state='quality_held' then return v_turn_state='failed' and v_reason=p_quality_reason; end if;
 if v_execution_state not in ('running','unknown') or v_attempt_state not in ('started','unknown')
    or v_turn_state not in ('running','action_required','unknown','failed') or v_reason is not null
    or exists(select 1 from storage.objects o where o.bucket_id='compor-project-images' and o.name=v_asset_path) then
   raise exception 'quality outcome unavailable' using errcode='42501';
 end if;
 update public.image_tool_executions set state='quality_held',updated_at=now() where id=p_execution_id;
 update public.studio_turns set state='failed',image_quality_reason=p_quality_reason,updated_at=now()
   where request_id=v_request;
 -- Generation is observed, but the managed agent is still awaiting its tool result.
 update public.agent_attempts set state='unknown',updated_at=now() where id=v_attempt and state='started';
 update public.usage_measurements set state='unknown',ended_at=now()
   where owner_id=v_owner and project_id=v_project and attempt_id=v_attempt
     and part='agent' and part_id=v_attempt and state='started';
 return true;
end $$;

-- A held result remains held even if an object later appears at its reserved path.
create or replace function public.complete_image_tool_execution(p_execution_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_asset uuid; v_project uuid; v_piece uuid; v_version integer; v_path text;
begin
 select e.state, e.asset_id, r.project_id, r.piece_id, r.piece_version
   into v_state, v_asset, v_project, v_piece, v_version
   from public.image_tool_executions e join public.image_tool_reservations r on r.id=e.reservation_id
   join public.projects p on p.id=r.project_id
   where e.id=p_execution_id and e.owner_id=v_owner and r.owner_id=v_owner and p.owner_id=v_owner for update of e;
 if not found or v_state not in ('running','completed') then raise exception 'execution unavailable' using errcode='42501'; end if;
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

revoke all on function public.claim_post_image_execution_proven(uuid,text,uuid,text,text),
  public.hold_post_image_candidate(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_post_image_execution_proven(uuid,text,uuid,text,text),
  public.hold_post_image_candidate(uuid,text,text) to authenticated;
