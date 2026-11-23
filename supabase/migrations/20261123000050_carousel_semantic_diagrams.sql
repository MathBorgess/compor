-- Validate semantic diagrams and the closing demonstration in saved compositions.
create or replace function public.compor_carousel_version_content_valid(p_content jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $function$
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
      'listItems','source','accentPhrase','figure','bridge','artSha256']='{}'::jsonb
      and slide->>'layout' in ('hero_bleed','split_horizontal','split_vertical','framed_plate','stat_monument','svg_diagram',
        'comparison_dual','bento_grid','artifact_proof','typo_breather','native_serial','cta_closing')
      and public.compor_carousel_slot_text_valid(slide->'alt',350)
      and (not slide ? 'artSha256' or (
        jsonb_typeof(slide->'artSha256')='string' and slide->>'artSha256' ~ '^[a-f0-9]{64}$'
        and not slide ? 'diagram' and slide->>'layout'<>'cta_closing'))
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
        elsif diagram_kind in ('contrast','type_scale','hierarchy','category_split','orientation') then
          if slide->>'layout' not in ('split_horizontal','framed_plate','svg_diagram','comparison_dual','cta_closing')
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
          elsif diagram_kind='category_split' then
            if diagram-array['type','labels','items']<>'{}'::jsonb
              or jsonb_typeof(diagram->'items') is distinct from 'array' then return false; end if;
            if jsonb_array_length(diagram->'items')<>2
              or (select count(distinct lower(normalize(value#>>'{}')))<>2 from jsonb_array_elements(diagram->'labels') v(value))
              or (select count(distinct lower(normalize(value#>>'{}')))<>2 from jsonb_array_elements(diagram->'items') v(value))
            then return false; end if;
          elsif diagram_kind='orientation' then
            if diagram-array['type','labels','sample']<>'{}'::jsonb
              or diagram->'labels'<>'["Em pé","De cabeça para baixo"]'::jsonb
            then return false; end if;
          elsif diagram-array['type','labels','sample']<>'{}'::jsonb
            or not public.compor_carousel_slot_text_valid(diagram->'sample',18)
          then return false; end if;
          if diagram_kind in ('category_split','orientation') and exists (
            select 1 from (
              select value, 30 as max_length, 3 as max_words from jsonb_array_elements(diagram->'labels') v(value)
              where diagram_kind='category_split'
              union all
              select value, 18, 4 from jsonb_array_elements(diagram->'items') v(value)
              where diagram_kind='category_split'
              union all
              select diagram->'sample', 18, 4 where diagram_kind='orientation'
            ) as slots
            where not public.compor_carousel_slot_text_valid(value,max_length)
              or value#>>'{}'<>btrim(value#>>'{}') or strpos(value#>>'{}','  ')>0
              or normalize(value#>>'{}') !~ U&'^[[:alnum:]][[:alnum:]\0300-\036f .,!?:%+×–—’''/-]*$'
              or (select count(*) from regexp_matches(normalize(value#>>'{}'),
                $word$[[:digit:]]+([.,][[:digit:]]+)+[[:alnum:]]*|[[:alnum:]]+([.’'][[:alnum:]]+)*$word$,'g'))>max_words
          ) then return false; end if;
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
end $function$;
