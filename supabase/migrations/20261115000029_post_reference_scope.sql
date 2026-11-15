-- Scope is an association with a locally created post UUID, not an authorization proof.
-- Existing identity, project ownership, RLS and source validation remain authoritative.
alter table public.reference_signals add column piece_id uuid;
alter table public.generated_image_signals add column piece_id uuid;
grant insert(piece_id) on public.reference_signals to authenticated;
grant insert(piece_id) on public.generated_image_signals to authenticated;
create index reference_signals_scope_time on public.reference_signals(owner_id,project_id,piece_id,created_at desc,id desc);
create index generated_image_signals_scope_time on public.generated_image_signals(owner_id,project_id,piece_id,created_at desc,id desc);

-- A correction cannot suppress a choice made in another post or in the project.
create function public.check_reference_signal_scope() returns trigger
language plpgsql security invoker set search_path='' as $$
declare previous_piece uuid;
begin
  if new.supersedes is null then return new; end if;
  if tg_table_name='reference_signals' then
    select piece_id into previous_piece from public.reference_signals where id=new.supersedes and owner_id=(select auth.uid()) and project_id=new.project_id;
  else
    select piece_id into previous_piece from public.generated_image_signals where id=new.supersedes and owner_id=(select auth.uid()) and project_id=new.project_id;
  end if;
  if not found or previous_piece is distinct from new.piece_id then raise exception 'invalid_correction_scope' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.check_reference_signal_scope() from public,anon,authenticated;
create trigger reference_signal_scope before insert on public.reference_signals for each row execute function public.check_reference_signal_scope();
create trigger generated_signal_scope before insert on public.generated_image_signals for each row execute function public.check_reference_signal_scope();

-- First approval credits only sources submitted in the version's frozen snapshot.
-- Local choices become account history only when linked to an explicitly approved version.
create or replace function public.approve_piece_version_with_references(p_project_id uuid,p_piece_id uuid,p_version integer,p_expected_revision integer,p_references jsonb)
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
            where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.origin_url=source->>'originUrl' and (s.piece_id is null or s.piece_id=p_piece_id) and s.action in ('selected','rejected')
            and not exists(select 1 from public.reference_signals correction where correction.supersedes=s.id)
            order by (s.piece_id=p_piece_id) desc nulls last,s.created_at desc,s.id desc limit 1;
          if chosen_action='selected' and chosen_board=source->>'board' then pins:=array_append(pins,chosen); end if;
        elsif (source->>'projectId')::uuid=p_project_id then
          select s.id,s.action into chosen,chosen_action from public.generated_image_signals s
            join public.exploration_images e on e.id=s.image_id and e.owner_id=(select auth.uid()) and e.project_id=p_project_id and e.state='completed'
            where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.image_id=(source->>'imageId')::uuid and (s.piece_id is null or s.piece_id=p_piece_id) and s.action in ('selected','rejected')
            and not exists(select 1 from public.generated_image_signals correction where correction.supersedes=s.id)
            order by (s.piece_id=p_piece_id) desc nulls last,s.created_at desc,s.id desc limit 1;
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
create or replace function public.list_reference_history(p_project_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=(select auth.uid())) then
    raise exception 'not_found' using errcode='42501';
  end if;
  with positive_choices as (
    select distinct on(s.origin_url) s.origin_url,s.board,s.created_at from public.reference_signals s
    where s.owner_id=(select auth.uid()) and s.action='selected' and (s.piece_id is null or exists(select 1 from public.piece_version_reference_links scoped_link join public.piece_version_metadata scoped_version on scoped_version.project_id=scoped_link.project_id and scoped_version.piece_id=scoped_link.piece_id and scoped_version.version=scoped_link.version where scoped_link.reference_signal_id=s.id and scoped_link.owner_id=(select auth.uid()) and scoped_version.approval_state='explicit'))
    order by s.origin_url,s.created_at desc,s.id desc
  ), selected_data as (
    -- A shared selection may reuse a local pin without carrying its metadata.
    -- The shared choice (or an explicit approval) makes the origin eligible;
    -- metadata can then come from another selected signal owned by this account.
    select distinct on(s.origin_url) s.* from public.reference_signals s
    join positive_choices positive on positive.origin_url=s.origin_url and positive.board=s.board
    where s.owner_id=(select auth.uid()) and s.action='selected' and s.reference_data is not null
    order by s.origin_url,
      exists(select 1 from public.piece_version_reference_links scoped_link
        join public.piece_version_metadata scoped_version on scoped_version.project_id=scoped_link.project_id and scoped_version.piece_id=scoped_link.piece_id and scoped_version.version=scoped_link.version
        where scoped_link.reference_signal_id=s.id and scoped_link.owner_id=(select auth.uid()) and scoped_version.approval_state='explicit') desc,
      (s.piece_id is null) desc,s.created_at desc,s.id desc
  ), current_choices as (
    select distinct on(s.origin_url) s.origin_url,s.action from public.reference_signals s
    where s.owner_id=(select auth.uid()) and s.project_id=p_project_id and s.piece_id is null and s.action in ('selected','rejected')
      and not exists(select 1 from public.reference_signals correction where correction.supersedes=s.id)
    order by s.origin_url,s.created_at desc,s.id desc
  ), ranked as (
    select data.reference_data,positive.created_at,
      (select count(distinct (l.project_id,l.piece_id,l.version))::integer
       from public.piece_version_reference_links l
       join public.reference_signals selected on selected.id=l.reference_signal_id and selected.owner_id=(select auth.uid())
       join public.piece_version_metadata m on m.project_id=l.project_id and m.piece_id=l.piece_id and m.version=l.version
       where l.owner_id=(select auth.uid()) and selected.origin_url=data.origin_url and selected.board=data.board and m.approval_state='explicit') as approvals
    from selected_data data join positive_choices positive on positive.origin_url=data.origin_url
    where not exists(select 1 from current_choices c where c.origin_url=data.origin_url and c.action='rejected')
    order by approvals desc,positive.created_at desc,data.origin_url limit 100
  ) select coalesce(jsonb_agg(reference_data||jsonb_build_object('approvedVersions',approvals,'selectedAt',created_at)
    order by approvals desc,created_at desc,reference_data->>'originUrl'),'[]'::jsonb) into result from ranked;
  return result;
end $$;
revoke all on function public.list_reference_history(uuid) from public,anon,authenticated;
grant execute on function public.list_reference_history(uuid) to authenticated;
