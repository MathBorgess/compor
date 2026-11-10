-- Account-only reference history. External images remain at their original host.
alter table public.reference_signals add column reference_data jsonb;
alter table public.reference_signals add constraint reference_signal_metadata check (
  reference_data is null or coalesce(
    action='selected' and jsonb_typeof(reference_data)='object'
    and reference_data ?& array['id','title','board','originUrl','previewUrl']
    and reference_data-array['id','title','board','originUrl','previewUrl']='{}'::jsonb
    and jsonb_typeof(reference_data->'id')='string' and reference_data->>'id' ~ '^[A-Za-z0-9_-]{1,160}$'
    and jsonb_typeof(reference_data->'title')='string' and char_length(trim(reference_data->>'title')) between 1 and 300
    and reference_data->>'board'=board and reference_data->>'originUrl'=origin_url
    and origin_url='https://www.pinterest.com/pin/'||(reference_data->>'id')||'/'
    and jsonb_typeof(reference_data->'previewUrl')='string' and char_length(reference_data->>'previewUrl')<=1000
    and reference_data->>'previewUrl' ~* '^https://i[.]pinimg[.]com/[a-zA-Z0-9_./%-]+[.](jpeg|jpg|png)$',false)
);
grant insert(reference_data) on public.reference_signals to authenticated;

create table public.piece_version_reference_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null,
  piece_id uuid not null,
  version integer not null,
  reference_signal_id uuid references public.reference_signals(id),
  generated_signal_id uuid references public.generated_image_signals(id),
  approved_at timestamptz not null default now(),
  foreign key(project_id,piece_id,version) references public.piece_versions(project_id,piece_id,version),
  check(num_nonnulls(reference_signal_id,generated_signal_id)=1),
  unique(project_id,piece_id,version,reference_signal_id),
  unique(project_id,piece_id,version,generated_signal_id)
);
create index piece_reference_links_owner on public.piece_version_reference_links(owner_id,reference_signal_id);
alter table public.piece_version_reference_links enable row level security;
revoke all on public.piece_version_reference_links from public,anon,authenticated;
grant select on public.piece_version_reference_links to authenticated;
create policy piece_reference_links_select_owner on public.piece_version_reference_links for select to authenticated using (
  owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid()))
);

-- Approval remains authoritative. Learning records only proven positive choices
-- from this project's first explicit approval and never blocks that approval.
create function public.approve_piece_version_with_references(p_project_id uuid,p_piece_id uuid,p_version integer,p_expected_revision integer,p_references jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source jsonb; result jsonb; chosen uuid; chosen_action text; chosen_board text;
  first_approval boolean; pins uuid[]='{}'; generated uuid[]='{}';
begin
  if p_project_id is null or p_piece_id is null or p_version is null or p_version<1 or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>2147483646
    or not coalesce(jsonb_typeof(p_references)='array',false) or jsonb_array_length(p_references)>100 then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  perform 1 from public.projects where id=p_project_id and owner_id=(select auth.uid()) for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  -- Validate the wire contract before changing the principal approval. A source
  -- outside this project cannot contribute a learning link.
  for source in select value from jsonb_array_elements(p_references) loop
    if coalesce(jsonb_typeof(source)='object' and source->>'kind'='pinterest'
      and source ?& array['kind','originUrl','board'] and source-array['kind','originUrl','board']='{}'::jsonb
      and jsonb_typeof(source->'originUrl')='string' and source->>'originUrl' ~ '^https://www[.]pinterest[.]com/pin/[A-Za-z0-9_-]{1,160}/$'
      and char_length(source->>'originUrl')<=300 and jsonb_typeof(source->'board')='string' and char_length(source->>'board') between 1 and 120,false) then
      continue;
    elsif coalesce(jsonb_typeof(source)='object' and source->>'kind'='generated'
      and source ?& array['kind','projectId','imageId'] and source-array['kind','projectId','imageId']='{}'::jsonb
      and jsonb_typeof(source->'projectId')='string' and jsonb_typeof(source->'imageId')='string',false) then
      perform (source->>'projectId')::uuid,(source->>'imageId')::uuid;
    else raise exception 'invalid_reference' using errcode='22023'; end if;
  end loop;
  select not exists(select 1 from public.piece_version_metadata m where m.project_id=p_project_id and m.piece_id=p_piece_id
    and m.version=p_version and m.approval_state='explicit') into first_approval;
  -- Capture IDs before approval. Reapproval cannot give a later selection credit
  -- for an earlier approved version. Comments are neutral; moodboards are not signals.
  if first_approval then
    begin
      for source in select value from jsonb_array_elements(p_references) loop
        chosen:=null; chosen_action:=null; chosen_board:=null;
        if source->>'kind'='pinterest' then
          select s.id,s.action,s.board into chosen,chosen_action,chosen_board from public.reference_signals s
            where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.origin_url=source->>'originUrl' and s.action in ('selected','rejected')
            and not exists(select 1 from public.reference_signals correction where correction.supersedes=s.id)
            order by s.created_at desc,s.id desc limit 1;
          if chosen_action='selected' and chosen_board=source->>'board' then pins:=array_append(pins,chosen); end if;
        elsif (source->>'projectId')::uuid=p_project_id then
          select s.id,s.action into chosen,chosen_action from public.generated_image_signals s
            join public.exploration_images e on e.id=s.image_id and e.owner_id=(select auth.uid()) and e.project_id=p_project_id and e.state='completed'
            where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.image_id=(source->>'imageId')::uuid and s.action in ('selected','rejected')
            and not exists(select 1 from public.generated_image_signals correction where correction.supersedes=s.id)
            order by s.created_at desc,s.id desc limit 1;
          if chosen_action='selected' then generated:=array_append(generated,chosen); end if;
        end if;
      end loop;
    exception when others then pins:='{}'; generated:='{}';
    end;
  end if;
  result:=public.approve_piece_version(p_project_id,p_piece_id,p_version,p_expected_revision);
  if result->>'status'<>'approved' then return result; end if;
  -- Learning failure rolls back this block only. It must not report a confirmed
  -- approval as unknown or leave a partial positive attribution.
  begin
    insert into public.piece_version_reference_links(owner_id,project_id,piece_id,version,reference_signal_id)
      select (select auth.uid()),p_project_id,p_piece_id,p_version,signal from unnest(pins) signal on conflict do nothing;
    insert into public.piece_version_reference_links(owner_id,project_id,piece_id,version,generated_signal_id)
      select (select auth.uid()),p_project_id,p_piece_id,p_version,signal from unnest(generated) signal on conflict do nothing;
  exception when others then null;
  end;
  return result;
end $$;
revoke all on function public.approve_piece_version_with_references(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.approve_piece_version_with_references(uuid,uuid,integer,integer,jsonb) to authenticated;

-- Invoker privileges retain RLS for signals, linked versions and projects.
-- A rejection affects only the current project; past positive selections and
-- real approval links remain factual candidates for this account's other projects.
create function public.list_reference_history(p_project_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=(select auth.uid())) then
    raise exception 'not_found' using errcode='42501';
  end if;
  with selected_data as (
    select distinct on(s.origin_url) s.* from public.reference_signals s
    where s.owner_id=(select auth.uid()) and s.action='selected' and s.reference_data is not null
    order by s.origin_url,s.created_at desc,s.id desc
  ), positive_choices as (
    select distinct on(s.origin_url) s.origin_url,s.created_at from public.reference_signals s
    where s.owner_id=(select auth.uid()) and s.action='selected'
    order by s.origin_url,s.created_at desc,s.id desc
  ), current_choices as (
    select distinct on(s.origin_url) s.origin_url,s.action from public.reference_signals s
    where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.action in ('selected','rejected')
      and not exists(select 1 from public.reference_signals correction where correction.supersedes=s.id)
    order by s.origin_url,s.created_at desc,s.id desc
  ), ranked as (
    select data.reference_data,positive.created_at,
      (select count(distinct (l.project_id,l.piece_id,l.version))::integer
       from public.piece_version_reference_links l
       join public.reference_signals selected on selected.id=l.reference_signal_id and selected.owner_id=(select auth.uid())
       join public.piece_version_metadata m on m.project_id=l.project_id and m.piece_id=l.piece_id and m.version=l.version
       where l.owner_id=(select auth.uid()) and selected.origin_url=data.origin_url and m.approval_state='explicit') as approvals
    from selected_data data join positive_choices positive on positive.origin_url=data.origin_url
    where not exists(select 1 from current_choices c where c.origin_url=data.origin_url and c.action='rejected')
    order by approvals desc,positive.created_at desc,data.origin_url limit 100
  ) select coalesce(jsonb_agg(reference_data||jsonb_build_object('approvedVersions',approvals,'selectedAt',created_at)
    order by approvals desc,created_at desc,reference_data->>'originUrl'),'[]'::jsonb) into result from ranked;
  return result;
end $$;
revoke all on function public.list_reference_history(uuid) from public,anon,authenticated;
grant execute on function public.list_reference_history(uuid) to authenticated;
