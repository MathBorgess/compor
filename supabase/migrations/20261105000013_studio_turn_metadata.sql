-- Only operational metadata. Conversation, draft content and API keys remain out
-- of these tables. Review and exercise in the isolated pilot before applying.
create table public.studio_turns (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  attempt_id uuid not null unique references public.agent_attempts(id),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'starting' check (state in ('starting','running','action_required','completed','failed','unknown')),
  session_binding text check (length(session_binding) between 10 and 2048),
  session_expires_at timestamptz,
  prior_turn_id text check (prior_turn_id ~ '^turn_[A-Za-z0-9_-]{1,128}$'),
  turn_id text check (turn_id ~ '^turn_[A-Za-z0-9_-]{1,128}$'),
  initial_input_tokens bigint check (initial_input_tokens between 0 and 100000000),
  initial_output_tokens bigint check (initial_output_tokens between 0 and 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index studio_turns_one_active_project on public.studio_turns(project_id)
  where state in ('starting','running','action_required','unknown');
alter table public.studio_turns enable row level security;
revoke all on public.studio_turns from public,anon,authenticated;

create table public.studio_action_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  request_id uuid not null references public.studio_turns(request_id),
  turn_id text not null check (turn_id ~ '^turn_[A-Za-z0-9_-]{1,128}$'),
  call_id text not null check (call_id ~ '^call_[A-Za-z0-9_-]{1,128}$'),
  action_digest text not null check (action_digest ~ '^[0-9a-f]{64}$'),
  result_digest text not null check (result_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'sending' check (state in ('sending','accepted','unknown')),
  created_at timestamptz not null default now(),
  unique(request_id,turn_id,call_id)
);
alter table public.studio_action_submissions enable row level security;
revoke all on public.studio_action_submissions from public,anon,authenticated;

create function public.reserve_studio_turn(p_project_id uuid,p_request_id uuid,p_input_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_existing public.studio_turns%rowtype; v_attempt uuid;
begin
 if v_owner is null or p_request_id is null or p_input_digest is null or p_input_digest !~ '^[0-9a-f]{64}$' then raise exception 'unavailable' using errcode='42501';end if;
 perform 1 from public.projects where id=p_project_id and owner_id=v_owner for update;
 if not found then return jsonb_build_object('status','not_found');end if;
 select * into v_existing from public.studio_turns where request_id=p_request_id;
 if found then
  if v_existing.owner_id<>v_owner or v_existing.project_id<>p_project_id or v_existing.input_digest<>p_input_digest then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','existing','turn',to_jsonb(v_existing));
 end if;
 if exists(select 1 from public.studio_turns where project_id=p_project_id and state in ('starting','running','action_required','unknown'))then return jsonb_build_object('status','busy');end if;
 insert into public.agent_attempts(owner_id,project_id,idempotency_key) values(v_owner,p_project_id,p_request_id)
  on conflict(owner_id,idempotency_key)do nothing returning id into v_attempt;
 if v_attempt is null then return jsonb_build_object('status','conflict');end if;
 insert into public.studio_turns(request_id,owner_id,project_id,attempt_id,input_digest) values(p_request_id,v_owner,p_project_id,v_attempt,p_input_digest) returning * into v_existing;
 return jsonb_build_object('status','reserved','turn',to_jsonb(v_existing));
end $$;

create function public.get_studio_turn(p_project_id uuid,p_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(t) from public.studio_turns t join public.projects p on p.id=t.project_id
 where t.project_id=p_project_id and t.request_id=p_request_id and t.owner_id=auth.uid() and p.owner_id=auth.uid();
$$;

create function public.bind_studio_session(p_project_id uuid,p_request_id uuid,p_binding text,p_expires_at timestamptz,p_prior_turn_id text,p_initial_input bigint,p_initial_output bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if auth.uid() is null or p_binding is null or p_binding !~ '^v4[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' or length(p_binding)>2048
  or p_expires_at is null or p_expires_at>now()+interval '5 minutes' or p_expires_at<=now()
  or (p_prior_turn_id is not null and p_prior_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$')
  or (p_initial_input is not null and p_initial_input not between 0 and 100000000) or (p_initial_output is not null and p_initial_output not between 0 and 100000000) then raise exception 'unavailable' using errcode='42501';end if;
 update public.studio_turns t set session_binding=p_binding,session_expires_at=p_expires_at,prior_turn_id=p_prior_turn_id,
  initial_input_tokens=p_initial_input,initial_output_tokens=p_initial_output,state='running',updated_at=now()
 where t.request_id=p_request_id and t.project_id=p_project_id and t.owner_id=auth.uid() and t.state='starting' and t.session_binding is null
  and exists(select 1 from public.projects p where p.id=t.project_id and p.owner_id=auth.uid());
 get diagnostics v_count=row_count;return v_count=1;
end $$;

create function public.set_studio_turn_state(p_project_id uuid,p_request_id uuid,p_state text,p_turn_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if auth.uid() is null or p_state is null or p_state not in ('running','action_required','completed','failed','unknown')
  or (p_turn_id is not null and p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$') then raise exception 'unavailable' using errcode='42501';end if;
 update public.studio_turns t set state=p_state,turn_id=coalesce(t.turn_id,p_turn_id),updated_at=now()
 where t.request_id=p_request_id and t.project_id=p_project_id and t.owner_id=auth.uid() and t.state not in ('completed','failed')
  and (t.turn_id is null or p_turn_id is null or t.turn_id=p_turn_id)
  and exists(select 1 from public.projects p where p.id=t.project_id and p.owner_id=auth.uid());
 get diagnostics v_count=row_count;return v_count=1;
end $$;

create function public.claim_studio_action(p_project_id uuid,p_request_id uuid,p_turn_id text,p_call_id text,p_action_digest text,p_result_digest text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_turn public.studio_turns%rowtype; v_id uuid; v_action public.studio_action_submissions%rowtype;
begin
 if auth.uid() is null or p_turn_id is null or p_turn_id !~ '^turn_[A-Za-z0-9_-]{1,128}$' or p_call_id is null or p_call_id !~ '^call_[A-Za-z0-9_-]{1,128}$'
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

create function public.finish_studio_action(p_project_id uuid,p_request_id uuid,p_submission_id uuid,p_state text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if auth.uid() is null or p_state is null or p_state not in ('accepted','unknown')then raise exception 'unavailable' using errcode='42501';end if;
 update public.studio_action_submissions a set state=p_state where a.id=p_submission_id and a.project_id=p_project_id and a.request_id=p_request_id and a.owner_id=auth.uid() and a.state='sending'
  and exists(select 1 from public.projects p where p.id=a.project_id and p.owner_id=auth.uid());
 get diagnostics v_count=row_count;return v_count=1;
end $$;

create function public.get_studio_action(p_project_id uuid,p_request_id uuid,p_turn_id text,p_call_id text)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',a.state) from public.studio_action_submissions a join public.projects p on p.id=a.project_id
 where a.project_id=p_project_id and a.request_id=p_request_id and a.turn_id=p_turn_id and a.call_id=p_call_id
  and a.owner_id=auth.uid() and p.owner_id=auth.uid();
$$;

revoke all on function public.reserve_studio_turn(uuid,uuid,text),public.get_studio_turn(uuid,uuid),public.bind_studio_session(uuid,uuid,text,timestamptz,text,bigint,bigint),public.set_studio_turn_state(uuid,uuid,text,text),public.claim_studio_action(uuid,uuid,text,text,text,text),public.finish_studio_action(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_studio_turn(uuid,uuid,text),public.get_studio_turn(uuid,uuid),public.bind_studio_session(uuid,uuid,text,timestamptz,text,bigint,bigint),public.set_studio_turn_state(uuid,uuid,text,text),public.claim_studio_action(uuid,uuid,text,text,text,text),public.finish_studio_action(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.get_studio_action(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.get_studio_action(uuid,uuid,text,text) to authenticated;
