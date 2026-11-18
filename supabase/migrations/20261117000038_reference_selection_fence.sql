-- An absent receipt is not evidence that a write will never commit. Fence the
-- exact command under the same account lock, without changing selection state.
create table public.reference_selection_fences (
 owner_id uuid not null references auth.users(id),
 command_id uuid not null,
 project_id uuid not null references public.projects(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,command_id)
);
alter table public.reference_selection_fences enable row level security;
revoke all on public.reference_selection_fences from public,anon,authenticated;

-- Keep the old implementation private. Every public write, including callers
-- predating the fence endpoint, now consults the tombstone before it can apply.
alter function public.write_reference_selection(uuid,uuid,bigint,jsonb) rename to write_reference_selection_before_fence;
revoke all on function public.write_reference_selection_before_fence(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
create function public.write_reference_selection(p_project_id uuid,p_command_id uuid,p_expected_revision bigint,p_state jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_project uuid;
begin
 if v_owner is null or p_project_id is null or p_command_id is null then raise exception 'invalid request' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found');end if;
 select project_id into v_project from public.reference_selection_fences where owner_id=v_owner and command_id=p_command_id;
 if found then
  if v_project<>p_project_id then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','fenced','commandId',p_command_id);
 end if;
 return public.write_reference_selection_before_fence(p_project_id,p_command_id,p_expected_revision,p_state);
end $$;

create function public.fence_reference_selection_command(p_project_id uuid,p_command_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_command public.reference_selection_commands%rowtype;v_project uuid;
begin
 if v_owner is null or p_project_id is null or p_command_id is null then raise exception 'invalid request' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found');end if;
 select * into v_command from public.reference_selection_commands where owner_id=v_owner and command_id=p_command_id;
 if found then
  if v_command.project_id<>p_project_id then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','applied','commandId',p_command_id,'revision',v_command.revision);
 end if;
 select project_id into v_project from public.reference_selection_fences where owner_id=v_owner and command_id=p_command_id;
 if found then
  if v_project<>p_project_id then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','fenced','commandId',p_command_id);
 end if;
 if public.current_reference_session() is null then return jsonb_build_object('status','unavailable');end if;
 insert into public.reference_selection_fences(owner_id,command_id,project_id) values(v_owner,p_command_id,p_project_id);
 return jsonb_build_object('status','fenced','commandId',p_command_id);
end $$;

create or replace function public.get_reference_selection_command(p_project_id uuid,p_command_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_command public.reference_selection_commands%rowtype;
begin
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return null;end if;
 select * into v_command from public.reference_selection_commands where owner_id=v_owner and project_id=p_project_id and command_id=p_command_id;
 if found then return jsonb_build_object('status','applied','commandId',p_command_id,'revision',v_command.revision);end if;
 if exists(select 1 from public.reference_selection_fences where owner_id=v_owner and project_id=p_project_id and command_id=p_command_id)
  then return jsonb_build_object('status','fenced','commandId',p_command_id);end if;
 return null;
end $$;
revoke all on function public.write_reference_selection(uuid,uuid,bigint,jsonb),public.fence_reference_selection_command(uuid,uuid),public.get_reference_selection_command(uuid,uuid) from public,anon,authenticated;
grant execute on function public.write_reference_selection(uuid,uuid,bigint,jsonb),public.fence_reference_selection_command(uuid,uuid),public.get_reference_selection_command(uuid,uuid) to authenticated;
