-- Atomically fence an image action only when its first reservation did not exist.
-- This protects against a late request crossing a read-only absence check.
create table public.image_non_dispatch_fences (
  reservation_id uuid primary key references public.image_tool_reservations(id),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.image_non_dispatch_fences enable row level security;
revoke all on public.image_non_dispatch_fences from public,anon,authenticated;

create function public.fence_unsubmitted_image_tool_call(
  p_project_id uuid,p_piece_id uuid,p_piece_version integer,p_attempt_id uuid,
  p_session_id text,p_turn_id text,p_call_id text
) returns text language plpgsql security definer set search_path = '' as $$
declare v_reservation uuid; v_state text; v_new boolean;
begin
  select r.reservation_id,r.state,r.is_new into v_reservation,v_state,v_new
    from public.reserve_image_tool_call(p_project_id,p_piece_id,p_piece_version,p_attempt_id,p_session_id,p_turn_id,p_call_id) r;
  if v_new is distinct from true then
    if v_state='unknown' and exists(select 1 from public.image_non_dispatch_fences f where f.reservation_id=v_reservation and f.owner_id=auth.uid()) then return 'fenced'; end if;
    return 'unverified';
  end if;
  if v_state <> 'reserved' then return 'unverified'; end if;
  if public.mark_image_tool_call_unknown(p_project_id,p_session_id,p_turn_id,p_call_id) is distinct from true then
    raise exception 'unavailable' using errcode='42501';
  end if;
  insert into public.image_non_dispatch_fences(reservation_id,owner_id) values(v_reservation,auth.uid());
  return 'fenced';
end;
$$;
revoke all on function public.fence_unsubmitted_image_tool_call(uuid,uuid,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fence_unsubmitted_image_tool_call(uuid,uuid,integer,uuid,text,text,text) to authenticated;
