-- Validation only: a new, empty, isolated Supabase database. Never use on existing data.
-- Run with psql as a script in a fresh connection; never run in a GUI that ignores psql directives.
-- ON_ERROR_STOP exits on first error; PostgreSQL rolls back the open transaction when the connection closes.
-- Inspect the complete script, migrations, role privileges and database target before any execution.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'refusing non-empty auth.users'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')) THEN
    RAISE EXCEPTION 'refusing a public schema containing tables';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'refusing auth.users triggers that could have external side effects';
  END IF;
END $$;


-- Snapshot 20261103000000_projects.sql SHA256 ad26b2f1f207e2b826c11522f8903ee5d2e7f280637fab3d7c05c987eb117b09
-- Apply only to an isolated Compor Supabase project after review.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(trim(title)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;
grant insert (title) on public.projects to authenticated;

create policy projects_select_owner on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_insert_owner on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);



-- Snapshot 20261103000001_piece_versions.sql SHA256 be5327b6e63b438b749c6b4c56abd38fe55f699a52f5203fa4420ce92b692528
-- Review and validate against an isolated Supabase project before applying.
create table public.piece_versions (
  project_id uuid not null references public.projects(id),
  piece_id uuid not null,
  version integer not null check (version > 0),
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (project_id, piece_id, version)
);

alter table public.piece_versions enable row level security;
revoke all on public.piece_versions from public, anon, authenticated;
grant select on public.piece_versions to authenticated;
create policy piece_versions_select_owner on public.piece_versions
  for select to authenticated using (
    exists (select 1 from public.projects where id = piece_versions.project_id and owner_id = (select auth.uid()))
  );

-- All writes pass through this transaction. A lock on the owned project serializes
-- comparisons and inserts; direct writes remain unavailable to authenticated users.
create function public.save_piece_version(p_project_id uuid, p_piece_id uuid, p_expected_version integer, p_content jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version integer;
  saved public.piece_versions%rowtype;
begin
  if p_project_id is null or p_piece_id is null or p_expected_version is null or p_expected_version < 0 or p_expected_version > 2147483646 or not coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content ?& array['headline', 'price', 'date', 'caption', 'captionOrigin']
    and p_content - array['headline', 'price', 'date', 'caption', 'captionOrigin'] = '{}'::jsonb
    and jsonb_typeof(p_content->'headline') = 'string' and length(p_content->>'headline') <= 500
    and jsonb_typeof(p_content->'price') = 'string' and length(p_content->>'price') <= 100
    and jsonb_typeof(p_content->'date') = 'string' and length(p_content->>'date') <= 100
    and jsonb_typeof(p_content->'caption') = 'string' and length(p_content->>'caption') <= 4000
    and jsonb_typeof(p_content->'captionOrigin') = 'string' and p_content->>'captionOrigin' in ('user', 'agent'), false
  ) then raise exception 'invalid_request' using errcode = '22023'; end if;

  perform 1 from public.projects where id = p_project_id and owner_id = (select auth.uid()) for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(max(version), 0) into current_version from public.piece_versions where project_id = p_project_id and piece_id = p_piece_id;
  if current_version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'currentVersion', current_version);
  end if;
  insert into public.piece_versions (project_id, piece_id, version, content)
    values (p_project_id, p_piece_id, current_version + 1, p_content) returning * into saved;
  return jsonb_build_object('status', 'saved', 'version', to_jsonb(saved));
end;
$$;
revoke all on function public.save_piece_version(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_piece_version(uuid, uuid, integer, jsonb) to authenticated;



-- Snapshot 20261103000002_agent_attempts.sql SHA256 04817a32f79f0099d1f9395c1fed71c47245a980a8a106a5ad35aa6f3e227145
-- Review and exercise against an isolated Supabase project before use.
create table public.agent_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null references public.projects(id),
  idempotency_key uuid not null,
  state text not null default 'started' check (state in ('started', 'completed', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

alter table public.agent_attempts enable row level security;
revoke all on public.agent_attempts from public, anon, authenticated;
grant select on public.agent_attempts to authenticated;
grant insert (project_id, idempotency_key) on public.agent_attempts to authenticated;
grant update (state, updated_at) on public.agent_attempts to authenticated;

create policy agent_attempts_select_owner on public.agent_attempts
  for select to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );
create policy agent_attempts_insert_owner on public.agent_attempts
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );
create policy agent_attempts_update_owner on public.agent_attempts
  for update to authenticated using (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  ) with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create function public.reserve_agent_attempt(p_project_id uuid, p_idempotency_key uuid)
returns table (attempt_id uuid, state text, is_new boolean)
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_state text;
begin
  insert into public.agent_attempts (project_id, idempotency_key)
    values (p_project_id, p_idempotency_key)
    on conflict (owner_id, idempotency_key) do nothing
    returning id into v_id;
  if v_id is not null then
    return query select v_id, 'started'::text, true;
  else
    select a.id, a.state into v_id, v_state from public.agent_attempts a
      where a.owner_id = (select auth.uid()) and a.idempotency_key = p_idempotency_key and a.project_id = p_project_id;
    if v_id is null then raise exception 'attempt unavailable' using errcode = '42501'; end if;
    return query select v_id, v_state, false;
  end if;
end;
$$;

create function public.finish_agent_attempt(p_project_id uuid, p_attempt_id uuid, p_state text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_state not in ('completed', 'unknown') then raise exception 'invalid state' using errcode = '22023'; end if;
  update public.agent_attempts a set state = p_state, updated_at = now()
    where a.id = p_attempt_id and a.project_id = p_project_id and a.owner_id = (select auth.uid()) and a.state = 'started';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'attempt unavailable' using errcode = '42501'; end if;
  return true;
end;
$$;
revoke all on function public.reserve_agent_attempt(uuid, uuid) from public, anon;
revoke all on function public.finish_agent_attempt(uuid, uuid, text) from public, anon;
grant execute on function public.reserve_agent_attempt(uuid, uuid) to authenticated;
grant execute on function public.finish_agent_attempt(uuid, uuid, text) to authenticated;



-- Synthetic users only. Both rows and all migrations disappear on ROLLBACK.
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'compor-alice@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'compor-bob@example.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$ BEGIN
  IF auth.uid() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'alice claims not applied'; END IF;
END $$;
INSERT INTO public.projects (title) VALUES ('compor synthetic alice');
SELECT set_config('compor.test_alice_project', id::text, true) FROM public.projects WHERE title = 'compor synthetic alice';
DO $$
DECLARE
  p uuid := current_setting('compor.test_alice_project')::uuid;
  piece uuid := '33333333-3333-4333-8333-333333333333';
  c jsonb := '{"headline":"A","price":"20","date":"10/12","caption":"Caption","captionOrigin":"user"}';
  r jsonb;
  a record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'alice project ownership'; END IF;
  BEGIN
    INSERT INTO public.projects (title, owner_id) VALUES ('spoof', '22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'authenticated user can supply owner_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r := public.save_piece_version(p, piece, 0, c);
  IF r->>'status' IS DISTINCT FROM 'saved' OR (r->'version'->>'version')::integer <> 1 THEN RAISE EXCEPTION 'first version failed'; END IF;
  r := public.save_piece_version(p, piece, 1, jsonb_set(c, '{headline}', '"B"'));
  IF r->>'status' IS DISTINCT FROM 'saved' OR (r->'version'->>'version')::integer <> 2 THEN RAISE EXCEPTION 'second version failed'; END IF;
  r := public.save_piece_version(p, piece, 1, c);
  IF r->>'status' IS DISTINCT FROM 'conflict' OR (r->>'currentVersion')::integer <> 2 THEN RAISE EXCEPTION 'stale version did not conflict'; END IF;
  IF (SELECT count(*) FROM public.piece_versions WHERE project_id = p AND piece_id = piece) <> 2 THEN RAISE EXCEPTION 'history missing'; END IF;
  IF (SELECT content->>'caption' FROM public.piece_versions WHERE project_id = p AND piece_id = piece AND version = 2) IS DISTINCT FROM 'Caption' THEN RAISE EXCEPTION 'caption not preserved'; END IF;
  BEGIN
    INSERT INTO public.piece_versions (project_id, piece_id, version, content) VALUES (p, piece, 3, c);
    RAISE EXCEPTION 'direct version write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT * INTO a FROM public.reserve_agent_attempt(p, '44444444-4444-4444-8444-444444444444');
  IF a.is_new IS DISTINCT FROM true OR a.state IS DISTINCT FROM 'started' THEN RAISE EXCEPTION 'first attempt not reserved'; END IF;
  PERFORM set_config('compor.test_alice_attempt', a.attempt_id::text, true);
  SELECT * INTO a FROM public.reserve_agent_attempt(p, '44444444-4444-4444-8444-444444444444');
  IF a.is_new IS DISTINCT FROM false OR a.attempt_id IS DISTINCT FROM current_setting('compor.test_alice_attempt')::uuid THEN RAISE EXCEPTION 'duplicate was not deduplicated'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
DO $$
DECLARE
  p uuid := current_setting('compor.test_alice_project')::uuid;
  piece uuid := '33333333-3333-4333-8333-333333333333';
  c jsonb := '{"headline":"B","price":"20","date":"10/12","caption":"Caption","captionOrigin":"user"}';
  r jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM '22222222-2222-4222-8222-222222222222'::uuid THEN RAISE EXCEPTION 'bob claims not applied'; END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = p) THEN RAISE EXCEPTION 'cross-user project read'; END IF;
  IF EXISTS (SELECT 1 FROM public.piece_versions WHERE project_id = p) THEN RAISE EXCEPTION 'cross-user version read'; END IF;
  IF EXISTS (SELECT 1 FROM public.agent_attempts WHERE project_id = p) THEN RAISE EXCEPTION 'cross-user attempt read'; END IF;
  r := public.save_piece_version(p, piece, 2, c);
  IF r->>'status' IS DISTINCT FROM 'not_found' THEN RAISE EXCEPTION 'cross-user version write'; END IF;
  BEGIN
    PERFORM * FROM public.reserve_agent_attempt(p, '55555555-5555-4555-8555-555555555555');
    RAISE EXCEPTION 'cross-user attempt reservation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.finish_agent_attempt(p, current_setting('compor.test_alice_attempt')::uuid, 'completed');
    RAISE EXCEPTION 'cross-user attempt finish';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.projects (title) VALUES ('compor synthetic bob');
DO $$
DECLARE p uuid; a record;
BEGIN
  SELECT id INTO STRICT p FROM public.projects WHERE title = 'compor synthetic bob';
  SELECT * INTO a FROM public.reserve_agent_attempt(p, '44444444-4444-4444-8444-444444444444');
  IF a.is_new IS DISTINCT FROM true THEN RAISE EXCEPTION 'idempotency key not isolated by owner'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE p uuid := current_setting('compor.test_alice_project')::uuid; v_attempt_id uuid := current_setting('compor.test_alice_attempt')::uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE title = 'compor synthetic bob') THEN RAISE EXCEPTION 'cross-user project read'; END IF;
  IF public.finish_agent_attempt(p, v_attempt_id, 'unknown') IS DISTINCT FROM true THEN RAISE EXCEPTION 'finish failed'; END IF;
  IF (SELECT state FROM public.agent_attempts WHERE agent_attempts.id = v_attempt_id) IS DISTINCT FROM 'unknown' THEN RAISE EXCEPTION 'state not stored'; END IF;
  BEGIN
    PERFORM public.finish_agent_attempt(p, v_attempt_id, 'completed');
    RAISE EXCEPTION 'terminal attempt was modified';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Checks passed; transaction rolled back.'
