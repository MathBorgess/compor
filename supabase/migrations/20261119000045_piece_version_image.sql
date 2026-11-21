-- Proposed only: do not apply to a remote database until Matheus approves.
-- One canonical image per saved piece version. The row is insert-only.
-- Authenticated roles may select their own rows and cannot insert, update or
-- delete. bind_piece_version_image checks the owner, the saved version and the
-- private object, then inserts once. The same asset is a no-op. A different
-- asset leaves the first link unchanged.
create table public.piece_version_images (
  project_id uuid not null,
  piece_id uuid not null,
  version integer not null check (version > 0),
  asset_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (project_id, piece_id, version),
  foreign key (project_id, piece_id, version)
    references public.piece_versions (project_id, piece_id, version)
);

alter table public.piece_version_images enable row level security;
revoke all on public.piece_version_images from public, anon, authenticated;
grant select on public.piece_version_images to authenticated;

create policy piece_version_images_select_owner on public.piece_version_images
  for select to authenticated using (
    exists (
      select 1 from public.projects
      where id = piece_version_images.project_id
        and owner_id = (select auth.uid())
    )
  );

create function public.bind_piece_version_image(
  p_project_id uuid,
  p_piece_id uuid,
  p_version integer,
  p_asset_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_existing uuid;
  v_path text;
begin
  if v_owner is null
     or p_project_id is null
     or p_piece_id is null
     or p_asset_id is null
     or p_version is null
     or p_version < 1
     or p_version > 2147483647 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  perform 1 from public.projects
    where id = p_project_id and owner_id = v_owner
    for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not exists (
    select 1 from public.piece_versions
    where project_id = p_project_id
      and piece_id = p_piece_id
      and version = p_version
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_path := lower(v_owner::text) || '/' || lower(p_project_id::text) || '/'
    || lower(p_piece_id::text) || '/' || p_version::text || '/'
    || lower(p_asset_id::text) || '.png';
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'compor-project-images' and name = v_path
  ) then
    return jsonb_build_object('status', 'not_found');
  end if;

  select asset_id into v_existing
    from public.piece_version_images
    where project_id = p_project_id
      and piece_id = p_piece_id
      and version = p_version
    for update;
  if found then
    if v_existing = p_asset_id then
      return jsonb_build_object('status', 'bound', 'assetId', v_existing);
    end if;
    return jsonb_build_object('status', 'conflict', 'assetId', v_existing);
  end if;

  begin
    insert into public.piece_version_images (project_id, piece_id, version, asset_id)
      values (p_project_id, p_piece_id, p_version, p_asset_id);
  exception when unique_violation then
    select asset_id into v_existing
      from public.piece_version_images
      where project_id = p_project_id
        and piece_id = p_piece_id
        and version = p_version;
    if v_existing = p_asset_id then
      return jsonb_build_object('status', 'bound', 'assetId', v_existing);
    end if;
    return jsonb_build_object('status', 'conflict', 'assetId', v_existing);
  end;

  return jsonb_build_object('status', 'bound', 'assetId', p_asset_id);
end;
$$;

revoke all on function public.bind_piece_version_image(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.bind_piece_version_image(uuid, uuid, integer, uuid) to authenticated;
