-- Selection authority is recorded explicitly, never imported from taste signals.
-- Every mutation/admission uses the existing account advisory lock (seed 0).
create table public.reference_selection_mirrors (
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  revision bigint not null check(revision between 1 and 9007199254740991),
  state jsonb not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,project_id)
);
create table public.reference_selection_commands (
  owner_id uuid not null references auth.users(id),
  command_id uuid not null,
  project_id uuid not null references public.projects(id),
  input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
  revision bigint not null check(revision between 1 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,command_id)
);
create table public.reference_consent_sessions (
  owner_id uuid not null references auth.users(id),
  consent_id uuid not null,
  auth_session_id uuid not null,
  proof_digest text check(proof_digest ~ '^[a-f0-9]{64}$'),
  state text not null check(state in ('active','revoked')),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(owner_id,consent_id),
  check(state='revoked' or proof_digest is not null)
);
create table public.reference_authority_snapshots (
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  project_id uuid not null references public.projects(id),
  piece_id uuid,
  batch_id uuid,
  purpose text not null check(purpose in ('parallel','replacement','artwork')),
  selection_revision bigint not null check(selection_revision between 0 and 9007199254740991),
  manifest_digest text not null check(manifest_digest ~ '^[a-f0-9]{64}$'),
  entries jsonb not null,
  consent_id uuid,
  auth_session_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,request_id),
  check((purpose='artwork' and batch_id is null) or (purpose<>'artwork' and batch_id is not null))
);
alter table public.reference_selection_mirrors enable row level security;
alter table public.reference_selection_commands enable row level security;
alter table public.reference_consent_sessions enable row level security;
alter table public.reference_authority_snapshots enable row level security;
revoke all on public.reference_selection_mirrors,public.reference_selection_commands,public.reference_consent_sessions,public.reference_authority_snapshots from public,anon,authenticated;

-- Only claims in the JWT accepted by PostgREST are used here. The HTTP layer
-- also calls getUser(token); an unverified decoded browser JWT is never enough.
-- No dependency on refresh token contents and no arbitrary consent TTL.
create function public.current_reference_session() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_claim jsonb:=auth.jwt(); v_session uuid;
begin
  if auth.uid() is null or coalesce(v_claim->>'session_id','') !~ '^[a-f0-9-]{36}$'
    or coalesce(v_claim->>'exp','') !~ '^[0-9]{1,12}$' then return null; end if;
  v_session:=(v_claim->>'session_id')::uuid;
  if (v_claim->>'exp')::numeric<=extract(epoch from statement_timestamp()) then return null; end if;
  if not exists(select 1 from auth.sessions s where s.id=v_session and s.user_id=auth.uid()
    and (s.not_after is null or s.not_after>statement_timestamp())) then return null; end if;
  return v_session;
exception when invalid_text_representation then return null;
end $$;

create function public.reference_uuid_array(p_value jsonb,p_max integer) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value)>p_max then return false; end if;
  return not exists(select 1 from jsonb_array_elements(p_value) x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    and (select count(*)=count(distinct x) from jsonb_array_elements(p_value) x);
end $$;

-- Derive provenance projection in SQL. Accepting a separately declared digest
-- and generated image ID would let a direct RPC caller mix different sources.
create function public.reference_source_record(p_entry jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v_origin text:=p_entry->>'inputOrigin';v_source jsonb:=p_entry->'source';v_canonical text;v_image uuid;v_digest text;
begin
 if jsonb_typeof(p_entry) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_entry) k)<>array['id','inputOrigin','source'] then raise exception 'invalid source' using errcode='22023';end if;
 if v_origin='local-upload' then
  if v_source is distinct from 'null'::jsonb then raise exception 'invalid source' using errcode='22023';end if;v_canonical:='null';
 elsif v_origin='external' then
  if jsonb_typeof(v_source) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(v_source) k)<>array['board','originUrl']
    or coalesce(v_source->>'originUrl','') !~ '^https://www[.]pinterest[.]com/pin/[A-Za-z0-9_-]{1,160}/$'
    or coalesce(v_source->>'board','') !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$' or length(v_source->>'board')>200
    or (v_source::text) ~* 'sk-' then raise exception 'invalid source' using errcode='22023';end if;
  v_canonical:='{"originUrl":'||(v_source->'originUrl')::text||',"board":'||(v_source->'board')::text||'}';
 elsif v_origin='generated' then
  if jsonb_typeof(v_source) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(v_source) k)<>array['imageId','projectId']
    or coalesce(v_source->>'projectId','') !~ '^[a-f0-9-]{36}$' or coalesce(v_source->>'imageId','') !~ '^[a-f0-9-]{36}$' then raise exception 'invalid source' using errcode='22023';end if;
  perform (v_source->>'projectId')::uuid;v_image:=(v_source->>'imageId')::uuid;
  v_canonical:='{"projectId":'||(v_source->'projectId')::text||',"imageId":'||(v_source->'imageId')::text||'}';
 else raise exception 'invalid source' using errcode='22023';end if;
 v_digest:=encode(sha256(convert_to('compor-reference-source-v1','UTF8')||decode('00','hex')||convert_to('{"inputOrigin":'||to_jsonb(v_origin)::text||',"source":'||v_canonical||'}','UTF8')),'hex');
 return jsonb_build_object('id',p_entry->'id','inputOrigin',v_origin,'sourceDigest',v_digest,'generatedImageId',v_image);
end $$;

create function public.reference_selection_valid(p_owner uuid,p_project uuid,p_state jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_item jsonb; v_ids jsonb; v_piece uuid;
begin
  if jsonb_typeof(p_state) is distinct from 'object' or p_state->'version' is distinct from '1'::jsonb
    or (select array_agg(k order by k) from jsonb_object_keys(p_state) k)<>array['posts','projectReferenceIds','references','version']
    or jsonb_typeof(p_state->'references') is distinct from 'array' or jsonb_array_length(p_state->'references')>500
    or jsonb_typeof(p_state->'posts') is distinct from 'array' or jsonb_array_length(p_state->'posts')>500
    or not public.reference_uuid_array(p_state->'projectReferenceIds',20) then return false; end if;
  v_ids:=coalesce((select jsonb_agg(x->'id') from jsonb_array_elements(p_state->'references') x),'[]'::jsonb);
  if not public.reference_uuid_array(v_ids,500) then return false; end if;
  for v_item in select value from jsonb_array_elements(p_state->'references') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(v_item) k)<>array['generatedImageId','id','inputOrigin','sourceDigest']
      or coalesce(v_item->>'inputOrigin','') not in ('local-upload','external','generated')
      or coalesce(v_item->>'sourceDigest','') !~ '^[a-f0-9]{64}$' then return false; end if;
    if v_item->>'inputOrigin'='generated' then
      if coalesce(v_item->>'generatedImageId','') !~ '^[a-f0-9-]{36}$' then return false; end if;
      if not exists(select 1 from public.exploration_images e where e.id=(v_item->>'generatedImageId')::uuid and e.owner_id=p_owner and e.project_id=p_project and e.state='completed') then return false; end if;
    elsif v_item->'generatedImageId' is distinct from 'null'::jsonb then return false; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'projectReferenceIds') x where not v_ids @> jsonb_build_array(x)) then return false; end if;
  if not public.reference_uuid_array(coalesce((select jsonb_agg(x->'pieceId') from jsonb_array_elements(p_state->'posts') x),'[]'::jsonb),500) then return false; end if;
  for v_item in select value from jsonb_array_elements(p_state->'posts') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(v_item) k)<>array['excludedReferenceIds','pieceId','referenceIds']
      or not public.reference_uuid_array(v_item->'referenceIds',20) or not public.reference_uuid_array(v_item->'excludedReferenceIds',20) then return false; end if;
    v_piece:=(v_item->>'pieceId')::uuid;
    if not exists(select 1 from public.project_posts where project_id=p_project and piece_id=v_piece and deleted_at is null) then return false; end if;
    if exists(select 1 from jsonb_array_elements((v_item->'referenceIds')||(v_item->'excludedReferenceIds')) x where not v_ids @> jsonb_build_array(x)) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation then return false;
end $$;

create function public.reference_public_state(p_state jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_set(p_state,'{references}',coalesce((select jsonb_agg(x-'generatedImageId' order by n) from jsonb_array_elements(p_state->'references') with ordinality t(x,n)),'[]'::jsonb));
$$;
create function public.get_reference_selection(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_row public.reference_selection_mirrors%rowtype;
begin
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) then return null; end if;
  select * into v_row from public.reference_selection_mirrors where owner_id=auth.uid() and project_id=p_project_id;
  return jsonb_build_object('status','ready','revision',coalesce(v_row.revision,0),'state',public.reference_public_state(coalesce(v_row.state,'{"version":1,"references":[],"projectReferenceIds":[],"posts":[]}'::jsonb)));
end $$;
create function public.write_reference_selection(p_project_id uuid,p_command_id uuid,p_expected_revision bigint,p_state jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_revision bigint; v_digest text; v_command public.reference_selection_commands%rowtype;v_state jsonb;
begin
  if v_owner is null or p_command_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991 then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_object('revision',p_expected_revision,'state',p_state)::text,'UTF8')),'hex');
  select * into v_command from public.reference_selection_commands where owner_id=v_owner and command_id=p_command_id;
  if found then
    if v_command.project_id<>p_project_id or v_command.input_digest<>v_digest then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','existing','commandId',p_command_id,'revision',v_command.revision);
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null) then return jsonb_build_object('status','not_found'); end if;
  if public.current_reference_session() is null then return jsonb_build_object('status','unavailable'); end if;
  select revision into v_revision from public.reference_selection_mirrors where owner_id=v_owner and project_id=p_project_id;
  if coalesce(v_revision,0)<>p_expected_revision then return jsonb_build_object('status','conflict','revision',coalesce(v_revision,0)); end if;
  begin
   if exists(select 1 from jsonb_array_elements(p_state->'references') x where x->>'inputOrigin'='generated' and x->'source'->>'projectId'<>p_project_id::text) then return jsonb_build_object('status','invalid');end if;
   v_state:=jsonb_set(p_state,'{references}',coalesce((select jsonb_agg(public.reference_source_record(x) order by n) from jsonb_array_elements(p_state->'references') with ordinality t(x,n)),'[]'::jsonb));
  exception when invalid_parameter_value or invalid_text_representation then return jsonb_build_object('status','invalid');end;
  if not public.reference_selection_valid(v_owner,p_project_id,v_state) then return jsonb_build_object('status','invalid'); end if;
  v_revision:=p_expected_revision+1;
  insert into public.reference_selection_mirrors(owner_id,project_id,revision,state) values(v_owner,p_project_id,v_revision,v_state)
    on conflict(owner_id,project_id) do update set revision=excluded.revision,state=excluded.state,updated_at=clock_timestamp();
  insert into public.reference_selection_commands(owner_id,command_id,project_id,input_digest,revision) values(v_owner,p_command_id,p_project_id,v_digest,v_revision);
  return jsonb_build_object('status','applied','commandId',p_command_id,'revision',v_revision);
end $$;
create function public.get_reference_selection_command(p_project_id uuid,p_command_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status','applied','commandId',c.command_id,'revision',c.revision)
 from public.reference_selection_commands c join public.projects p on p.id=c.project_id
 where c.owner_id=auth.uid() and p.owner_id=auth.uid() and c.project_id=p_project_id and c.command_id=p_command_id;
$$;

create function public.grant_reference_consent(p_consent_id uuid,p_proof_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_session uuid; v_row public.reference_consent_sessions%rowtype;
begin
  if v_owner is null or p_consent_id is null or p_proof_digest is null or p_proof_digest !~ '^[a-f0-9]{64}$' then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  v_session:=public.current_reference_session();if v_session is null then return jsonb_build_object('status','unavailable'); end if;
  select * into v_row from public.reference_consent_sessions where owner_id=v_owner and consent_id=p_consent_id;
  if found then return jsonb_build_object('status',case when v_row.state='revoked' or v_row.auth_session_id<>v_session then 'revoked' else 'existing' end,'consentId',p_consent_id); end if;
  insert into public.reference_consent_sessions(owner_id,consent_id,auth_session_id,proof_digest,state) values(v_owner,p_consent_id,v_session,p_proof_digest,'active');
  return jsonb_build_object('status','granted','consentId',p_consent_id);
end $$;
create function public.revoke_reference_consent(p_consent_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_session uuid;
begin
  if v_owner is null or p_consent_id is null then raise exception 'invalid request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  v_session:=public.current_reference_session();if v_session is null then return jsonb_build_object('status','unavailable'); end if;
  insert into public.reference_consent_sessions(owner_id,consent_id,auth_session_id,state,revoked_at) values(v_owner,p_consent_id,v_session,'revoked',clock_timestamp())
    on conflict(owner_id,consent_id) do update set state='revoked',proof_digest=null,revoked_at=coalesce(reference_consent_sessions.revoked_at,excluded.revoked_at);
  return jsonb_build_object('status','revoked','consentId',p_consent_id);
end $$;
create function public.get_reference_consent(p_consent_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_row public.reference_consent_sessions%rowtype;
begin
  select * into v_row from public.reference_consent_sessions where owner_id=auth.uid() and consent_id=p_consent_id;
  return jsonb_build_object('consentId',p_consent_id,'state',case when not found then 'absent' when v_row.state='revoked' or v_row.auth_session_id is distinct from public.current_reference_session() then 'revoked' else 'active' end);
end $$;
create function public.reference_consent_valid(p_owner uuid,p_session uuid,p_consent uuid,p_secret text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then return false; end if;
 return exists(select 1 from public.reference_consent_sessions where owner_id=p_owner and consent_id=p_consent and auth_session_id=p_session and state='active' and proof_digest=encode(sha256(decode(p_secret,'hex')),'hex'));
end;
$$;
create function public.reference_effective_entries(p_state jsonb,p_piece uuid) returns jsonb
language sql immutable set search_path='' as $$
 with post as (select x from jsonb_array_elements(p_state->'posts') x where x->>'pieceId'=p_piece::text)
 select coalesce(jsonb_agg(x-'generatedImageId' order by n),'[]'::jsonb)
 from jsonb_array_elements(p_state->'references') with ordinality t(x,n)
 where ((p_state->'projectReferenceIds') @> jsonb_build_array(x->'id') and not coalesce((select x->'excludedReferenceIds' from post) @> jsonb_build_array(x->'id'),false))
   or coalesce((select x->'referenceIds' from post) @> jsonb_build_array(x->'id'),false);
$$;
create function public.reference_snapshot_record(p_row public.reference_authority_snapshots) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('requestId',p_row.request_id,'projectId',p_row.project_id,'conversationId',coalesce(p_row.piece_id::text,'references'),'batchId',p_row.batch_id,'purpose',p_row.purpose,'selectionRevision',p_row.selection_revision,'manifestDigest',p_row.manifest_digest,'consentId',p_row.consent_id);
$$;
create function public.reference_selected_sources_valid(p_owner uuid,p_project uuid,p_state jsonb,p_entries jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(p_state->'references') x
   where x->>'inputOrigin'='generated' and exists(select 1 from jsonb_array_elements(p_entries) e where e->>'id'=x->>'id')
     and not exists(select 1 from public.exploration_images i where i.id=(x->>'generatedImageId')::uuid and i.owner_id=p_owner and i.project_id=p_project and i.state='completed'));
$$;
create function public.create_reference_snapshot(p_project_id uuid,p_piece_id uuid,p_request_id uuid,p_batch_id uuid,p_purpose text,p_selection_revision bigint,p_manifest_json text,p_consent_id uuid,p_consent_secret text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_session uuid; v_row public.reference_authority_snapshots%rowtype; v_mirror public.reference_selection_mirrors%rowtype; v_external boolean;v_manifest jsonb;v_digest text;v_entries jsonb;
begin
  if v_owner is null or p_request_id is null or p_project_id is null or p_selection_revision is null or p_selection_revision<0 or p_selection_revision>9007199254740991
    or p_manifest_json is null or octet_length(p_manifest_json)>65536 or p_purpose is null or p_purpose not in ('parallel','replacement','artwork')
    or (p_purpose='artwork') is distinct from (p_batch_id is null)
    then raise exception 'invalid request' using errcode='22023'; end if;
  v_manifest:=p_manifest_json::jsonb;
  if v_manifest->>'version' not in ('1','2') or jsonb_typeof(v_manifest->'entries') is distinct from 'array' or jsonb_array_length(v_manifest->'entries')>20 then raise exception 'invalid manifest' using errcode='22023';end if;
  v_entries:=coalesce((select jsonb_agg(public.reference_source_record(jsonb_build_object('id',x->'id','inputOrigin',x->'inputOrigin','source',coalesce(x->'source','null'::jsonb)))-'generatedImageId' order by n) from jsonb_array_elements(v_manifest->'entries') with ordinality t(x,n)),'[]'::jsonb);
  v_digest:=encode(sha256(convert_to('compor-visual-input-v'||(v_manifest->>'version'),'UTF8')||decode('00','hex')||convert_to(p_manifest_json,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner) then return jsonb_build_object('status','not_found'); end if;
  select * into v_row from public.reference_authority_snapshots where owner_id=v_owner and request_id=p_request_id;
  if found then
    if v_row.project_id<>p_project_id or v_row.piece_id is distinct from p_piece_id or v_row.batch_id is distinct from p_batch_id or v_row.purpose<>p_purpose
      or v_row.selection_revision<>p_selection_revision or v_row.manifest_digest<>v_digest or v_row.entries<>v_entries or v_row.consent_id is distinct from p_consent_id
      then return jsonb_build_object('status','conflict'); end if;
    return jsonb_build_object('status','existing','snapshot',public.reference_snapshot_record(v_row));
  end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null))
    then return jsonb_build_object('status','not_found'); end if;
  v_session:=public.current_reference_session();if v_session is null then return jsonb_build_object('status','unavailable'); end if;
  select * into v_mirror from public.reference_selection_mirrors where owner_id=v_owner and project_id=p_project_id;
  if not found or v_mirror.revision<>p_selection_revision then return jsonb_build_object('status','conflict'); end if;
  if public.reference_effective_entries(v_mirror.state,p_piece_id)<>v_entries or not public.reference_selected_sources_valid(v_owner,p_project_id,v_mirror.state,v_entries) then return jsonb_build_object('status','conflict'); end if;
  v_external:=exists(select 1 from jsonb_array_elements(v_entries) x where x->>'inputOrigin'='external');
  if (v_external and not public.reference_consent_valid(v_owner,v_session,p_consent_id,p_consent_secret)) or (not v_external and p_consent_id is not null) then return jsonb_build_object('status','unauthorized'); end if;
  insert into public.reference_authority_snapshots(owner_id,request_id,project_id,piece_id,batch_id,purpose,selection_revision,manifest_digest,entries,consent_id,auth_session_id)
    values(v_owner,p_request_id,p_project_id,p_piece_id,p_batch_id,p_purpose,p_selection_revision,v_digest,v_entries,p_consent_id,v_session) returning * into v_row;
  return jsonb_build_object('status','created','snapshot',public.reference_snapshot_record(v_row));
end $$;
create function public.get_reference_snapshot(p_project_id uuid,p_request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.reference_snapshot_record(s) from public.reference_authority_snapshots s join public.projects p on p.id=s.project_id
 where s.owner_id=auth.uid() and p.owner_id=auth.uid() and s.project_id=p_project_id and s.request_id=p_request_id;
$$;
-- Call inside a paid reservation transaction; this lock remains held until that
-- transaction commits. The same RPC can be used again immediately before POST.
create function public.check_reference_authority(p_project_id uuid,p_piece_id uuid,p_request_id uuid,p_batch_id uuid,p_purpose text,p_manifest_digest text,p_consent_secret text) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_session uuid; v_row public.reference_authority_snapshots%rowtype; v_mirror public.reference_selection_mirrors%rowtype;
begin
  if v_owner is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text,0));
  v_session:=public.current_reference_session();if v_session is null then return false; end if;
  if not exists(select 1 from public.projects where id=p_project_id and owner_id=v_owner and deleted_at is null)
    or (p_piece_id is not null and not exists(select 1 from public.project_posts where project_id=p_project_id and piece_id=p_piece_id and deleted_at is null)) then return false; end if;
  select * into v_row from public.reference_authority_snapshots where owner_id=v_owner and project_id=p_project_id and request_id=p_request_id
    and piece_id is not distinct from p_piece_id and batch_id is not distinct from p_batch_id and purpose=p_purpose and manifest_digest=p_manifest_digest and auth_session_id=v_session;
  if not found then return false; end if;
  select * into v_mirror from public.reference_selection_mirrors where owner_id=v_owner and project_id=p_project_id and revision=v_row.selection_revision;
  if not found or not public.reference_selected_sources_valid(v_owner,p_project_id,v_mirror.state,v_row.entries) or public.reference_effective_entries(v_mirror.state,p_piece_id)<>v_row.entries then return false; end if;
  return v_row.consent_id is null or public.reference_consent_valid(v_owner,v_session,v_row.consent_id,p_consent_secret);
end $$;

revoke all on function public.current_reference_session(),public.reference_uuid_array(jsonb,integer),public.reference_source_record(jsonb),public.reference_selection_valid(uuid,uuid,jsonb),public.reference_public_state(jsonb),public.reference_consent_valid(uuid,uuid,uuid,text),public.reference_effective_entries(jsonb,uuid),public.reference_snapshot_record(public.reference_authority_snapshots),public.reference_selected_sources_valid(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.get_reference_selection(uuid),public.write_reference_selection(uuid,uuid,bigint,jsonb),public.get_reference_selection_command(uuid,uuid),public.grant_reference_consent(uuid,text),public.revoke_reference_consent(uuid),public.get_reference_consent(uuid),public.create_reference_snapshot(uuid,uuid,uuid,uuid,text,bigint,text,uuid,text),public.get_reference_snapshot(uuid,uuid),public.check_reference_authority(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_reference_selection(uuid),public.write_reference_selection(uuid,uuid,bigint,jsonb),public.get_reference_selection_command(uuid,uuid),public.grant_reference_consent(uuid,text),public.revoke_reference_consent(uuid),public.get_reference_consent(uuid),public.create_reference_snapshot(uuid,uuid,uuid,uuid,text,bigint,text,uuid,text),public.get_reference_snapshot(uuid,uuid),public.check_reference_authority(uuid,uuid,uuid,uuid,text,text,text) to authenticated;

-- Additive admission wrappers. Historical/MCP operations retain their existing
-- contract; web effects with visual authority must call these wrappers. Reads
-- and already-created receipts never require renewed consent to reconcile.
create function public.reserve_exploration_plan_authorized(p_project_id uuid,p_piece_id uuid,p_batch_id uuid,p_request_id uuid,p_input_digest text,p_completion_digest text,p_intent_id uuid,p_intent_secret text,p_manifest_digest text,p_consent_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.exploration_planning_attempts where owner_id=auth.uid() and project_id=p_project_id and request_id=p_request_id)
   and not public.check_reference_authority(p_project_id,p_piece_id,p_request_id,p_batch_id,'parallel',p_manifest_digest,p_consent_secret) then return jsonb_build_object('status','conflict'); end if;
 return public.reserve_exploration_plan(p_project_id,p_piece_id,p_batch_id,p_request_id,p_input_digest,p_completion_digest,p_intent_id,p_intent_secret);
end $$;
create function public.reserve_exploration_batch_authorized(p_project_id uuid,p_batch_id uuid,p_piece_id uuid,p_plan_digest text,p_image_ids uuid[],p_prompt_digests text[],p_rejection_digests text[],p_intent_id uuid,p_intent_secret text,p_authority_request_id uuid,p_manifest_digest text,p_consent_secret text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.exploration_batches where owner_id=auth.uid() and project_id=p_project_id and id=p_batch_id)
   and not public.check_reference_authority(p_project_id,p_piece_id,p_authority_request_id,p_batch_id,'parallel',p_manifest_digest,p_consent_secret) then return query select 'revoked'::text,false;return;end if;
 return query select * from public.reserve_exploration_batch_proven(p_project_id,p_batch_id,p_piece_id,p_plan_digest,p_image_ids,p_prompt_digests,p_rejection_digests,p_intent_id,p_intent_secret);
end $$;
create function public.replace_exploration_slot_authorized(p_project_id uuid,p_batch_id uuid,p_position integer,p_previous_id uuid,p_id uuid,p_prompt_digest text,p_rejection_digest text,p_intent_id uuid,p_intent_secret text,p_manifest_digest text,p_consent_secret text)
returns table(state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_piece uuid;
begin
 if auth.uid() is null then raise exception 'unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select piece_id into v_piece from public.exploration_batches where owner_id=auth.uid() and project_id=p_project_id and id=p_batch_id;
 if not exists(select 1 from public.exploration_images where owner_id=auth.uid() and project_id=p_project_id and id=p_id)
   and not public.check_reference_authority(p_project_id,v_piece,p_id,p_batch_id,'replacement',p_manifest_digest,p_consent_secret) then return query select 'revoked'::text,false;return;end if;
 return query select * from public.replace_rejected_exploration_batch_slot_proven(p_project_id,p_batch_id,p_position,p_previous_id,p_id,p_prompt_digest,p_rejection_digest,p_intent_id,p_intent_secret);
end $$;
create function public.reserve_studio_turn_authorized(p_project_id uuid,p_request_id uuid,p_input_digest text,p_piece_id uuid,p_manifest_digest text,p_consent_secret text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.studio_turns where owner_id=auth.uid() and project_id=p_project_id and request_id=p_request_id)
   and not public.check_reference_authority(p_project_id,p_piece_id,p_request_id,null,'artwork',p_manifest_digest,p_consent_secret) then return jsonb_build_object('status','conflict');end if;
 return public.reserve_studio_turn(p_project_id,p_request_id,p_input_digest);
end $$;
create function public.claim_image_tool_execution_authorized(p_reservation_id uuid,p_authority_request_id uuid,p_manifest_digest text,p_consent_secret text)
returns table(execution_id uuid,asset_id uuid,state text,is_new boolean) language plpgsql security definer set search_path='' as $$
declare v_project uuid; v_piece uuid;
begin
 if auth.uid() is null then raise exception 'unavailable' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select project_id,piece_id into v_project,v_piece from public.image_tool_reservations where owner_id=auth.uid() and id=p_reservation_id;
 if not found then raise exception 'unavailable' using errcode='42501';end if;
 if not exists(select 1 from public.studio_turns t join public.image_tool_reservations r on r.agent_attempt_id=t.attempt_id and r.project_id=t.project_id and r.owner_id=t.owner_id where r.id=p_reservation_id and t.owner_id=auth.uid() and t.request_id=p_authority_request_id) then raise exception 'unavailable' using errcode='42501';end if;
 if not exists(select 1 from public.image_tool_executions where owner_id=auth.uid() and reservation_id=p_reservation_id)
   and not public.check_reference_authority(v_project,v_piece,p_authority_request_id,null,'artwork',p_manifest_digest,p_consent_secret) then return query select null::uuid,null::uuid,'blocked'::text,false;return;end if;
 return query select * from public.claim_image_tool_execution(p_reservation_id);
end $$;
revoke all on function public.reserve_exploration_plan_authorized(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text),public.reserve_exploration_batch_authorized(uuid,uuid,uuid,text,uuid[],text[],text[],uuid,text,uuid,text,text),public.replace_exploration_slot_authorized(uuid,uuid,integer,uuid,uuid,text,text,uuid,text,text,text),public.reserve_studio_turn_authorized(uuid,uuid,text,uuid,text,text),public.claim_image_tool_execution_authorized(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_exploration_plan_authorized(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text),public.reserve_exploration_batch_authorized(uuid,uuid,uuid,text,uuid[],text[],text[],uuid,text,uuid,text,text),public.replace_exploration_slot_authorized(uuid,uuid,integer,uuid,uuid,text,text,uuid,text,text,text),public.reserve_studio_turn_authorized(uuid,uuid,text,uuid,text,text),public.claim_image_tool_execution_authorized(uuid,uuid,text,text) to authenticated;

-- Check both revocable authorities in one observation; separate RPCs would
-- create an avoidable await window between source consent and intent checks.
create function public.check_reference_exploration_dispatch(p_project_id uuid,p_piece_id uuid,p_request_id uuid,p_batch_id uuid,p_purpose text,p_manifest_digest text,p_consent_secret text,p_intent_id uuid,p_intent_epoch bigint,p_intent_state text default 'consumed')
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_purpose is null or p_purpose not in ('parallel','replacement') or p_intent_state is null or p_intent_state not in ('active','consumed') or (p_intent_state='active' and p_purpose<>'parallel') then return false;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 if not public.check_reference_authority(p_project_id,p_piece_id,p_request_id,p_batch_id,p_purpose,p_manifest_digest,p_consent_secret) then return false;end if;
 return exists(select 1 from public.exploration_intents i join public.exploration_intent_epochs e on e.owner_id=i.owner_id and e.epoch=i.epoch
   where i.owner_id=auth.uid() and i.id=p_intent_id and i.epoch=p_intent_epoch and i.project_id=p_project_id and i.piece_id is not distinct from p_piece_id and i.batch_id=p_batch_id and i.state=p_intent_state
     and i.purpose=case when p_purpose='parallel' then 'batch' else 'replacement' end);
end $$;
revoke all on function public.check_reference_exploration_dispatch(uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.check_reference_exploration_dispatch(uuid,uuid,uuid,uuid,text,text,text,uuid,bigint,text) to authenticated;
