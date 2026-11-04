-- Proposed only. Validate isolation and concurrency in a separate Supabase project.
-- All fields are bounded metadata; no prompt, key, response, URL or free text.
create table public.usage_measurements (
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  attempt_id uuid not null references public.agent_attempts(id),
  part text not null check (part in ('agent','agent_resume','image')),
  part_id uuid not null,
  model text not null check ((part in ('agent','agent_resume') and model='gpt-6-astra') or (part='image' and model='gpt-image-2.5-flare')),
  state text not null default 'started' check (state in ('started','completed','unknown')),
  input_tokens integer check (input_tokens between 0 and 100000000),
  output_tokens integer check (output_tokens between 0 and 100000000),
  total_tokens integer check (total_tokens between 0 and 100000000),
  input_text_tokens integer check (input_text_tokens between 0 and 100000000),
  input_image_tokens integer check (input_image_tokens between 0 and 100000000),
  output_image_tokens integer check (output_image_tokens between 0 and 100000000),
  estimated_cost_usd numeric(20,10) check (estimated_cost_usd >= 0),
  pricing_version text check (pricing_version in ('openai-public-2026-11-04')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (attempt_id,part,part_id)
);
alter table public.usage_measurements enable row level security;
revoke all on public.usage_measurements from public,anon,authenticated;
grant select on public.usage_measurements to authenticated;
create policy usage_measurements_owner on public.usage_measurements for select to authenticated using (
  owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))
);

create function public.start_usage_measurement(p_project_id uuid,p_attempt_id uuid,p_part text,p_part_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_count integer; v_execution uuid; v_execution_state text; v_attempt_state text; v_submission_state text;
begin
 if v_owner is null or p_part is null or p_part not in ('agent','agent_resume','image') or p_part_id is null then raise exception 'usage unavailable' using errcode='42501'; end if;
 if p_part='agent' and p_part_id<>p_attempt_id then raise exception 'usage unavailable' using errcode='42501'; end if;
 -- Explicit execution -> attempt -> submission lock order. Other transaction
 -- paths must be tested together; locks cannot make subsequent HTTP atomic.
 if p_part='image' then
   select e.id,e.state into v_execution,v_execution_state from public.image_tool_executions e
     join public.image_tool_reservations r on r.id=e.reservation_id
     where e.id=p_part_id and e.owner_id=v_owner and r.owner_id=v_owner and r.agent_attempt_id=p_attempt_id and r.project_id=p_project_id
     for update of e;
   if not found or v_execution_state<>'running' then raise exception 'usage unavailable' using errcode='42501'; end if;
 elsif p_part='agent_resume' then
   select e.id,e.state into v_execution,v_execution_state from public.image_tool_executions e
     join public.image_tool_result_submissions s on s.execution_id=e.id
     join public.image_tool_reservations r on r.id=e.reservation_id
     where s.id=p_part_id and s.owner_id=v_owner and e.owner_id=v_owner and r.owner_id=v_owner and r.agent_attempt_id=p_attempt_id and r.project_id=p_project_id
     for update of e;
   if not found or v_execution_state<>'completed' then raise exception 'usage unavailable' using errcode='42501'; end if;
 end if;
 select a.state into v_attempt_state from public.agent_attempts a join public.projects p on p.id=a.project_id
   where a.id=p_attempt_id and a.project_id=p_project_id and a.owner_id=v_owner and p.owner_id=v_owner
   for update of a;
 if not found or v_attempt_state<>'started' then raise exception 'usage unavailable' using errcode='42501'; end if;
 if p_part='agent_resume' then
   select s.state into v_submission_state from public.image_tool_result_submissions s
     where s.id=p_part_id and s.owner_id=v_owner and s.execution_id=v_execution for update of s;
   if not found or v_submission_state<>'sending' then raise exception 'usage unavailable' using errcode='42501'; end if;
 end if;
 insert into public.usage_measurements(owner_id,project_id,attempt_id,part,part_id,model) values(v_owner,p_project_id,p_attempt_id,p_part,p_part_id,case when p_part='image' then 'gpt-image-2.5-flare' else 'gpt-6-astra' end)
   on conflict do nothing;
 get diagnostics v_count=row_count; return v_count=1;
end $$;

create function public.finish_usage_measurement(p_project_id uuid,p_attempt_id uuid,p_part text,p_part_id uuid,p_state text,p_input_tokens integer,p_output_tokens integer,p_total_tokens integer,p_input_text_tokens integer,p_input_image_tokens integer,p_output_image_tokens integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_count integer;
begin
 if v_owner is null or p_state is null or p_state not in ('completed','unknown') then raise exception 'usage unavailable' using errcode='42501'; end if;
 update public.usage_measurements m set state=p_state,input_tokens=p_input_tokens,output_tokens=p_output_tokens,total_tokens=p_total_tokens,input_text_tokens=p_input_text_tokens,input_image_tokens=p_input_image_tokens,output_image_tokens=p_output_image_tokens,
 estimated_cost_usd=case when m.part='image' and p_state='completed' and p_input_text_tokens is not null and p_input_image_tokens is not null and p_output_image_tokens is not null and p_input_tokens=p_input_text_tokens+p_input_image_tokens and p_output_tokens=p_output_image_tokens and p_total_tokens=p_input_tokens+p_output_tokens then (p_input_text_tokens::numeric*5+p_input_image_tokens::numeric*8+p_output_image_tokens::numeric*30)/1000000 else null end,
 pricing_version=case when m.part='image' and p_state='completed' and p_input_text_tokens is not null and p_input_image_tokens is not null and p_output_image_tokens is not null and p_input_tokens=p_input_text_tokens+p_input_image_tokens and p_output_tokens=p_output_image_tokens and p_total_tokens=p_input_tokens+p_output_tokens then 'openai-public-2026-11-04' else null end,
 ended_at=now()
 where m.owner_id=v_owner and m.project_id=p_project_id and m.attempt_id=p_attempt_id and m.part=p_part and m.part_id=p_part_id and m.state='started'
   and exists(select 1 from public.agent_attempts a join public.projects p on p.id=a.project_id where a.id=m.attempt_id and a.owner_id=v_owner and p.id=m.project_id and p.owner_id=v_owner);
 get diagnostics v_count=row_count; return v_count=1;
end $$;
revoke all on function public.start_usage_measurement(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_usage_measurement(uuid,uuid,text,uuid,text,integer,integer,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.start_usage_measurement(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.finish_usage_measurement(uuid,uuid,text,uuid,text,integer,integer,integer,integer,integer,integer) to authenticated;
