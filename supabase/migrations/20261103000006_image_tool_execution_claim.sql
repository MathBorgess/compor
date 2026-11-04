-- Experimental reservation claim. This does not start generation or prove origin of bytes.
create table public.image_tool_executions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  reservation_id uuid not null unique references public.image_tool_reservations(id),
  asset_id uuid not null unique default gen_random_uuid(),
  state text not null default 'running' check (state in ('running', 'unknown', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.image_tool_executions enable row level security;
revoke all on public.image_tool_executions from public, anon, authenticated;
grant select on public.image_tool_executions to authenticated;
create policy image_tool_executions_select_owner on public.image_tool_executions
  for select to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.image_tool_reservations r join public.projects p on p.id = r.project_id
        where r.id = reservation_id and r.owner_id = (select auth.uid()) and p.owner_id = (select auth.uid())
    )
  );

create function public.claim_image_tool_execution(p_reservation_id uuid)
returns table (execution_id uuid, asset_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_reservation_state text; v_attempt_state text; v_id uuid; v_asset uuid; v_state text;
begin
  if v_owner is null or p_reservation_id is null then raise exception 'invalid request' using errcode = '22023'; end if;
  select r.state, a.state into v_reservation_state, v_attempt_state
    from public.image_tool_reservations r join public.agent_attempts a on a.id = r.agent_attempt_id
    join public.projects p on p.id = r.project_id
    where r.id = p_reservation_id and r.owner_id = v_owner and a.owner_id = v_owner
      and a.project_id = r.project_id and p.owner_id = v_owner
    for update of r, a;
  if not found then raise exception 'execution unavailable' using errcode = '42501'; end if;
  select e.id, e.asset_id, e.state into v_id, v_asset, v_state from public.image_tool_executions e
    where e.reservation_id = p_reservation_id and e.owner_id = v_owner;
  if v_id is not null then return query select v_id, v_asset, v_state, false; return; end if;
  if v_reservation_state <> 'reserved' or v_attempt_state <> 'started' or not exists (
    select 1 from public.image_consent_declarations d where d.reservation_id = p_reservation_id and d.owner_id = v_owner
  ) then raise exception 'execution unavailable' using errcode = '42501'; end if;
  insert into public.image_tool_executions(owner_id, reservation_id) values(v_owner, p_reservation_id)
    returning id, image_tool_executions.asset_id into v_id, v_asset;
  return query select v_id, v_asset, 'running'::text, true;
end;
$$;

create function public.mark_image_tool_execution_unknown(p_execution_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text;
begin
  select e.state into v_state from public.image_tool_executions e
    join public.image_tool_reservations r on r.id = e.reservation_id
    join public.projects p on p.id = r.project_id
    where e.id = p_execution_id and e.owner_id = v_owner and r.owner_id = v_owner and p.owner_id = v_owner for update of e;
  if not found or v_state = 'completed' then raise exception 'execution unavailable' using errcode = '42501'; end if;
  if v_state = 'running' then update public.image_tool_executions set state = 'unknown', updated_at = now() where id = p_execution_id; end if;
  return true;
end;
$$;

-- Confirms association with an existing private object, not provider provenance or byte equality.
create function public.complete_image_tool_execution(p_execution_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_state text; v_asset uuid; v_project uuid; v_piece uuid; v_version integer; v_path text;
begin
  select e.state, e.asset_id, r.project_id, r.piece_id, r.piece_version
    into v_state, v_asset, v_project, v_piece, v_version
    from public.image_tool_executions e join public.image_tool_reservations r on r.id = e.reservation_id
    join public.projects p on p.id = r.project_id
    where e.id = p_execution_id and e.owner_id = v_owner and r.owner_id = v_owner and p.owner_id = v_owner for update of e;
  if not found or v_state = 'unknown' then raise exception 'execution unavailable' using errcode = '42501'; end if;
  if v_state = 'completed' then return true; end if;
  v_path := v_owner::text || '/' || v_project::text || '/' || v_piece::text || '/' || v_version::text || '/' || v_asset::text || '.png';
  if not exists (select 1 from storage.objects o where o.bucket_id = 'compor-project-images' and o.name = v_path) then
    raise exception 'asset unavailable' using errcode = '42501';
  end if;
  update public.image_tool_executions set state = 'completed', updated_at = now() where id = p_execution_id;
  return true;
end;
$$;
revoke all on function public.claim_image_tool_execution(uuid) from public, anon, authenticated;
revoke all on function public.mark_image_tool_execution_unknown(uuid) from public, anon, authenticated;
revoke all on function public.complete_image_tool_execution(uuid) from public, anon, authenticated;
grant execute on function public.claim_image_tool_execution(uuid) to authenticated;
grant execute on function public.mark_image_tool_execution_unknown(uuid) to authenticated;
grant execute on function public.complete_image_tool_execution(uuid) to authenticated;
