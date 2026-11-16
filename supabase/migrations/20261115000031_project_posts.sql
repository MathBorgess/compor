-- Web post catalog. Deletion preserves all version/image/attempt provenance.
create table public.project_posts (
  project_id uuid not null references public.projects(id),
  piece_id uuid not null,
  name text not null default '' check (char_length(name)<=200 and name !~ '[[:cntrl:]]'),
  deleted_at timestamptz,
  primary key(project_id,piece_id)
);
alter table public.project_posts enable row level security;
create policy project_posts_owner_read on public.project_posts for select to authenticated using (
  exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()) and p.deleted_at is null)
);
revoke all on public.project_posts from public,anon,authenticated;
grant select on public.project_posts to authenticated;

create function public.list_project_posts(p_project_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('projectId',project_id,'pieceId',piece_id,'name',name,'deleted',deleted_at is not null) order by piece_id),'[]'::jsonb)
  from public.project_posts where project_id=p_project_id;
$$;

create function public.create_project_post(p_project_id uuid,p_piece_id uuid,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.project_posts%rowtype;
begin
  if p_piece_id is null or p_name is null or char_length(btrim(p_name)) not between 1 and 200 or p_name ~ '[[:cntrl:]]' then raise exception 'invalid_request' using errcode='22023'; end if;
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) and deleted_at is null for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  insert into public.project_posts(project_id,piece_id,name) values(p_project_id,p_piece_id,btrim(p_name)) on conflict do nothing;
  select * into item from public.project_posts where project_id=p_project_id and piece_id=p_piece_id for update;
  if item.deleted_at is not null then return jsonb_build_object('status','not_found'); end if;
  if item.name<>btrim(p_name) then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','created','post',jsonb_build_object('projectId',item.project_id,'pieceId',item.piece_id,'name',item.name,'deleted',false));
end $$;

create function public.delete_project_post(p_project_id uuid,p_piece_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.project_posts%rowtype;
begin
  if p_piece_id is null then raise exception 'invalid_request' using errcode='22023'; end if;
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) and deleted_at is null for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  insert into public.project_posts(project_id,piece_id,deleted_at) values(p_project_id,p_piece_id,now()) on conflict(project_id,piece_id) do update set deleted_at=coalesce(public.project_posts.deleted_at,excluded.deleted_at);
  select * into item from public.project_posts where project_id=p_project_id and piece_id=p_piece_id;
  return jsonb_build_object('status','deleted','post',jsonb_build_object('projectId',item.project_id,'pieceId',item.piece_id,'name',item.name,'deleted',true));
end $$;
revoke all on function public.list_project_posts(uuid),public.create_project_post(uuid,uuid,text),public.delete_project_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_project_posts(uuid),public.create_project_post(uuid,uuid,text),public.delete_project_post(uuid,uuid) to authenticated;
