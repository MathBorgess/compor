-- Proposed: validate on an isolated Supabase project before applying.
create table public.exploration_images (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  prompt_digest text not null check (prompt_digest ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('running','unknown','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exploration_one_unresolved_per_owner on public.exploration_images(owner_id) where state in ('running','unknown');
alter table public.exploration_images enable row level security;
revoke all on public.exploration_images from public, anon, authenticated;
grant select on public.exploration_images to authenticated;
create policy exploration_images_owner on public.exploration_images for select to authenticated using (owner_id = (select auth.uid()));

-- A short renewable lease gives a foreground piece priority over new background work.
-- No caller can mutate this queue directly; the lease expires after a disconnected client.
create table public.foreground_image_waits (
  owner_id uuid primary key references auth.users(id),
  reservation_id uuid not null references public.image_tool_reservations(id),
  expires_at timestamptz not null
);
alter table public.foreground_image_waits enable row level security;
revoke all on public.foreground_image_waits from public, anon, authenticated;

create function public.reserve_exploration_image(p_project_id uuid, p_id uuid, p_prompt_digest text)
returns table(state text, is_new boolean) language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_row public.exploration_images%rowtype;
begin
  if v_owner is null or p_id is null or p_project_id is null or p_prompt_digest is null or p_prompt_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = v_owner) then
    raise exception 'unavailable' using errcode = '42501';
  end if;
  select * into v_row from public.exploration_images e where e.id = p_id and e.owner_id = v_owner;
  if found then
    if v_row.project_id <> p_project_id or v_row.prompt_digest <> p_prompt_digest then raise exception 'unavailable' using errcode = '42501'; end if;
    return query select v_row.state, false; return;
  end if;
  if exists (select 1 from public.exploration_images e where e.owner_id = v_owner and e.state = 'unknown')
    or exists (select 1 from public.image_tool_executions e where e.owner_id = v_owner and e.state = 'unknown') then
    return query select 'blocked'::text, false; return;
  end if;
  if exists (select 1 from public.exploration_images e where e.owner_id = v_owner and e.state = 'running')
    or exists (select 1 from public.image_tool_executions e where e.owner_id = v_owner and e.state = 'running')
    or exists (select 1 from public.foreground_image_waits w where w.owner_id = v_owner and w.expires_at > now()) then
    return query select 'busy'::text, false; return;
  end if;
  insert into public.exploration_images(id,owner_id,project_id,prompt_digest,state) values (p_id,v_owner,p_project_id,p_prompt_digest,'running');
  return query select 'running'::text, true;
end;
$$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('compor-exploration-images','compor-exploration-images',false,8388608,array['image/png']);

create function public.compor_exploration_path_authorized(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]png$'
    and split_part(p_name,'/',1) = (select auth.uid())::text
    and exists (select 1 from public.exploration_images e join public.projects p on p.id=e.project_id
      where e.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
      and e.project_id::text=split_part(p_name,'/',2)
      and e.id::text=replace(split_part(p_name,'/',3),'.png','')), false);
$$;
grant execute on function public.compor_exploration_path_authorized(text) to public;
create policy exploration_image_read on storage.objects for select to authenticated using (bucket_id='compor-exploration-images' and public.compor_exploration_path_authorized(name));
create policy exploration_image_insert on storage.objects for insert to authenticated with check (bucket_id='compor-exploration-images' and public.compor_exploration_path_authorized(name));
create policy exploration_image_read_guard on storage.objects as restrictive for select to public using (case when bucket_id <> 'compor-exploration-images' then true when current_user <> 'authenticated' then false else public.compor_exploration_path_authorized(name) end);
create policy exploration_image_insert_guard on storage.objects as restrictive for insert to public with check (case when bucket_id <> 'compor-exploration-images' then true when current_user <> 'authenticated' then false else public.compor_exploration_path_authorized(name) end);
create policy exploration_image_update_guard on storage.objects as restrictive for update to public using (bucket_id <> 'compor-exploration-images') with check (bucket_id <> 'compor-exploration-images');
create policy exploration_image_delete_guard on storage.objects as restrictive for delete to public using (bucket_id <> 'compor-exploration-images');

create function public.finish_exploration_image(p_project_id uuid,p_id uuid,p_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_count integer;
begin
  if v_owner is null or p_state not in ('unknown','completed') then raise exception 'invalid request' using errcode='22023'; end if;
  if p_state='completed' and not exists (select 1 from storage.objects o where o.bucket_id='compor-exploration-images' and o.name=v_owner::text||'/'||p_project_id::text||'/'||p_id::text||'.png') then raise exception 'unavailable' using errcode='42501'; end if;
  update public.exploration_images e set state=p_state,updated_at=now() where e.id=p_id and e.project_id=p_project_id and e.owner_id=v_owner and (e.state='running' or (p_state='completed' and e.state='unknown'));
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'unavailable' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.reserve_exploration_image(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_exploration_image(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_exploration_image(uuid,uuid,text) to authenticated;
grant execute on function public.finish_exploration_image(uuid,uuid,text) to authenticated;

-- The original piece-image flow and exploration share one account-level gate.
-- Existing reservations remain idempotent; no new execution may pass an unresolved one.
create or replace function public.claim_image_tool_execution(p_reservation_id uuid)
returns table (execution_id uuid, asset_id uuid, state text, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_reservation_state text; v_attempt_state text; v_id uuid; v_asset uuid; v_state text; v_waiter uuid;
begin
  if v_owner is null or p_reservation_id is null then raise exception 'invalid request' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 0));
  select r.state, a.state into v_reservation_state, v_attempt_state
    from public.image_tool_reservations r join public.agent_attempts a on a.id = r.agent_attempt_id
    join public.projects p on p.id = r.project_id
    where r.id = p_reservation_id and r.owner_id = v_owner and a.owner_id = v_owner
      and a.project_id = r.project_id and p.owner_id = v_owner for update of r, a;
  if not found then raise exception 'execution unavailable' using errcode = '42501'; end if;
  select e.id,e.asset_id,e.state into v_id,v_asset,v_state from public.image_tool_executions e
    where e.reservation_id=p_reservation_id and e.owner_id=v_owner;
  if v_id is not null then return query select v_id,v_asset,v_state,false; return; end if;
  if v_reservation_state <> 'reserved' or v_attempt_state <> 'started' or not exists (
    select 1 from public.image_consent_declarations d where d.reservation_id=p_reservation_id and d.owner_id=v_owner
  ) then raise exception 'execution unavailable' using errcode = '42501'; end if;
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.expires_at <= now();
  select w.reservation_id into v_waiter from public.foreground_image_waits w where w.owner_id=v_owner;
  if v_waiter is not null and v_waiter <> p_reservation_id then
    return query select null::uuid,null::uuid,'busy'::text,false; return;
  end if;
  if exists (select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='unknown')
    or exists (select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='unknown') then
    return query select null::uuid,null::uuid,'blocked'::text,false; return;
  end if;
  if exists (select 1 from public.exploration_images e where e.owner_id=v_owner and e.state='running')
    or exists (select 1 from public.image_tool_executions e where e.owner_id=v_owner and e.state='running') then
    insert into public.foreground_image_waits(owner_id,reservation_id,expires_at)
      values(v_owner,p_reservation_id,now()+interval '15 seconds')
      on conflict(owner_id) do update set expires_at=excluded.expires_at;
    return query select null::uuid,null::uuid,'busy'::text,false; return;
  end if;
  delete from public.foreground_image_waits w where w.owner_id=v_owner and w.reservation_id=p_reservation_id;
  insert into public.image_tool_executions(owner_id,reservation_id) values(v_owner,p_reservation_id)
    returning id,image_tool_executions.asset_id into v_id,v_asset;
  return query select v_id,v_asset,'running'::text,true;
end;
$$;
