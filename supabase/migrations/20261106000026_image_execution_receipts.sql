-- Opaque evidence is writable by the account holder and is NOT trusted until
-- the application verifies its server HMAC and the stored image bytes. These
-- RPCs never release a browser fence or initiate/repeat an image operation.
create table public.image_execution_receipts (
  execution_id uuid primary key references public.image_tool_executions(id),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  request_id uuid not null references public.studio_turns(request_id),
  attempt_id uuid not null references public.agent_attempts(id),
  proof text not null check (length(proof) between 10 and 2048 and proof ~ '^v7[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$'),
  created_at timestamptz not null default now()
);
alter table public.image_execution_receipts enable row level security;
revoke all on public.image_execution_receipts from public,anon,authenticated;

-- The token is not verified here: only the server holds the signing key. The
-- caller can preempt its own slot with junk, which must fail closed on lookup.
-- Identical retries are idempotent; an existing receipt cannot be replaced.
create function public.store_image_execution_receipt(
  p_project_id uuid,p_request_id uuid,p_attempt_id uuid,p_execution_id uuid,p_proof text
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_existing text;
begin
  if v_owner is null or p_project_id is null or p_request_id is null or p_attempt_id is null or p_execution_id is null
     or p_proof is null or length(p_proof) not between 10 and 2048 or p_proof !~ '^v7[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then
    raise exception 'unavailable' using errcode='42501';
  end if;
  perform 1 from public.image_tool_executions e
    join public.image_tool_reservations r on r.id=e.reservation_id
    join public.agent_attempts a on a.id=r.agent_attempt_id and a.owner_id=r.owner_id and a.project_id=r.project_id
    join public.studio_turns t on t.attempt_id=a.id and t.owner_id=a.owner_id and t.project_id=a.project_id
    join public.projects p on p.id=r.project_id and p.owner_id=r.owner_id
    join public.piece_versions v on v.project_id=r.project_id and v.piece_id=r.piece_id and v.version=r.piece_version
    join public.image_tool_result_submissions s on s.execution_id=e.id and s.owner_id=e.owner_id
    where e.id=p_execution_id and e.owner_id=v_owner and r.owner_id=v_owner and p.id=p_project_id
      and a.id=p_attempt_id and t.request_id=p_request_id and r.state='reserved' and e.state='completed' and s.state='sent'
      and exists(select 1 from storage.objects o where o.bucket_id='compor-project-images'
        and o.name=v_owner::text||'/'||r.project_id::text||'/'||r.piece_id::text||'/'||r.piece_version::text||'/'||e.asset_id::text||'.png')
    for update of e;
  if not found then return false; end if;
  insert into public.image_execution_receipts(execution_id,owner_id,project_id,request_id,attempt_id,proof)
    values(p_execution_id,v_owner,p_project_id,p_request_id,p_attempt_id,p_proof)
    on conflict(execution_id) do nothing;
  select proof into v_existing from public.image_execution_receipts
    where execution_id=p_execution_id and owner_id=v_owner and project_id=p_project_id and request_id=p_request_id and attempt_id=p_attempt_id;
  return coalesce(v_existing=p_proof,false);
end $$;

-- Lock the same parent attempt as reservation. A terminal attempt cannot accept
-- a late reservation; more than one reservation remains ambiguous and is not
-- treated as a completed image. The caller must verify the opaque token.
create function public.get_completed_image_receipt(p_project_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_attempt uuid; v_state text; v_candidate jsonb;
begin
  if v_owner is null or p_project_id is null or p_request_id is null then
    raise exception 'unavailable' using errcode='42501';
  end if;
  select a.id,a.state into v_attempt,v_state from public.studio_turns t
    join public.agent_attempts a on a.id=t.attempt_id and a.owner_id=t.owner_id and a.project_id=t.project_id
    join public.projects p on p.id=t.project_id and p.owner_id=t.owner_id
    where t.request_id=p_request_id and t.project_id=p_project_id and t.owner_id=v_owner and t.state='completed'
    for update of a;
  if not found or v_state<>'completed' then return jsonb_build_object('status','unverified'); end if;
  if (select count(*) from public.image_tool_reservations r
      where r.owner_id=v_owner and r.project_id=p_project_id and r.agent_attempt_id=v_attempt)<>1 then
    return jsonb_build_object('status','unverified');
  end if;
  select jsonb_build_object('status','candidate','requestId',p_request_id,'attemptId',v_attempt,
      'pieceId',r.piece_id,'version',r.piece_version,'executionId',e.id,'assetId',e.asset_id,'proof',proof.proof)
    into v_candidate
    from public.image_tool_reservations r
    join public.image_tool_executions e on e.reservation_id=r.id and e.owner_id=r.owner_id
    join public.image_tool_result_submissions s on s.execution_id=e.id and s.owner_id=e.owner_id
    join public.image_execution_receipts proof on proof.execution_id=e.id and proof.owner_id=e.owner_id
      and proof.project_id=r.project_id and proof.request_id=p_request_id and proof.attempt_id=v_attempt
    join public.piece_versions v on v.project_id=r.project_id and v.piece_id=r.piece_id and v.version=r.piece_version
    where r.owner_id=v_owner and r.project_id=p_project_id and r.agent_attempt_id=v_attempt
      and r.state='reserved' and e.state='completed' and s.state='sent'
      and exists(select 1 from storage.objects o where o.bucket_id='compor-project-images'
        and o.name=v_owner::text||'/'||r.project_id::text||'/'||r.piece_id::text||'/'||r.piece_version::text||'/'||e.asset_id::text||'.png');
  return coalesce(v_candidate,jsonb_build_object('status','unverified'));
end $$;
revoke all on function public.store_image_execution_receipt(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_completed_image_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.store_image_execution_receipt(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.get_completed_image_receipt(uuid,uuid) to authenticated;
