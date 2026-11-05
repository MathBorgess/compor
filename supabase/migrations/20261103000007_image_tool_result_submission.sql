-- Experimental at-most-once submission claim. Does not prove provider receipt or asset provenance.
create table public.image_tool_result_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  execution_id uuid not null unique references public.image_tool_executions(id),
  state text not null default 'sending' check (state in ('sending','unknown','sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.image_tool_result_submissions enable row level security;
revoke all on public.image_tool_result_submissions from public, anon, authenticated;
grant select on public.image_tool_result_submissions to authenticated;
create policy image_tool_result_submissions_owner on public.image_tool_result_submissions for select to authenticated using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.image_tool_executions e join public.image_tool_reservations r on r.id=e.reservation_id join public.projects p on p.id=r.project_id
    where e.id=execution_id and e.owner_id=(select auth.uid()) and r.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
  )
);

create function public.claim_image_tool_result_submission(p_execution_id uuid,p_project_id uuid,p_piece_id uuid,p_piece_version integer,p_attempt_id uuid,p_session_id text,p_turn_id text,p_call_id text)
returns table (submission_id uuid, asset_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path='' as $$
declare v_owner uuid := auth.uid(); v_asset uuid; v_execution_state text; v_attempt_state text; v_id uuid; v_state text;
begin
  select e.asset_id,e.state,a.state into v_asset,v_execution_state,v_attempt_state
    from public.image_tool_executions e join public.image_tool_reservations r on r.id=e.reservation_id
    join public.projects p on p.id=r.project_id join public.agent_attempts a on a.id=r.agent_attempt_id
    where e.id=p_execution_id and e.owner_id=v_owner and r.owner_id=v_owner and p.owner_id=v_owner and a.owner_id=v_owner
      and r.project_id=p_project_id and r.piece_id=p_piece_id and r.piece_version=p_piece_version and r.agent_attempt_id=p_attempt_id
      and r.session_id=p_session_id and r.turn_id=p_turn_id and r.call_id=p_call_id
      and exists (select 1 from storage.objects o where o.bucket_id='compor-project-images'
        and o.name=v_owner::text || '/' || r.project_id::text || '/' || r.piece_id::text || '/' || r.piece_version::text || '/' || e.asset_id::text || '.png')
    for update of e,a;
  if not found or v_execution_state <> 'completed' then raise exception 'submission unavailable' using errcode='42501'; end if;
  select s.id,s.state into v_id,v_state from public.image_tool_result_submissions s where s.execution_id=p_execution_id and s.owner_id=v_owner;
  if v_id is not null then return query select v_id,v_asset,v_state,false; return; end if;
  if v_attempt_state <> 'started' then raise exception 'submission unavailable' using errcode='42501'; end if;
  insert into public.image_tool_result_submissions(owner_id,execution_id) values(v_owner,p_execution_id) returning id into v_id;
  return query select v_id,v_asset,'sending'::text,true;
end;
$$;
create function public.finish_image_tool_result_submission(p_submission_id uuid,p_state text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid := auth.uid(); v_state text;
begin
  if p_state not in ('sent','unknown') or p_state is null then raise exception 'invalid state' using errcode='22023'; end if;
  select s.state into v_state from public.image_tool_result_submissions s
    join public.image_tool_executions e on e.id=s.execution_id join public.image_tool_reservations r on r.id=e.reservation_id join public.projects p on p.id=r.project_id
    where s.id=p_submission_id and s.owner_id=v_owner and e.owner_id=v_owner and r.owner_id=v_owner and p.owner_id=v_owner for update of s;
  if not found or (v_state <> 'sending' and v_state <> p_state) then raise exception 'submission unavailable' using errcode='42501'; end if;
  if v_state='sending' then update public.image_tool_result_submissions set state=p_state,updated_at=now() where id=p_submission_id; end if;
  return true;
end;
$$;
revoke all on function public.claim_image_tool_result_submission(uuid,uuid,uuid,integer,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_image_tool_result_submission(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_image_tool_result_submission(uuid,uuid,uuid,integer,uuid,text,text,text) to authenticated;
grant execute on function public.finish_image_tool_result_submission(uuid,text) to authenticated;
