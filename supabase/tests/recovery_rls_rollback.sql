-- Synthetic recovery/RLS proof only: not a test of JWT verification or Storage.
-- Never run while migrations, permissions, or other DDL can change concurrently.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- Prevent concurrent table writes and trigger/rule DDL during this short test.
-- This can briefly block sign-ins and writes; use only the dedicated test project.
LOCK TABLE ONLY auth.users, public.projects, public.piece_versions, public.agent_attempts, public.agent_session_recovery
  IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE affected oid[];
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres'
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'unexpected database or role';
  END IF;
  affected := ARRAY['auth.users'::regclass, 'public.projects'::regclass,
                    'public.piece_versions'::regclass, 'public.agent_attempts'::regclass,
                    'public.agent_session_recovery'::regclass];
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected) AND relkind <> 'r')
     OR EXISTS (SELECT 1 FROM pg_class WHERE oid=ANY(affected[2:5]) AND NOT relrowsecurity)
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

-- Verify the exact reviewed definer bodies and privileges before invoking them.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('public.bind_agent_session_recovery(uuid,uuid,text)', '07f7c902103fd5539a8d2875f1e2f043dcea4e521da494fb2287c7ab21ff813e'),
    ('public.get_agent_session_recovery(uuid,uuid)', '12c94e375c149cae63898b1e18d7b965c33dba7a89a8f33464506c8517e6e6f1')
  ) AS expected(signature, body_sha256) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=to_regprocedure(f.signature) AND r.rolname='postgres' AND p.prosecdef
        AND p.proconfig=ARRAY['search_path=""'] AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f.body_sha256)
      OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')
      OR has_function_privilege('anon',f.signature,'EXECUTE') THEN
      RAISE EXCEPTION 'unexpected recovery function or permissions';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.agent_session_recovery'::regclass)
    OR has_table_privilege('authenticated','public.agent_session_recovery','SELECT,INSERT,UPDATE,DELETE')
    OR has_any_column_privilege('authenticated','public.agent_session_recovery','SELECT,INSERT,UPDATE')
    OR has_table_privilege('anon','public.agent_session_recovery','SELECT,INSERT,UPDATE,DELETE')
    OR has_any_column_privilege('anon','public.agent_session_recovery','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'unexpected recovery table privileges or policies';
  END IF;
END $$;

SELECT gen_random_uuid() AS user_a, gen_random_uuid() AS user_b,
       gen_random_uuid() AS project_a, gen_random_uuid() AS project_b,
       gen_random_uuid() AS attempt_a, gen_random_uuid() AS attempt_b,
       gen_random_uuid() AS key_a, gen_random_uuid() AS key_b \gset
INSERT INTO auth.users(id) VALUES (:'user_a'::uuid), (:'user_b'::uuid);
INSERT INTO public.projects(id,owner_id,title) VALUES
  (:'project_a'::uuid,:'user_a'::uuid,'Synthetic recovery A'),
  (:'project_b'::uuid,:'user_b'::uuid,'Synthetic recovery B');
INSERT INTO public.agent_attempts(id,owner_id,project_id,idempotency_key) VALUES
  (:'attempt_a'::uuid,:'user_a'::uuid,:'project_a'::uuid,:'key_a'::uuid),
  (:'attempt_b'::uuid,:'user_b'::uuid,:'project_b'::uuid,:'key_b'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',:'user_a',true);
SELECT set_config('compor_test.attempt_a',:'attempt_a',true),
       set_config('compor_test.project_a',:'project_a',true);
DO $$
DECLARE read_denied boolean := false; write_denied boolean := false;
BEGIN
  BEGIN
    PERFORM 1 FROM public.agent_session_recovery LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN read_denied := true; END;
  BEGIN
    INSERT INTO public.agent_session_recovery(attempt_id,owner_id,project_id,binding)
      VALUES (current_setting('compor_test.attempt_a')::uuid,auth.uid(),
              current_setting('compor_test.project_a')::uuid,'v4.synthetic.proof');
  EXCEPTION WHEN insufficient_privilege THEN write_denied := true; END;
  IF NOT read_denied OR NOT write_denied THEN RAISE EXCEPTION 'direct access was not denied'; END IF;
END $$;
SELECT public.bind_agent_session_recovery(:'project_a'::uuid,:'attempt_a'::uuid,'v4.syntheticA.proof')
 AND public.bind_agent_session_recovery(:'project_a'::uuid,:'attempt_a'::uuid,'v4.syntheticA.proof')
 AND NOT public.bind_agent_session_recovery(:'project_a'::uuid,:'attempt_a'::uuid,'v4.different.proof')
 AND NOT public.bind_agent_session_recovery(:'project_b'::uuid,:'attempt_b'::uuid,'v4.cross.proof') AS passed \gset
\if :passed
\else
  \echo 'Recovery bind check for identity A failed'
  SELECT 1/0;
\endif
SELECT (SELECT count(*) FROM public.get_agent_session_recovery(:'project_a'::uuid,:'key_a'::uuid) WHERE attempt_id=:'attempt_a'::uuid AND recovery_binding='v4.syntheticA.proof')=1
 AND (SELECT count(*) FROM public.get_agent_session_recovery(:'project_b'::uuid,:'key_b'::uuid))=0 AS passed \gset
\if :passed
\else
  \echo 'Recovery read check for identity A failed'
  SELECT 1/0;
\endif
SELECT set_config('request.jwt.claim.sub',:'user_b',true);
SELECT public.bind_agent_session_recovery(:'project_b'::uuid,:'attempt_b'::uuid,'v4.syntheticB.proof')
 AND NOT public.bind_agent_session_recovery(:'project_a'::uuid,:'attempt_a'::uuid,'v4.cross.proof') AS passed \gset
\if :passed
\else
  \echo 'Recovery bind check for identity B failed'
  SELECT 1/0;
\endif
SELECT (SELECT count(*) FROM public.get_agent_session_recovery(:'project_b'::uuid,:'key_b'::uuid) WHERE attempt_id=:'attempt_b'::uuid AND recovery_binding='v4.syntheticB.proof')=1
 AND (SELECT count(*) FROM public.get_agent_session_recovery(:'project_a'::uuid,:'key_a'::uuid))=0 AS passed \gset
\if :passed
\else
  \echo 'Recovery read check for identity B failed'
  SELECT 1/0;
\endif
RESET ROLE;
ROLLBACK;
SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id IN (:'user_a'::uuid,:'user_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id IN (:'project_a'::uuid,:'project_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.agent_attempts WHERE id IN (:'attempt_a'::uuid,:'attempt_b'::uuid))
 AND NOT EXISTS (SELECT 1 FROM public.agent_session_recovery WHERE attempt_id IN (:'attempt_a'::uuid,:'attempt_b'::uuid)) AS passed \gset
\if :passed
  SELECT 'RECOVERY_RLS_CHECKS_PASSED_AND_ROLLED_BACK' AS result;
\else
  \echo 'Post-rollback recovery fixture check failed'
  SELECT 1/0;
\endif
