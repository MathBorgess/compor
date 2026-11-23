-- Governed composition metadata and a separate MIME-restricted JPEG bucket.
create function public.compor_carousel_slot_text_valid(p_value jsonb,p_limit integer)
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(p_value)='string' and length(p_value#>>'{}') between 1 and p_limit
    and p_value#>>'{}' ~ '[^[:space:]]' and p_value#>>'{}' !~ '[[:cntrl:]]'
    and p_value#>>'{}' !~* 'sk-[^[:space:]]+',false);
$$;
revoke all on function public.compor_carousel_slot_text_valid(jsonb,integer) from public, anon, authenticated;

-- Use the same compact, key-sorted JSON as carouselPlanJson in the renderer.
-- Governed plans have fixed ASCII keys and contain only strings, arrays and objects.
create function public.compor_carousel_canonical_json(p_value jsonb)
returns text language plpgsql immutable strict security invoker set search_path='' as $$
begin
  case jsonb_typeof(p_value)
    when 'object' then
      return (select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||
        public.compor_carousel_canonical_json(value),',' order by key collate "C"),'')||'}'
        from jsonb_each(p_value));
    when 'array' then
      return (select '['||coalesce(string_agg(public.compor_carousel_canonical_json(value),',' order by position),'')||']'
        from jsonb_array_elements(p_value) with ordinality entry(value,position));
    else return p_value::text;
  end case;
end $$;
revoke all on function public.compor_carousel_canonical_json(jsonb) from public, anon, authenticated;

create function public.compor_carousel_version_content_valid(p_content jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare
  plan jsonb := p_content->'carouselPlan';
  receipt jsonb := p_content->'carouselRender';
  frame jsonb;
  slide jsonb;
  diagram jsonb;
  diagram_kind text;
  panel jsonb;
  render_slides jsonb := '[]'::jsonb;
  canonical_plan text;
  entry record;
  position integer;
begin
  if plan is null then return receipt is null; end if;
  if jsonb_typeof(plan) is distinct from 'object' then return false; end if;
  if not coalesce(p_content->>'format'='carousel' and jsonb_typeof(p_content->'frames')='array'
    and plan-array['mode','tokens','slides']='{}'::jsonb
    and plan->>'mode' in ('editorial_art','native_serial') and jsonb_typeof(plan->'slides')='array'
    and octet_length(plan::text)<=32768,false) then return false; end if;
  if jsonb_array_length(plan->'slides') not between 3 and 10
    or jsonb_array_length(p_content->'frames')<>jsonb_array_length(plan->'slides') then return false; end if;
  if plan ? 'tokens' then
    if jsonb_typeof(plan->'tokens')<>'object' or plan->'tokens'='{}'::jsonb then return false; end if;
    if exists (select 1 from jsonb_each(plan->'tokens') v(key,value)
      where key not in ('light','dark','accent') or jsonb_typeof(value)<>'string' or value#>>'{}' !~* '^#[0-9a-f]{6}$')
    then return false; end if;
  end if;
  if receipt is not null then
    if jsonb_typeof(receipt) is distinct from 'object' then return false; end if;
    if not coalesce(receipt-array['planSha256','frames']='{}'::jsonb
      and jsonb_typeof(receipt->'planSha256')='string'
      and receipt->>'planSha256' ~ '^[a-f0-9]{64}$' and jsonb_typeof(receipt->'frames')='array',false)
    then return false; end if;
    if jsonb_array_length(receipt->'frames')<>jsonb_array_length(plan->'slides') then return false; end if;
  end if;
  for frame in select value from jsonb_array_elements(p_content->'frames') order by (value->>'position')::integer loop
    select value into slide from jsonb_array_elements(plan->'slides') where value->>'frameId'=frame->>'id';
    if jsonb_typeof(slide) is distinct from 'object' then return false; end if;
    if not coalesce(slide-array['frameId','layout','alt','polarity','diagram','kicker',
      'listItems','source','accentPhrase','figure','bridge']='{}'::jsonb
      and slide->>'layout' in ('hero_bleed','split_horizontal','split_vertical','framed_plate','stat_monument','svg_diagram',
        'comparison_dual','bento_grid','artifact_proof','typo_breather','native_serial','cta_closing')
      and public.compor_carousel_slot_text_valid(slide->'alt',350)
      and (not slide ? 'polarity' or slide->>'polarity' in ('base','inverted'))
      and (not slide ? 'bridge' or slide->>'bridge' in ('hairline_thread','color_band_echo')),false)
    then return false; end if;
    for entry in select * from (values ('kicker',80),('source',110),('accentPhrase',70),('figure',18)) bounds(key,limit_length)
    loop
      if slide ? entry.key and not public.compor_carousel_slot_text_valid(slide->entry.key,entry.limit_length)
      then return false; end if;
    end loop;
    if (slide->>'layout'='stat_monument' and not slide ?& array['figure','source'])
      or (slide->>'layout'='svg_diagram' and not slide ? 'diagram')
      or (slide ? 'accentPhrase' and strpos(frame->>'headline',slide->>'accentPhrase')=0)
    then return false; end if;
    if slide ? 'listItems' then
      if jsonb_typeof(slide->'listItems')<>'array' then return false; end if;
      if jsonb_array_length(slide->'listItems') not between 1 and
        (case when slide->>'layout'='bento_grid' then 4 else 7 end)
        or exists (select 1 from jsonb_array_elements(slide->'listItems') v(value)
          where not public.compor_carousel_slot_text_valid(value,90))
      then return false; end if;
    end if;
    if slide ? 'diagram' then
      diagram := slide->'diagram';
      if jsonb_typeof(diagram)='string' then
        if diagram#>>'{}' not in ('flow','balance','steps','focus') then return false; end if;
      elsif jsonb_typeof(diagram)='object' then
        diagram_kind := diagram->>'type';
        if diagram_kind is null or jsonb_typeof(diagram->'labels') is distinct from 'array' then return false; end if;
        if exists (select 1 from jsonb_array_elements(diagram->'labels') v(value)
          where not public.compor_carousel_slot_text_valid(value,30)) then return false; end if;
        if diagram_kind in ('flow','balance','steps','focus') then
          if diagram-array['type','labels']<>'{}'::jsonb
            or jsonb_array_length(diagram->'labels') not between 1 and 3 then return false; end if;
        elsif diagram_kind in ('contrast','type_scale','hierarchy') then
          if slide->>'layout' not in ('split_horizontal','framed_plate','svg_diagram','comparison_dual')
            or jsonb_array_length(diagram->'labels')<>2
            or (select count(distinct lower(value#>>'{}'))<>2 from jsonb_array_elements(diagram->'labels') v(value))
          then return false; end if;
          if diagram_kind='hierarchy' then
            if diagram-array['type','labels','items']<>'{}'::jsonb
              or jsonb_typeof(diagram->'items') is distinct from 'array' then return false; end if;
            if jsonb_array_length(diagram->'items')<>3 or exists (
              select 1 from jsonb_array_elements(diagram->'items') v(value)
              where not public.compor_carousel_slot_text_valid(value,10)
            ) or (select count(distinct lower(value#>>'{}'))<>3 from jsonb_array_elements(diagram->'items') v(value))
            then return false; end if;
          elsif diagram-array['type','labels','sample']<>'{}'::jsonb
            or not public.compor_carousel_slot_text_valid(diagram->'sample',18)
          then return false; end if;
        else return false;
        end if;
      else return false;
      end if;
    end if;
    if receipt is null then
      if frame->>'assetId' is not null then return false; end if;
    else
      position := (frame->>'position')::integer;
      panel := receipt->'frames'->(position-1);
      if jsonb_typeof(panel) is distinct from 'object' then return false; end if;
      if not coalesce(panel-array['frameId','sha256','alt']='{}'::jsonb
        and panel->>'frameId'=frame->>'id' and panel->'alt'=slide->'alt' and jsonb_typeof(panel->'sha256')='string'
        and panel->>'sha256' ~ '^[a-f0-9]{64}$'
        and frame->>'assetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
      then return false; end if;
      render_slides := render_slides||jsonb_build_array((slide-'frameId')
        ||jsonb_build_object('id',frame->>'id','headline',frame->>'headline')
        ||case when frame->>'body'<>'' then jsonb_build_object('body',frame->>'body') else '{}'::jsonb end);
    end if;
  end loop;
  if receipt is null then return true; end if;
  if (select count(*)<>count(distinct lower(value->>'assetId'))
    from jsonb_array_elements(p_content->'frames')) then return false; end if;

  -- This digest catches a stale receipt. The caller supplies both sides, so
  -- matching it does not authenticate a generation or validate stored bytes.
  canonical_plan := public.compor_carousel_canonical_json((plan-'slides')
    ||jsonb_build_object('slides',render_slides,'caption',p_content->>'caption'));
  return receipt->>'planSha256'=encode(sha256(convert_to(canonical_plan,'UTF8')),'hex');
end $$;
revoke all on function public.compor_carousel_version_content_valid(jsonb) from public, anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('compor-carousel-jpegs','compor-carousel-jpegs',false,4194304,array['image/jpeg']);

create function public.compor_carousel_jpeg_path_authorized(p_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[1-9][0-9]{0,9}/[0-9a-f-]{36}[.]jpg$'
    and split_part(p_name,'/',1)=(select auth.uid())::text
    and exists (
      select 1 from public.projects p join public.piece_versions v on v.project_id=p.id
      where p.owner_id=(select auth.uid()) and p.id::text=split_part(p_name,'/',2)
        and v.piece_id::text=split_part(p_name,'/',3) and v.version::text=split_part(p_name,'/',4)
        and v.content->>'format'='carousel' and jsonb_typeof(v.content->'carouselRender')='object'
        and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v.content->'frames')='array'
          then v.content->'frames' else '[]'::jsonb end) f(value)
          where lower(f.value->>'assetId')||'.jpg'=split_part(p_name,'/',5))
    ),false);
$$;
revoke all on function public.compor_carousel_jpeg_path_authorized(text) from public, anon, authenticated;
grant execute on function public.compor_carousel_jpeg_path_authorized(text) to public;
create policy compor_carousel_jpegs_read on storage.objects for select to authenticated
  using (bucket_id='compor-carousel-jpegs' and public.compor_carousel_jpeg_path_authorized(name));
create policy compor_carousel_jpegs_insert on storage.objects for insert to authenticated
  with check (bucket_id='compor-carousel-jpegs' and public.compor_carousel_jpeg_path_authorized(name));
create policy compor_carousel_jpegs_read_guard on storage.objects as restrictive for select to public
  using (case when bucket_id<>'compor-carousel-jpegs' then true
    when current_user<>'authenticated' then false else public.compor_carousel_jpeg_path_authorized(name) end);
create policy compor_carousel_jpegs_insert_guard on storage.objects as restrictive for insert to public
  with check (case when bucket_id<>'compor-carousel-jpegs' then true
    when current_user<>'authenticated' then false else public.compor_carousel_jpeg_path_authorized(name) end);
create policy compor_carousel_jpegs_update_guard on storage.objects as restrictive for update to public
  using (bucket_id<>'compor-carousel-jpegs') with check (bucket_id<>'compor-carousel-jpegs');
create policy compor_carousel_jpegs_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id<>'compor-carousel-jpegs');

create or replace function public.save_piece_version_v2(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_base_version integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer; saved public.piece_versions%rowtype; base_meta public.piece_version_metadata%rowtype; meta public.piece_version_metadata%rowtype;
begin
  if jsonb_typeof(p_content) is distinct from 'object' then raise exception 'invalid_request' using errcode='22023'; end if;
  if p_project_id is null or p_piece_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646
    or p_base_version is null or p_base_version < 0 or p_base_version > p_expected_version or (p_expected_version > 0 and p_base_version=0)
    or not coalesce(jsonb_typeof(p_content)='object'
      and p_content ?& array['headline','price','date','caption','captionOrigin']
      and p_content-array['headline','price','date','caption','captionOrigin','fields','format','visualInvariants','frames','carouselPlan','carouselRender']='{}'::jsonb
      and jsonb_typeof(p_content->'headline')='string' and length(p_content->>'headline')<=500
      and jsonb_typeof(p_content->'price')='string' and length(p_content->>'price')<=100
      and jsonb_typeof(p_content->'date')='string' and length(p_content->>'date')<=100
      and jsonb_typeof(p_content->'caption')='string' and length(p_content->>'caption')<=4000
      and jsonb_typeof(p_content->'captionOrigin')='string' and p_content->>'captionOrigin' in ('user','agent')
      and (not p_content ? 'fields' or jsonb_typeof(p_content->'fields')='array')
      and (not p_content ? 'format' or (jsonb_typeof(p_content->'format')='string' and p_content->>'format' in ('single','carousel','collection','story')))
      and (not p_content ? 'visualInvariants' or (jsonb_typeof(p_content->'visualInvariants')='string' and length(p_content->>'visualInvariants')<=1000 and p_content->>'visualInvariants' !~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' and p_content->>'visualInvariants' !~* 'sk-[^[:space:]]+'))
      and (not p_content ? 'frames' or (jsonb_typeof(p_content->'frames')='array' and p_content->>'format' in ('carousel','collection'))),false)
  then raise exception 'invalid_request' using errcode='22023'; end if;

  if p_content ? 'fields' then
    if jsonb_array_length(p_content->'fields') > 20 then raise exception 'invalid_request' using errcode='22023'; end if;
    if exists (
      select 1 from jsonb_array_elements(p_content->'fields') as item(value)
      where case when jsonb_typeof(value) is distinct from 'object' then true else not coalesce(
        value ?& array['id','label','value','origin']
        and value-array['id','label','value','origin']='{}'::jsonb
        and jsonb_typeof(value->'id')='string' and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(value->'label')='string' and length(value->>'label') between 1 and 80
        and value->>'label' ~ '[^[:space:]]' and value->>'label' !~ '[[:cntrl:]]' and value->>'label' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'value')='string' and length(value->>'value') <= 500
        and value->>'value' !~ '[[:cntrl:]]' and value->>'value' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'origin')='string' and value->>'origin' in ('user','agent'),false) end
    ) or (select count(*) <> count(distinct lower(value->>'id')) from jsonb_array_elements(p_content->'fields') as item(value))
    then raise exception 'invalid_request' using errcode='22023'; end if;
  end if;

  if p_content ? 'frames' then
    if jsonb_array_length(p_content->'frames') not between 2 and 10 then raise exception 'invalid_request' using errcode='22023'; end if;
    if exists (
      select 1 from jsonb_array_elements(p_content->'frames') as item(value)
      where case when jsonb_typeof(value) is distinct from 'object' then true else not coalesce(
        value ?& array['id','position','role','headline','body','visualCue','assetId']
        and value-array['id','position','role','headline','body','visualCue','assetId']='{}'::jsonb
        and jsonb_typeof(value->'id')='string' and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and case when jsonb_typeof(value->'position')='number' and value->>'position' ~ '^[1-9][0-9]?$'
          then (value->>'position')::integer between 1 and jsonb_array_length(p_content->'frames') else false end
        and jsonb_typeof(value->'role')='string' and length(value->>'role') <= 80
        and value->>'role' !~ '[[:cntrl:]]' and value->>'role' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'headline')='string' and length(value->>'headline') <= 500
        and value->>'headline' !~ E'[\\x00-\\x09\\x0b-\\x1f\\x7f]' and value->>'headline' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'body')='string' and length(value->>'body') <= 1000
        and value->>'body' !~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' and value->>'body' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'visualCue')='string' and length(value->>'visualCue') <= 500
        and value->>'visualCue' !~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' and value->>'visualCue' !~* 'sk-[^[:space:]]+'
        and (jsonb_typeof(value->'assetId')='null' or (jsonb_typeof(value->'assetId')='string' and value->>'assetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),false) end
    ) or (select count(*) <> count(distinct lower(value->>'id')) from jsonb_array_elements(p_content->'frames') as item(value))
      or (select count(*) <> count(distinct value->>'position') from jsonb_array_elements(p_content->'frames') as item(value))
    then raise exception 'invalid_request' using errcode='22023'; end if;
  end if;

  if not public.compor_carousel_version_content_valid(p_content) then
    raise exception 'invalid_request' using errcode='22023';
  end if;

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
