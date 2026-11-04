-- Proposed only: review and test in a separate Supabase project before applying.
-- Restrictive guards below intersect even with pre-existing permissive policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compor-project-images', 'compor-project-images', false, 8388608, array['image/png']);

-- Canonical name: user UUID/project UUID/piece UUID/version/asset UUID.png.
-- Run as the caller so the underlying project and version RLS also applies.
create function public.compor_private_image_path_authorized(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[1-9][0-9]{0,9}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]png$'
    and split_part(p_name, '/', 1) = (select auth.uid())::text
    and exists (
      select 1 from public.projects p join public.piece_versions v on v.project_id = p.id
      where p.owner_id = (select auth.uid())
        and p.id::text = split_part(p_name, '/', 2)
        and v.piece_id::text = split_part(p_name, '/', 3)
        and v.version::text = split_part(p_name, '/', 4)
    ), false
  );
$$;
revoke all on function public.compor_private_image_path_authorized(text) from public, anon, authenticated;
-- PostgreSQL checks function EXECUTE at planning time even if CASE skips it for
-- another bucket. Invoker security and underlying table grants/RLS still apply.
grant execute on function public.compor_private_image_path_authorized(text) to public;

create policy compor_project_images_read on storage.objects for select to authenticated
  using (bucket_id = 'compor-project-images' and public.compor_private_image_path_authorized(name));
create policy compor_project_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'compor-project-images' and public.compor_private_image_path_authorized(name));

-- RESTRICTIVE policies are ANDed with all applicable permissive policies. CASE
-- keeps unrelated buckets independent of the helper and its table privileges.
-- Only the expected authenticated role can access this bucket via RLS; roles
-- bypassing RLS or owning storage.objects remain outside this protection.
create policy compor_project_images_read_guard on storage.objects as restrictive for select to public
  using (case when bucket_id <> 'compor-project-images' then true
    when current_user <> 'authenticated' then false
    else public.compor_private_image_path_authorized(name) end);
create policy compor_project_images_insert_guard on storage.objects as restrictive for insert to public
  with check (case when bucket_id <> 'compor-project-images' then true
    when current_user <> 'authenticated' then false
    else public.compor_private_image_path_authorized(name) end);
create policy compor_project_images_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'compor-project-images') with check (bucket_id <> 'compor-project-images');
create policy compor_project_images_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id <> 'compor-project-images');
