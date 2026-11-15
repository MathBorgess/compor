-- Logical removal from the web project list. Preserve provenance, images and pending receipts.
alter table public.projects add column deleted_at timestamptz;
create function public.delete_project_from_list(p_project_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype;
begin
  if p_project_id is null or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>2147483646 then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  select * into project from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if project.deleted_at is not null then return jsonb_build_object('status','deleted','projectId',project.id); end if;
  if project.revision<>p_expected_revision then return jsonb_build_object('status','conflict','currentRevision',project.revision); end if;
  update public.projects set deleted_at=now(),revision=revision+1 where id=project.id;
  return jsonb_build_object('status','deleted','projectId',project.id);
end $$;
revoke all on function public.delete_project_from_list(uuid,integer) from public,anon,authenticated;
grant execute on function public.delete_project_from_list(uuid,integer) to authenticated;
