-- Optional post format, visual invariants and ordered frames for multi-image posts (carousel/collection) and 9:16 stories.
-- Additive: legacy versions without format/frames and existing grants/RLS remain unchanged.
create or replace function public.save_piece_version_v2(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_base_version integer,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer; saved public.piece_versions%rowtype; base_meta public.piece_version_metadata%rowtype; meta public.piece_version_metadata%rowtype;
begin
  if p_project_id is null or p_piece_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646
    or p_base_version is null or p_base_version < 0 or p_base_version > p_expected_version or (p_expected_version > 0 and p_base_version=0)
    or not coalesce(jsonb_typeof(p_content)='object'
      and p_content ?& array['headline','price','date','caption','captionOrigin']
      and p_content-array['headline','price','date','caption','captionOrigin','fields','format','visualInvariants','frames']='{}'::jsonb
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
      where not coalesce(jsonb_typeof(value)='object'
        and value ?& array['id','label','value','origin']
        and value-array['id','label','value','origin']='{}'::jsonb
        and jsonb_typeof(value->'id')='string' and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(value->'label')='string' and length(value->>'label') between 1 and 80
        and value->>'label' ~ '[^[:space:]]' and value->>'label' !~ '[[:cntrl:]]' and value->>'label' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'value')='string' and length(value->>'value') <= 500
        and value->>'value' !~ '[[:cntrl:]]' and value->>'value' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'origin')='string' and value->>'origin' in ('user','agent'),false)
    ) or (select count(*) <> count(distinct lower(value->>'id')) from jsonb_array_elements(p_content->'fields') as item(value))
    then raise exception 'invalid_request' using errcode='22023'; end if;
  end if;

  if p_content ? 'frames' then
    if jsonb_array_length(p_content->'frames') not between 2 and 10 then raise exception 'invalid_request' using errcode='22023'; end if;
    if exists (
      select 1 from jsonb_array_elements(p_content->'frames') as item(value)
      where not coalesce(jsonb_typeof(value)='object'
        and value ?& array['id','position','role','headline','body','visualCue','assetId']
        and value-array['id','position','role','headline','body','visualCue','assetId']='{}'::jsonb
        and jsonb_typeof(value->'id')='string' and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(value->'position')='number' and (value->>'position') ~ '^[1-9][0-9]?$'
        and (value->>'position')::integer between 1 and jsonb_array_length(p_content->'frames')
        and jsonb_typeof(value->'role')='string' and length(value->>'role') <= 80
        and value->>'role' !~ '[[:cntrl:]]' and value->>'role' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'headline')='string' and length(value->>'headline') <= 500
        and value->>'headline' !~ E'[\\x00-\\x09\\x0b-\\x1f\\x7f]' and value->>'headline' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'body')='string' and length(value->>'body') <= 1000
        and value->>'body' !~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' and value->>'body' !~* 'sk-[^[:space:]]+'
        and jsonb_typeof(value->'visualCue')='string' and length(value->>'visualCue') <= 500
        and value->>'visualCue' !~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' and value->>'visualCue' !~* 'sk-[^[:space:]]+'
        and (jsonb_typeof(value->'assetId')='null' or (jsonb_typeof(value->'assetId')='string' and value->>'assetId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),false)
    ) or (select count(*) <> count(distinct lower(value->>'id')) from jsonb_array_elements(p_content->'frames') as item(value))
      or (select count(*) <> count(distinct (value->>'position')::integer) from jsonb_array_elements(p_content->'frames') as item(value))
    then raise exception 'invalid_request' using errcode='22023'; end if;
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
