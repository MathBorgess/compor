-- Content remains immutable. Only version lineage and approval have separate metadata.
alter table public.projects add column revision integer not null default 1 check (revision > 0);

create table public.piece_version_metadata (
  project_id uuid not null,
  piece_id uuid not null,
  version integer not null,
  base_version integer,
  approval_state text not null default 'unapproved' check (approval_state in ('unapproved','explicit','inherited')),
  approval_origin_version integer,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  primary key (project_id,piece_id,version),
  foreign key (project_id,piece_id,version) references public.piece_versions(project_id,piece_id,version),
  foreign key (project_id,piece_id,base_version) references public.piece_versions(project_id,piece_id,version),
  foreign key (project_id,piece_id,approval_origin_version) references public.piece_versions(project_id,piece_id,version),
  check (base_version is null or (base_version > 0 and base_version < version)),
  check ((approval_state='unapproved' and approval_origin_version is null and approved_by is null and approved_at is null)
    or (approval_state='explicit' and approval_origin_version is not null and approval_origin_version=version and approved_by is not null and approved_at is not null)
    or (approval_state='inherited' and approval_origin_version is not null and approval_origin_version > 0 and approval_origin_version < version and approved_by is not null and approved_at is not null))
);
alter table public.piece_version_metadata enable row level security;
revoke all on public.piece_version_metadata from public,anon,authenticated;
grant select on public.piece_version_metadata to authenticated;
create policy piece_version_metadata_select_owner on public.piece_version_metadata for select to authenticated using (
  exists (select 1 from public.projects p where p.id=piece_version_metadata.project_id and p.owner_id=(select auth.uid()))
);

create function public.compor_version_metadata_json(p_base integer,p_revision integer,p_state text,p_origin integer,p_at timestamptz)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('baseVersion',p_base,'revision',coalesce(p_revision,0),
    'approval',jsonb_build_object('status',case when coalesce(p_state,'unapproved')='unapproved' then 'unapproved' else 'approved' end,
      'kind',case when p_state in ('explicit','inherited') then p_state else null end,
      'sourceVersion',p_origin,'at',p_at));
$$;
revoke all on function public.compor_version_metadata_json(integer,integer,text,integer,timestamptz) from public,anon,authenticated;

create function public.save_piece_version_v2(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_base_version integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer; saved public.piece_versions%rowtype; base_meta public.piece_version_metadata%rowtype; meta public.piece_version_metadata%rowtype;
begin
  if p_project_id is null or p_piece_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646
    or p_base_version is null or p_base_version < 0 or p_base_version > p_expected_version or (p_expected_version > 0 and p_base_version=0)
    or not coalesce(jsonb_typeof(p_content)='object'
      and p_content ?& array['headline','price','date','caption','captionOrigin']
      and p_content-array['headline','price','date','caption','captionOrigin']='{}'::jsonb
      and jsonb_typeof(p_content->'headline')='string' and length(p_content->>'headline')<=500
      and jsonb_typeof(p_content->'price')='string' and length(p_content->>'price')<=100
      and jsonb_typeof(p_content->'date')='string' and length(p_content->>'date')<=100
      and jsonb_typeof(p_content->'caption')='string' and length(p_content->>'caption')<=4000
      and jsonb_typeof(p_content->'captionOrigin')='string' and p_content->>'captionOrigin' in ('user','agent'),false)
  then raise exception 'invalid_request' using errcode='22023'; end if;
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select coalesce(max(version),0) into current_version from public.piece_versions where project_id=p_project_id and piece_id=p_piece_id;
  if current_version<>p_expected_version then return jsonb_build_object('status','conflict','currentVersion',current_version); end if;
  if p_base_version>0 then
    perform 1 from public.piece_versions where project_id=p_project_id and piece_id=p_piece_id and version=p_base_version;
    if not found then return jsonb_build_object('status','not_found'); end if;
    select * into base_meta from public.piece_version_metadata where project_id=p_project_id and piece_id=p_piece_id and version=p_base_version;
  end if;
  insert into public.piece_versions(project_id,piece_id,version,content) values(p_project_id,p_piece_id,current_version+1,p_content) returning * into saved;
  insert into public.piece_version_metadata(project_id,piece_id,version,base_version,approval_state,approval_origin_version,approved_by,approved_at)
    values(p_project_id,p_piece_id,saved.version,nullif(p_base_version,0),
      case when base_meta.approval_state in ('explicit','inherited') then 'inherited' else 'unapproved' end,
      base_meta.approval_origin_version,base_meta.approved_by,base_meta.approved_at) returning * into meta;
  return jsonb_build_object('status','saved','version',to_jsonb(saved)||jsonb_build_object('metadata',public.compor_version_metadata_json(meta.base_version,meta.revision,meta.approval_state,meta.approval_origin_version,meta.approved_at)));
end $$;
revoke all on function public.save_piece_version_v2(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_piece_version_v2(uuid,uuid,integer,integer,jsonb) to authenticated;

-- Preserve the old signature and JSON response for existing MCP clients.
create or replace function public.save_piece_version(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.save_piece_version_v2(p_project_id,p_piece_id,p_expected_version,p_expected_version,p_content);
  return result #- array['version','metadata'];
end $$;
revoke all on function public.save_piece_version(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_piece_version(uuid,uuid,integer,jsonb) to authenticated;

create function public.approve_piece_version(p_project_id uuid,p_piece_id uuid,p_version integer,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare meta public.piece_version_metadata%rowtype; saved public.piece_versions%rowtype; current_revision integer;
begin
  if p_project_id is null or p_piece_id is null or p_version is null or p_version<1 or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>2147483646 then raise exception 'invalid_request' using errcode='22023'; end if;
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into saved from public.piece_versions where project_id=p_project_id and piece_id=p_piece_id and version=p_version;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into meta from public.piece_version_metadata where project_id=p_project_id and piece_id=p_piece_id and version=p_version;
  current_revision:=coalesce(meta.revision,0);
  if current_revision<>p_expected_revision then return jsonb_build_object('status','conflict','currentRevision',current_revision); end if;
  insert into public.piece_version_metadata(project_id,piece_id,version,base_version,approval_state,approval_origin_version,approved_by,approved_at,revision)
    values(p_project_id,p_piece_id,p_version,meta.base_version,'explicit',p_version,(select auth.uid()),now(),current_revision+1)
    on conflict(project_id,piece_id,version) do update set approval_state='explicit',approval_origin_version=excluded.version,approved_by=excluded.approved_by,approved_at=excluded.approved_at,revision=excluded.revision
    returning * into meta;
  return jsonb_build_object('status','approved','version',to_jsonb(saved)||jsonb_build_object('metadata',public.compor_version_metadata_json(meta.base_version,meta.revision,meta.approval_state,meta.approval_origin_version,meta.approved_at)));
end $$;
revoke all on function public.approve_piece_version(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.approve_piece_version(uuid,uuid,integer,integer) to authenticated;

create function public.list_project_piece_versions_v2(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=(select auth.uid())) then raise exception 'not_found' using errcode='42501'; end if;
  if (select count(*) from public.piece_versions where project_id=p_project_id)>1000 then raise exception 'too_many_versions' using errcode='54000'; end if;
  select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('metadata',public.compor_version_metadata_json(m.base_version,m.revision,m.approval_state,m.approval_origin_version,m.approved_at)) order by v.created_at,v.piece_id,v.version),'[]'::jsonb)
    into result from public.piece_versions v left join public.piece_version_metadata m using(project_id,piece_id,version) where v.project_id=p_project_id;
  return result;
end $$;
revoke all on function public.list_project_piece_versions_v2(uuid) from public,anon,authenticated;
grant execute on function public.list_project_piece_versions_v2(uuid) to authenticated;

create function public.rename_project(p_project_id uuid,p_title text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.projects%rowtype;
begin
  if p_project_id is null or p_title is null or char_length(trim(p_title)) not between 1 and 200 or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>2147483646 then raise exception 'invalid_request' using errcode='22023'; end if;
  select * into saved from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if saved.revision<>p_expected_revision then return jsonb_build_object('status','conflict','currentRevision',saved.revision); end if;
  update public.projects set title=trim(p_title),revision=revision+1 where id=p_project_id returning * into saved;
  return jsonb_build_object('status','renamed','project',jsonb_build_object('id',saved.id,'title',saved.title,'created_at',saved.created_at,'revision',saved.revision));
end $$;
revoke all on function public.rename_project(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rename_project(uuid,text,integer) to authenticated;
