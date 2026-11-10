-- Additive: old clients and save_piece_version_v2 keep their exact contract.
alter table public.piece_version_metadata add column changed_dimension text check(changed_dimension in ('style','composition','hook'));
alter table public.piece_version_metadata add column operation text check(operation in ('create','edit'));
alter table public.piece_version_metadata add constraint variant_requires_operation check(changed_dimension is null or operation is not null);

create function public.save_piece_version_v3(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_base_version integer,p_content jsonb,p_operation text,p_changed_dimension text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; meta public.piece_version_metadata%rowtype; saved_version integer;
begin
  if (p_operation is not null and p_operation not in ('create','edit'))
    or (p_changed_dimension is not null and (p_changed_dimension not in ('style','composition','hook') or p_operation is null)) then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  result:=public.save_piece_version_v2(p_project_id,p_piece_id,p_expected_version,p_base_version,p_content);
  if result->>'status'<>'saved' then return result; end if;
  saved_version:=(result#>>'{version,version}')::integer;
  update public.piece_version_metadata set operation=p_operation,changed_dimension=p_changed_dimension,
    approval_state=case when p_changed_dimension is not null then 'unapproved' else approval_state end,
    approval_origin_version=case when p_changed_dimension is not null then null else approval_origin_version end,
    approved_by=case when p_changed_dimension is not null then null else approved_by end,
    approved_at=case when p_changed_dimension is not null then null else approved_at end
    where project_id=p_project_id and piece_id=p_piece_id and version=saved_version returning * into meta;
  return jsonb_set(result,'{version,metadata}',public.compor_version_metadata_json(meta.base_version,meta.revision,meta.approval_state,meta.approval_origin_version,meta.approved_at)
    ||jsonb_build_object('changedDimension',meta.changed_dimension,'operation',meta.operation));
end $$;
revoke all on function public.save_piece_version_v3(uuid,uuid,integer,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_piece_version_v3(uuid,uuid,integer,integer,jsonb,text,text) to authenticated;

create function public.list_project_piece_versions_v3(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare versions jsonb; result jsonb;
begin
  versions:=public.list_project_piece_versions_v2(p_project_id);
  select coalesce(jsonb_agg(jsonb_set(item.value,'{metadata}',(item.value->'metadata')||jsonb_build_object('changedDimension',m.changed_dimension,'operation',m.operation)) order by item.position),'[]'::jsonb)
    into result from jsonb_array_elements(versions) with ordinality item(value,position)
    left join public.piece_version_metadata m on m.project_id=p_project_id and m.piece_id=(item.value->>'piece_id')::uuid and m.version=(item.value->>'version')::integer;
  return result;
end $$;
revoke all on function public.list_project_piece_versions_v3(uuid) from public,anon,authenticated;
grant execute on function public.list_project_piece_versions_v3(uuid) to authenticated;
