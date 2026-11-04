-- Experimental: an authenticated account declaration, not proof of a human click.
-- This record does not authorize generation or verify OpenAI session provenance.
create table public.image_consent_declarations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  reservation_id uuid not null unique references public.image_tool_reservations(id),
  created_at timestamptz not null default now()
);
alter table public.image_consent_declarations enable row level security;
revoke all on public.image_consent_declarations from public, anon, authenticated;
grant select on public.image_consent_declarations to authenticated;
create policy image_consent_declarations_select_owner on public.image_consent_declarations
  for select to authenticated using ((select auth.uid()) = owner_id);

create function public.declare_image_generation_consent(p_reservation_id uuid, p_confirmed boolean)
returns table (declaration_id uuid, is_new boolean)
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_reservation_state text; v_attempt_state text; v_id uuid;
begin
  if v_owner is null or p_reservation_id is null or p_confirmed is distinct from true then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  select r.state, a.state into v_reservation_state, v_attempt_state
    from public.image_tool_reservations r join public.agent_attempts a on a.id = r.agent_attempt_id
    join public.projects p on p.id = r.project_id
    where r.id = p_reservation_id and r.owner_id = v_owner and a.owner_id = v_owner
      and a.project_id = r.project_id and p.owner_id = v_owner
    for update of r, a;
  if not found then raise exception 'declaration unavailable' using errcode = '42501'; end if;
  select d.id into v_id from public.image_consent_declarations d
    where d.reservation_id = p_reservation_id and d.owner_id = v_owner;
  if v_id is not null then return query select v_id, false; return; end if;
  if v_reservation_state <> 'reserved' or v_attempt_state <> 'started' then
    raise exception 'declaration unavailable' using errcode = '42501';
  end if;
  insert into public.image_consent_declarations(owner_id, reservation_id)
    values(v_owner, p_reservation_id) returning id into v_id;
  return query select v_id, true;
end;
$$;
revoke all on function public.declare_image_generation_consent(uuid, boolean) from public, anon, authenticated;
grant execute on function public.declare_image_generation_consent(uuid, boolean) to authenticated;
