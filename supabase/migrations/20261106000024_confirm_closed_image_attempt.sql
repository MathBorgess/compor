-- A finished parent attempt cannot accept a late image reservation. Lock the
-- same row as reserve_image_tool_call before proving no image was reserved.
create function public.confirm_closed_image_attempt(p_project_id uuid,p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_attempt uuid; v_state text;
begin
  if auth.uid() is null or p_project_id is null or p_request_id is null then
    raise exception 'unavailable' using errcode='42501';
  end if;
  select a.id,a.state into v_attempt,v_state
    from public.studio_turns t
    join public.agent_attempts a on a.id=t.attempt_id and a.owner_id=t.owner_id and a.project_id=t.project_id
    join public.projects p on p.id=t.project_id and p.owner_id=t.owner_id
    where t.owner_id=auth.uid() and t.project_id=p_project_id and t.request_id=p_request_id and t.state='completed'
    for update of a;
  if not found or v_state<>'completed' then return 'unverified'; end if;
  if exists(select 1 from public.image_tool_reservations r where r.owner_id=auth.uid() and r.project_id=p_project_id and r.agent_attempt_id=v_attempt) then
    return 'unverified';
  end if;
  return 'confirmed';
end $$;
revoke all on function public.confirm_closed_image_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_closed_image_attempt(uuid,uuid) to authenticated;
