-- Add an explicit model contract without rewriting historical measurements.
-- Legacy v1/v2 retain their Astra and image 2.5/2.6 behavior.
alter table public.usage_measurements drop constraint usage_measurements_model_v2_check;
alter table public.usage_measurements add constraint usage_measurements_model_v3_check
 check ((part in ('agent','agent_resume') and model in ('gpt-6-astra','gpt-6.1-terra'))
   or (part='image' and model in ('gpt-image-2.5-flare','gpt-image-2.6-flare')));

create function public.start_usage_measurement_v3(p_project_id uuid,p_attempt_id uuid,p_part text,p_part_id uuid,p_model text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_count integer; v_execution uuid; v_execution_state text; v_attempt_state text; v_submission_state text;
begin
 if v_owner is null or p_part is null or p_part not in ('agent','agent_resume','image') or p_part_id is null then raise exception 'usage unavailable' using errcode='42501'; end if;
 if not coalesce((p_part in ('agent','agent_resume') and p_model in ('gpt-6-astra','gpt-6.1-terra')) or (p_part='image' and p_model in ('gpt-image-2.5-flare','gpt-image-2.6-flare')),false) then raise exception 'usage unavailable' using errcode='42501'; end if;
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
 insert into public.usage_measurements(owner_id,project_id,attempt_id,part,part_id,model) values(v_owner,p_project_id,p_attempt_id,p_part,p_part_id,p_model)
   on conflict do nothing;
 get diagnostics v_count=row_count; return v_count=1;
end $$;

revoke all on function public.start_usage_measurement_v3(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.start_usage_measurement_v3(uuid,uuid,text,uuid,text) to authenticated;
