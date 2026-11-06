-- Metadata only: no migration, data table, statement body, secret or SQL write.
-- Require independent confirmation of target, TLS identity and privileges.
-- Do not run while schemas, relation names, roles or permissions can change:
-- a table lock does not exclude concurrent namespace/role changes. This is an
-- inventory, not proof of applied effects, application order or target identity.
-- Capture with psql -X -qAt -v ON_ERROR_STOP=1; any error invalidates the file.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '5s';
-- Avoid invoking application-defined index expressions or collations when
-- inspecting metadata from a target that has not yet been trusted.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_indexonlyscan = off;
SET LOCAL enable_bitmapscan = off;

SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='compor_migration_audit' AND c.relname='applied'
) AS legacy_exists \gset
SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.rolname=current_user
 WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND n.nspowner=r.oid AND c.relowner=r.oid
   AND c.relrowsecurity AND NOT c.relforcerowsecurity
   AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')
   AND pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal)
   AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
   AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
     JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND a.attnotnull AND tn.nspname='pg_catalog'
       AND ((a.attname IN ('version','filename','source_commit','sha256') AND t.typname='text')
         OR (a.attname='applied_at' AND t.typname='timestamptz')))
) AS legacy_safe \gset
\if :legacy_safe
LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS SHARE MODE;
-- Revalidate after acquiring the lock using a fresh READ COMMITTED snapshot.
SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_roles r ON r.rolname=current_user
 WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND n.nspowner=r.oid AND c.relowner=r.oid
   AND c.relrowsecurity AND NOT c.relforcerowsecurity
   AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')
   AND pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal)
   AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
   AND 5=(SELECT count(*) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
     JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND a.attnotnull AND tn.nspname='pg_catalog'
       AND ((a.attname IN ('version','filename','source_commit','sha256') AND t.typname='text')
         OR (a.attname='applied_at' AND t.typname='timestamptz')))
) AS legacy_safe \gset
\endif
\if :legacy_safe
-- Counts include malformed rows; only constrained metadata is emitted.
SELECT pg_catalog.jsonb_build_object(
 'kind','legacy','status','available','total_rows',count(*),
 'entries',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'version',version,'filename',filename,'source_commit',source_commit,'sha256',sha256) ORDER BY version COLLATE pg_catalog."C")
   FILTER (WHERE version COLLATE pg_catalog."C" ~ '^[0-9]{14}$' AND length(filename)<=200
     AND filename COLLATE pg_catalog."C" ~ '^[0-9]{14}_[a-z0-9_]+[.]sql$'
     AND source_commit COLLATE pg_catalog."C" ~ '^[0-9a-f]{40}$'
     AND sha256 COLLATE pg_catalog."C" ~ '^[0-9a-f]{64}$'), '[]'::jsonb))
FROM ONLY compor_migration_audit.applied;
\else
SELECT pg_catalog.jsonb_build_object('kind','legacy',
 'status',CASE WHEN :'legacy_exists'::boolean THEN 'unverified' ELSE 'absent' END,
 'total_rows',0,'entries','[]'::jsonb);
\endif

SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
) AS native_exists \gset
SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname='version' AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
 WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
   AND c.relkind='r' AND NOT c.relrowsecurity AND a.attgenerated=''
   AND tn.nspname='pg_catalog' AND t.typname IN ('text','varchar')
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')
   AND pg_catalog.has_column_privilege(current_user,c.oid,a.attname,'SELECT')
) AS native_safe \gset
\if :native_safe
LOCK TABLE ONLY supabase_migrations.schema_migrations IN ACCESS SHARE MODE;
SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname='version' AND a.attnum>0 AND NOT a.attisdropped
 JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
 WHERE n.nspname='supabase_migrations' AND c.relname='schema_migrations'
   AND c.relkind='r' AND NOT c.relrowsecurity AND a.attgenerated=''
   AND tn.nspname='pg_catalog' AND t.typname IN ('text','varchar')
   AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')
   AND pg_catalog.has_column_privilege(current_user,c.oid,a.attname,'SELECT')
) AS native_safe \gset
\endif
\if :native_safe
SELECT pg_catalog.jsonb_build_object(
 'kind','native','status','available','total_rows',count(*),
 'entries',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('version',version) ORDER BY version COLLATE pg_catalog."C")
   FILTER (WHERE version COLLATE pg_catalog."C" ~ '^[0-9]{14}$'), '[]'::jsonb))
FROM ONLY supabase_migrations.schema_migrations;
\else
SELECT pg_catalog.jsonb_build_object('kind','native',
 'status',CASE WHEN :'native_exists'::boolean THEN 'unverified' ELSE 'absent' END,
 'total_rows',0,'entries','[]'::jsonb);
\endif
ROLLBACK;
