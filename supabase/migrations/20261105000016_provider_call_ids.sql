-- Preserve opaque provider call IDs verbatim. No prefix normalization, new
-- authority, history rewrite or change to session/turn/owner comparisons.
alter table public.studio_action_submissions drop constraint studio_action_submissions_call_id_check;
alter table public.studio_action_submissions add constraint studio_action_submissions_call_id_v2_check
 check (call_id ~ '^(call|exec)_[A-Za-z0-9_-]{1,128}$');

create or replace function public.reserve_image_tool_call(p_project_id uuid, p_piece_id uuid, p_piece_version integer, p_attempt_id uuid, p_session_id text, p_turn_id text, p_call_id text)
returns table (reservation_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_id uuid; v_state text; v_attempt_state text;
begin
  if v_owner is null or p_project_id is null or p_piece_id is null or p_piece_version is null or p_piece_version < 1 or p_attempt_id is null or
     p_session_id is null or p_session_id !~ '^sess_[A-Za-z0-9_-]{1,128}$' or
     p_turn_id is null or p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$' or
     p_call_id is null or p_call_id !~ '^(call|exec)_[A-Za-z0-9_-]{1,128}$' or
     pg_catalog.strpos(pg_catalog.lower(p_session_id || p_turn_id || p_call_id), 'sk-') > 0 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  -- Serialize with updates that finish the parent attempt before checking its state.
  select a.state into v_attempt_state from public.projects p join public.piece_versions v on v.project_id = p.id
    join public.agent_attempts a on a.project_id = p.id
    where p.id = p_project_id and p.owner_id = v_owner and v.piece_id = p_piece_id and v.version = p_piece_version
      and a.id = p_attempt_id and a.owner_id = v_owner
    for update of a;
  if not found then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  select r.id, r.state into v_id, v_state from public.image_tool_reservations r
    where r.owner_id = v_owner and r.project_id = p_project_id and r.piece_id = p_piece_id and r.piece_version = p_piece_version
      and r.agent_attempt_id = p_attempt_id and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id;
  if v_id is not null then return query select v_id, v_state, false; return; end if;
  if v_attempt_state <> 'started' then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  insert into public.image_tool_reservations(owner_id, project_id, piece_id, piece_version, agent_attempt_id, session_id, turn_id, call_id)
    values(v_owner, p_project_id, p_piece_id, p_piece_version, p_attempt_id, p_session_id, p_turn_id, p_call_id)
    on conflict (session_id, turn_id, call_id) do nothing returning id into v_id;
  if v_id is not null then return query select v_id, 'reserved'::text, true; return; end if;
  select r.id, r.state into v_id, v_state from public.image_tool_reservations r
    where r.owner_id = v_owner and r.project_id = p_project_id and r.piece_id = p_piece_id and r.piece_version = p_piece_version
      and r.agent_attempt_id = p_attempt_id and r.session_id = p_session_id and r.turn_id = p_turn_id and r.call_id = p_call_id;
  if v_id is null then raise exception 'reservation unavailable' using errcode = '42501'; end if;
  return query select v_id, v_state, false;
end;
$$;

create or replace function public.claim_studio_action(p_project_id uuid,p_request_id uuid,p_turn_id text,p_call_id text,p_action_digest text,p_result_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_turn public.studio_turns%rowtype; v_id uuid; v_action public.studio_action_submissions%rowtype;
begin
 if auth.uid() is null or p_turn_id is null or p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$' or p_call_id is null or p_call_id !~ '^(call|exec)_[A-Za-z0-9_-]{1,128}$'
  or p_action_digest is null or p_action_digest !~ '^[0-9a-f]{64}$' or p_result_digest is null or p_result_digest !~ '^[0-9a-f]{64}$' then raise exception 'unavailable' using errcode='42501';end if;
 select t.* into v_turn from public.studio_turns t join public.projects p on p.id=t.project_id
  where t.project_id=p_project_id and t.request_id=p_request_id and t.owner_id=auth.uid() and p.owner_id=auth.uid() for update of t;
 if not found or v_turn.state<>'action_required' or v_turn.turn_id<>p_turn_id then return jsonb_build_object('status','unavailable');end if;
 insert into public.studio_action_submissions(owner_id,project_id,request_id,turn_id,call_id,action_digest,result_digest)
  values(auth.uid(),p_project_id,p_request_id,p_turn_id,p_call_id,p_action_digest,p_result_digest)
  on conflict(request_id,turn_id,call_id)do nothing returning id into v_id;
 if v_id is not null then return jsonb_build_object('status','claimed','id',v_id);end if;
 select * into v_action from public.studio_action_submissions where request_id=p_request_id and turn_id=p_turn_id and call_id=p_call_id and owner_id=auth.uid();
 if v_action.action_digest<>p_action_digest or v_action.result_digest<>p_result_digest then return jsonb_build_object('status','conflict');end if;
 return jsonb_build_object('status','existing','state',v_action.state,'id',v_action.id);
end $$;

revoke all on function public.reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.claim_studio_action(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text) to authenticated;
grant execute on function public.claim_studio_action(uuid,uuid,text,text,text,text) to authenticated;
