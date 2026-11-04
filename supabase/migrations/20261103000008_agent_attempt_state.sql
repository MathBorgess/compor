-- Proposed only: validate on an isolated Supabase project before use.
-- Preserve 00002: remove its direct UPDATE grants and enforce terminal transitions.
revoke update on public.agent_attempts from public, anon, authenticated;
revoke update (state, updated_at) on public.agent_attempts from public, anon, authenticated;

create or replace function public.finish_agent_attempt(p_project_id uuid, p_attempt_id uuid, p_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_count integer;
begin
  if v_owner is null then raise exception 'attempt unavailable' using errcode = '42501'; end if;
  if p_state is null or p_state not in ('completed', 'unknown') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  update public.agent_attempts a set state = p_state, updated_at = now()
    where a.id = p_attempt_id and a.project_id = p_project_id and a.owner_id = v_owner and a.state = 'started'
      and exists (select 1 from public.projects p where p.id = a.project_id and p.owner_id = v_owner);
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'attempt unavailable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.finish_agent_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_agent_attempt(uuid, uuid, text) to authenticated;
