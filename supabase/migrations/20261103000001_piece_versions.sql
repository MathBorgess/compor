-- Review and validate against an isolated Supabase project before applying.
create table public.piece_versions (
  project_id uuid not null references public.projects(id),
  piece_id uuid not null,
  version integer not null check (version > 0),
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (project_id, piece_id, version)
);

alter table public.piece_versions enable row level security;
revoke all on public.piece_versions from public, anon, authenticated;
grant select on public.piece_versions to authenticated;
create policy piece_versions_select_owner on public.piece_versions
  for select to authenticated using (
    exists (select 1 from public.projects where id = piece_versions.project_id and owner_id = (select auth.uid()))
  );

-- All writes pass through this transaction. A lock on the owned project serializes
-- comparisons and inserts; direct writes remain unavailable to authenticated users.
create function public.save_piece_version(p_project_id uuid, p_piece_id uuid, p_expected_version integer, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version integer;
  saved public.piece_versions%rowtype;
begin
  if p_project_id is null or p_piece_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646 or not coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content ?& array['headline', 'price', 'date', 'caption', 'captionOrigin']
    and p_content - array['headline', 'price', 'date', 'caption', 'captionOrigin'] = '{}'::jsonb
    and jsonb_typeof(p_content->'headline') = 'string' and length(p_content->>'headline') <= 500
    and jsonb_typeof(p_content->'price') = 'string' and length(p_content->>'price') <= 100
    and jsonb_typeof(p_content->'date') = 'string' and length(p_content->>'date') <= 100
    and jsonb_typeof(p_content->'caption') = 'string' and length(p_content->>'caption') <= 4000
    and jsonb_typeof(p_content->'captionOrigin') = 'string' and p_content->>'captionOrigin' in ('user', 'agent'), false
  ) then raise exception 'invalid_request' using errcode = '22023'; end if;

  perform 1 from public.projects where id = p_project_id and owner_id = (select auth.uid()) for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(max(version), 0) into current_version from public.piece_versions where project_id = p_project_id and piece_id = p_piece_id;
  if current_version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'currentVersion', current_version);
  end if;
  insert into public.piece_versions (project_id, piece_id, version, content)
    values (p_project_id, p_piece_id, current_version + 1, p_content) returning * into saved;
  return jsonb_build_object('status', 'saved', 'version', to_jsonb(saved));
end;
$$;
revoke all on function public.save_piece_version(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_piece_version(uuid, uuid, integer, jsonb) to authenticated;
