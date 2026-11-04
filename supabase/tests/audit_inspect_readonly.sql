-- Inspect only the dedicated Compor test project. No writes and no schema changes.
-- The optional audit data read is refused unless the expected structure is verified.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '5s';

SELECT current_database() AS database_name, current_user AS executing_role,
       current_setting('transaction_read_only') AS read_only;
SELECT n.nspname AS schema_name, pg_get_userbyid(n.nspowner) AS owner, n.nspacl AS schema_acl
FROM pg_namespace n WHERE n.nspname IN ('compor_migration_audit','supabase_migrations') ORDER BY 1;
SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
       pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls, c.relacl AS relation_acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='compor_migration_audit'
   OR (n.nspname='public' AND c.relname IN ('projects','piece_versions','agent_attempts',
       'image_tool_reservations','image_consent_declarations','image_tool_executions',
       'image_tool_result_submissions','usage_measurements'))
   OR (n.nspname='supabase_migrations' AND c.relname='schema_migrations')
ORDER BY 1,2;
SELECT a.attname AS column_name, tn.nspname AS type_schema, t.typname AS type_name,
       a.attnotnull AS not_null, a.attgenerated AS generated, a.attacl AS column_acl
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
WHERE n.nspname='compor_migration_audit' AND c.relname='applied'
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT p.polname AS policy_name, p.polpermissive AS permissive
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='compor_migration_audit' AND c.relname='applied' ORDER BY 1;
SELECT r.rulename AS rule_name FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='compor_migration_audit' AND c.relname='applied' ORDER BY 1;
SELECT t.tgname AS trigger_name, t.tgenabled AS enabled, t.tgfoid::regprocedure AS function_name
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND NOT t.tgisinternal ORDER BY 1;
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('save_piece_version','finish_agent_attempt',
  'start_usage_measurement','finish_usage_measurement','list_piece_image_assets',
  'compor_private_image_path_authorized') ORDER BY 1,2;

-- Read only the named bucket's metadata, and only if the expected base table,
-- primitive columns and privileges are present. Never inspect storage.objects.
SELECT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_roles r ON r.rolname=current_user JOIN pg_roles owner ON owner.oid=c.relowner
 WHERE n.nspname='storage' AND c.relname='buckets' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND owner.rolname='supabase_storage_admin'
   AND has_schema_privilege(current_user,n.oid,'USAGE') AND has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND 4=(SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
     JOIN pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND tn.nspname='pg_catalog'
       AND ((a.attname='id' AND t.typname='text') OR (a.attname='public' AND t.typname='bool')
         OR (a.attname='file_size_limit' AND t.typname='int8') OR (a.attname='allowed_mime_types' AND t.typname='_text')))
) AS bucket_safe_to_read \gset
\if :bucket_safe_to_read
LOCK TABLE ONLY storage.buckets IN ACCESS SHARE MODE;
SELECT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_roles r ON r.rolname=current_user JOIN pg_roles owner ON owner.oid=c.relowner
 WHERE n.nspname='storage' AND c.relname='buckets' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND owner.rolname='supabase_storage_admin'
   AND has_schema_privilege(current_user,n.oid,'USAGE') AND has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND 4=(SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
     JOIN pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND tn.nspname='pg_catalog'
       AND ((a.attname='id' AND t.typname='text') OR (a.attname='public' AND t.typname='bool')
         OR (a.attname='file_size_limit' AND t.typname='int8') OR (a.attname='allowed_mime_types' AND t.typname='_text')))
) AS bucket_safe_to_read \gset
\endif
\if :bucket_safe_to_read
SELECT 'available' AS bucket_read_status;
SELECT id, public, file_size_limit, allowed_mime_types FROM ONLY storage.buckets
WHERE id='compor-project-images' LIMIT 2;
\else
SELECT 'absent_or_unverified' AS bucket_read_status;
\endif

-- Exactly the table defined in the migration runner: no unknown types, RLS
-- policies, rewrite rules or user-defined triggers. No arbitrary value is printed.
SELECT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_roles r ON r.rolname=current_user
 WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND n.nspowner=r.oid AND c.relowner=r.oid
   AND c.relrowsecurity AND NOT c.relforcerowsecurity
   AND has_schema_privilege(current_user,n.oid,'USAGE')
   AND has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal)
   AND 5=(SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
   AND 5=(SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
     JOIN pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND a.attnotnull AND tn.nspname='pg_catalog'
       AND ((a.attname IN ('version','filename','source_commit','sha256') AND t.typname='text')
         OR (a.attname='applied_at' AND t.typname='timestamptz')))
) AS audit_safe_to_read \gset
\if :audit_safe_to_read
LOCK TABLE ONLY compor_migration_audit.applied IN ACCESS SHARE MODE;
-- Re-check after acquiring lock; no concurrent schema/role changes are allowed.
SELECT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_roles r ON r.rolname=current_user
 WHERE n.nspname='compor_migration_audit' AND c.relname='applied' AND c.relkind='r'
   AND current_user='postgres' AND r.rolbypassrls AND n.nspowner=r.oid AND c.relowner=r.oid
   AND c.relrowsecurity AND NOT c.relforcerowsecurity
   AND has_schema_privilege(current_user,n.oid,'USAGE')
   AND has_table_privilege(current_user,c.oid,'SELECT')
   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_rewrite rw WHERE rw.ev_class=c.oid)
   AND NOT EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal)
   AND 5=(SELECT count(*) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
   AND 5=(SELECT count(*) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
     JOIN pg_namespace tn ON tn.oid=t.typnamespace
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
       AND a.attnotnull AND tn.nspname='pg_catalog'
       AND ((a.attname IN ('version','filename','source_commit','sha256') AND t.typname='text')
         OR (a.attname='applied_at' AND t.typname='timestamptz')))
) AS audit_safe_to_read \gset
\endif
\if :audit_safe_to_read
SELECT 'available' AS audit_read_status;
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE version ~ '^[0-9]{14}$'
         AND filename ~ '^202611030000(0[0-9]|10)_[a-z0-9_]+[.]sql$'
         AND source_commit ~ '^[0-9a-f]{40}$' AND sha256 ~ '^[0-9a-f]{64}$') AS well_formed_rows
FROM ONLY compor_migration_audit.applied;
SELECT version, filename, source_commit, sha256, applied_at
FROM ONLY compor_migration_audit.applied
WHERE version ~ '^[0-9]{14}$'
  AND filename ~ '^202611030000(0[0-9]|10)_[a-z0-9_]+[.]sql$'
  AND source_commit ~ '^[0-9a-f]{40}$' AND sha256 ~ '^[0-9a-f]{64}$'
ORDER BY version LIMIT 12;
\else
SELECT 'absent_or_unverified' AS audit_read_status;
\endif
ROLLBACK;
