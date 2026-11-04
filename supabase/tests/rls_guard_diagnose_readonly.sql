-- Metadata-only diagnosis for the failed RLS rollback guard.
-- No rows from application, Auth, or Storage tables are read or changed.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '10s';

SELECT current_database() AS database_name, current_user AS executing_role,
       current_setting('transaction_read_only') AS read_only;

-- A left join also reports missing tables; only RLS on the three public tables
-- is required by the guard, and auth.users is not required to have RLS enabled.
WITH targets(schema_name,relation_name,rls_required) AS (VALUES
 ('auth','users',false),('public','projects',true),
 ('public','piece_versions',true),('public','agent_attempts',true))
SELECT t.schema_name,t.relation_name,t.rls_required,
 c.relkind, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
 pg_get_userbyid(c.relowner) AS owner
FROM targets t LEFT JOIN pg_namespace n ON n.nspname=t.schema_name
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=t.relation_name
ORDER BY t.schema_name,t.relation_name;

WITH targets(schema_name,relation_name) AS (VALUES
 ('auth','users'),('public','projects'),('public','piece_versions'),('public','agent_attempts'))
SELECT n.nspname AS schema_name,c.relname AS relation_name,
       tr.tgname AS trigger_name,tr.tgenabled AS enabled,
       pn.nspname AS function_schema,p.proname AS function_name,
       pg_get_userbyid(p.proowner) AS function_owner,p.prosecdef AS security_definer
FROM targets v JOIN pg_namespace n ON n.nspname=v.schema_name
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.relation_name
 JOIN pg_trigger tr ON tr.tgrelid=c.oid AND NOT tr.tgisinternal
 JOIN pg_proc p ON p.oid=tr.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
ORDER BY 1,2,3;

WITH targets(schema_name,relation_name) AS (VALUES
 ('auth','users'),('public','projects'),('public','piece_versions'),('public','agent_attempts'))
SELECT n.nspname AS schema_name,c.relname AS relation_name,r.rulename AS rule_name,r.ev_type,r.ev_enabled
FROM targets v JOIN pg_namespace n ON n.nspname=v.schema_name
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.relation_name
 JOIN pg_rewrite r ON r.ev_class=c.oid ORDER BY 1,2,3;

WITH targets(schema_name,relation_name) AS (VALUES
 ('auth','users'),('public','projects'),('public','piece_versions'),('public','agent_attempts'))
SELECT n.nspname AS parent_schema,c.relname AS parent_name,
       child_ns.nspname AS child_schema,child.relname AS child_name,child.relkind AS child_kind
FROM targets v JOIN pg_namespace n ON n.nspname=v.schema_name
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.relation_name
 JOIN pg_inherits i ON i.inhparent=c.oid JOIN pg_class child ON child.oid=i.inhrelid
 JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace ORDER BY 1,2,3,4;

WITH targets(schema_name,relation_name) AS (VALUES
 ('auth','users'),('public','projects'),('public','piece_versions'),('public','agent_attempts'))
SELECT n.nspname AS schema_name,c.relname AS relation_name,a.attname AS column_name,
       a.attgenerated AS generated,tn.nspname AS type_schema,t.typname AS type_name
FROM targets v JOIN pg_namespace n ON n.nspname=v.schema_name
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.relation_name
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated<>''
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
ORDER BY 1,2,3;
ROLLBACK;
