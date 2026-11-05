-- Synthetic database-role/RLS proof only: not a test of JWT verification or Storage.
-- Never run while migrations, permissions, or other DDL can change concurrently.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Prevent concurrent table writes and trigger/rule DDL during this short test.
-- This can briefly block sign-ins and writes; use only the dedicated test project.
LOCK TABLE ONLY auth.users, public.projects, public.piece_versions, public.agent_attempts
  IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE affected oid[];
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres'
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'unexpected database or role';
  END IF;
  affected := ARRAY['auth.users'::regclass, 'public.projects'::regclass,
                    'public.piece_versions'::regclass, 'public.agent_attempts'::regclass];
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected) AND relkind <> 'r')
     OR EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected[2:4]) AND NOT relrowsecurity)
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=ANY(affected) AND NOT tgisinternal)
     OR EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class=ANY(affected))
     OR EXISTS (SELECT 1 FROM pg_inherits WHERE inhparent=ANY(affected))
     OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=ANY(affected) AND a.attnum>0
       AND NOT a.attisdropped AND a.attgenerated<>'' AND NOT (
         -- Supabase Auth's managed generated column is accepted only when its
         -- complete expression and input/output types match this known form.
         a.attrelid='auth.users'::regclass AND a.attname='confirmed_at' AND a.attgenerated='s'
         AND a.atttypid='pg_catalog.timestamptz'::regtype
         AND EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum
           AND pg_get_expr(d.adbin,d.adrelid)='LEAST(email_confirmed_at, phone_confirmed_at)')
         AND 2=(SELECT count(*) FROM pg_attribute input WHERE input.attrelid=a.attrelid
           AND input.attname IN ('email_confirmed_at','phone_confirmed_at') AND input.attnum>0
           AND NOT input.attisdropped AND input.attgenerated=''
           AND input.atttypid='pg_catalog.timestamptz'::regtype)
       )) THEN
    RAISE EXCEPTION 'unexpected table, RLS, trigger, rule, descendant or generated column';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE a.attrelid=ANY(affected) AND a.attnum>0 AND NOT a.attisdropped
      AND (t.typtype='d' OR n.nspname<>'pg_catalog')) THEN
    RAISE EXCEPTION 'unexpected domain or column type';
  END IF;
  -- Refuse non-built-in functions referenced directly by defaults or constraints.
  IF EXISTS (
    SELECT 1 FROM pg_attrdef ad JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=ad.oid
    JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND p.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE ad.adrelid=ANY(affected) AND n.nspname<>'pg_catalog'
      AND p.oid<>'auth.uid()'::regprocedure
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_depend d ON d.classid='pg_constraint'::regclass AND d.objid=c.oid
    JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND p.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE c.conrelid=ANY(affected) AND n.nspname<>'pg_catalog'
  ) THEN RAISE EXCEPTION 'unexpected default or constraint function'; END IF;
  -- Managed auth.uid is the only non-catalog function expected in RLS policies.
  IF EXISTS (
    SELECT 1 FROM pg_policy pol JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=pol.oid
    JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND p.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE pol.polrelid=ANY(affected) AND n.nspname<>'pg_catalog'
      AND p.oid<>'auth.uid()'::regprocedure
  ) THEN RAISE EXCEPTION 'unexpected policy function'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d JOIN pg_operator o ON d.refclassid='pg_operator'::regclass AND o.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=o.oprnamespace
    WHERE n.nspname<>'pg_catalog' AND (
      (d.classid='pg_attrdef'::regclass AND d.objid IN (SELECT oid FROM pg_attrdef WHERE adrelid=ANY(affected))) OR
      (d.classid='pg_constraint'::regclass AND d.objid IN (SELECT oid FROM pg_constraint WHERE conrelid=ANY(affected))) OR
      (d.classid='pg_policy'::regclass AND d.objid IN (SELECT oid FROM pg_policy WHERE polrelid=ANY(affected)))
    )
  ) THEN RAISE EXCEPTION 'unexpected expression operator'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy pol JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=pol.oid
    JOIN pg_class ref ON d.refclassid='pg_class'::regclass AND ref.oid=d.refobjid
    WHERE pol.polrelid=ANY(affected) AND ref.oid<>ALL(affected)
  ) THEN RAISE EXCEPTION 'unexpected policy relation'; END IF;
END $$;

-- Only fresh random fixture IDs are touched; no existing users or projects change.
SELECT gen_random_uuid() AS user_a, gen_random_uuid() AS user_b,
       gen_random_uuid() AS project_a, gen_random_uuid() AS project_b,
       gen_random_uuid() AS piece_a, gen_random_uuid() AS piece_b,
       gen_random_uuid() AS attempt_a, gen_random_uuid() AS attempt_b,
       gen_random_uuid() AS key_a, gen_random_uuid() AS key_b \gset
INSERT INTO auth.users(id) VALUES (:'user_a'::uuid), (:'user_b'::uuid);
INSERT INTO public.projects(id,owner_id,title) VALUES
  (:'project_a'::uuid,:'user_a'::uuid,'Synthetic RLS A'),
  (:'project_b'::uuid,:'user_b'::uuid,'Synthetic RLS B');
INSERT INTO public.piece_versions(project_id,piece_id,version,content) VALUES
  (:'project_a'::uuid,:'piece_a'::uuid,1,'{}'::jsonb),
  (:'project_b'::uuid,:'piece_b'::uuid,1,'{}'::jsonb);
INSERT INTO public.agent_attempts(id,owner_id,project_id,idempotency_key) VALUES
  (:'attempt_a'::uuid,:'user_a'::uuid,:'project_a'::uuid,:'key_a'::uuid),
  (:'attempt_b'::uuid,:'user_b'::uuid,:'project_b'::uuid,:'key_b'::uuid);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'user_a',true);
SELECT current_user='authenticated' AND auth.uid()=:'user_a'::uuid
 AND (SELECT count(*) FROM public.projects WHERE id IN (:'project_a'::uuid,:'project_b'::uuid))=1
 AND (SELECT count(*) FROM public.projects WHERE id=:'project_a'::uuid)=1
 AND (SELECT count(*) FROM public.piece_versions WHERE project_id IN (:'project_a'::uuid,:'project_b'::uuid))=1
 AND (SELECT count(*) FROM public.piece_versions WHERE project_id=:'project_a'::uuid)=1
 AND (SELECT count(*) FROM public.agent_attempts WHERE id IN (:'attempt_a'::uuid,:'attempt_b'::uuid))=1
 AND (SELECT count(*) FROM public.agent_attempts WHERE id=:'attempt_a'::uuid)=1 AS passed \gset
\if :passed
\else
  \echo 'RLS check for synthetic identity A failed'
  SELECT 1/0;
\endif

SELECT set_config('request.jwt.claim.sub',:'user_b',true);
SELECT current_user='authenticated' AND auth.uid()=:'user_b'::uuid
 AND (SELECT count(*) FROM public.projects WHERE id IN (:'project_a'::uuid,:'project_b'::uuid))=1
 AND (SELECT count(*) FROM public.projects WHERE id=:'project_b'::uuid)=1
 AND (SELECT count(*) FROM public.piece_versions WHERE project_id IN (:'project_a'::uuid,:'project_b'::uuid))=1
 AND (SELECT count(*) FROM public.piece_versions WHERE project_id=:'project_b'::uuid)=1
 AND (SELECT count(*) FROM public.agent_attempts WHERE id IN (:'attempt_a'::uuid,:'attempt_b'::uuid))=1
 AND (SELECT count(*) FROM public.agent_attempts WHERE id=:'attempt_b'::uuid)=1 AS passed \gset
\if :passed
\else
  \echo 'RLS check for synthetic identity B failed'
  SELECT 1/0;
\endif

-- B can insert an attempt for its own project but must be denied for A's.
INSERT INTO public.agent_attempts(project_id,idempotency_key)
  VALUES (:'project_b'::uuid,gen_random_uuid());
SELECT set_config('compor_test.foreign_project',:'project_a',true);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.agent_attempts(project_id,idempotency_key)
      VALUES (current_setting('compor_test.foreign_project')::uuid,gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-account insert was not denied'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
-- A fresh query after rollback checks all generated fixture IDs are absent.
SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id IN (:'user_a'::uuid,:'user_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id IN (:'project_a'::uuid,:'project_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.piece_versions WHERE project_id IN (:'project_a'::uuid,:'project_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.agent_attempts WHERE id IN (:'attempt_a'::uuid,:'attempt_b'::uuid)) AS passed \gset
\if :passed
  SELECT 'RLS_SYNTHETIC_CHECKS_PASSED_AND_ROLLED_BACK' AS result;
\else
  \echo 'Post-rollback fixture check failed'
  SELECT 1/0;
\endif
