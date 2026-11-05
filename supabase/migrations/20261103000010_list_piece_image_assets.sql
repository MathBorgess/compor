-- Proposed only: test with real Storage RLS and grants in an isolated project.
-- No Storage object is inserted, updated or deleted by this invoker function.
create function public.list_piece_image_assets(p_project_id uuid,p_piece_id uuid,p_version integer,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_prefix text; v_ids uuid[];
begin
 if v_owner is null or p_project_id is null or p_piece_id is null or p_version is null or p_version<1 then
   raise exception 'images unavailable' using errcode='42501';
 end if;
 -- Verify authorization even when the Storage prefix contains no objects.
 if not exists(select 1 from public.projects p join public.piece_versions v on v.project_id=p.id
   where p.id=p_project_id and p.owner_id=v_owner and v.piece_id=p_piece_id and v.version=p_version) then
   return jsonb_build_object('error','not_found');
 end if;
 v_prefix:=v_owner::text||'/'||p_project_id::text||'/'||p_piece_id::text||'/'||p_version::text||'/';
 select coalesce(array_agg(page.asset_id order by page.asset_id),array[]::uuid[]) into v_ids from (
   select q.asset_id from (
     select case when split_part(o.name,'/',5) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]png$'
       then substring(split_part(o.name,'/',5),1,36)::uuid else null end as asset_id
     from storage.objects o
     where o.bucket_id='compor-project-images' and o.name like v_prefix||'%'
       and public.compor_private_image_path_authorized(o.name)
   ) q where q.asset_id is not null and (p_after is null or q.asset_id>p_after)
   order by q.asset_id limit 51
 ) page;
 return jsonb_build_object('assets',to_jsonb(coalesce(v_ids[1:50],array[]::uuid[])),
   'nextCursor',case when coalesce(array_length(v_ids,1),0)>50 then v_ids[50] else null end);
end $$;
revoke all on function public.list_piece_image_assets(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.list_piece_image_assets(uuid,uuid,integer,uuid) to authenticated;
