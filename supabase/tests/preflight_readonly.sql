-- Metadata inventory only. Review the target and this script before use.
-- This script does not validate RLS behavior, emptiness, side effects or migrations.
\set ON_ERROR_STOP on
begin transaction read only;
set local search_path = pg_catalog;
set local statement_timeout = '10s';

select current_database() as database_name, current_user as executing_role, session_user as login_role,
       current_setting('transaction_read_only') as read_only;

select rolname, rolsuper, rolbypassrls from pg_catalog.pg_roles
where rolname in (current_user, session_user, 'authenticated', 'anon') order by rolname;

-- These are catalog indicators, not proof that a managed service permits DDL.
select c.relname as storage_relation, pg_catalog.pg_get_userbyid(c.relowner) as relation_owner,
       pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER') as member_of_owner,
       pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') as inherits_owner_privileges,
       pg_catalog.has_schema_privilege(current_user, n.oid, 'USAGE') as storage_schema_usage,
       pg_catalog.has_schema_privilege(current_user, n.oid, 'CREATE') as storage_schema_create,
       pg_catalog.has_table_privilege(current_user, c.oid, 'INSERT') as table_insert_privilege
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='storage' and c.relname in ('objects','buckets') and c.relkind in ('r','p')
order by 1;

select n.nspname as schema_name, c.relname as relation_name, c.relkind,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
       pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relkind in ('r','p','v','m','f'))
   or (n.nspname = 'storage' and c.relname in ('objects','buckets'))
   or (n.nspname = 'auth' and c.relname = 'users')
order by 1,2;

select schemaname, tablename, policyname, permissive, roles, cmd
from pg_catalog.pg_policies
where schemaname in ('public','storage','auth') order by 1,2,3;

select table_schema, table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema in ('public','storage','auth') order by 1,2,3,4;

select table_schema, table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema in ('public','storage','auth') order by 1,2,3,4,5;

-- No function bodies, configuration values or application data are returned.
-- This includes the 00008 finish RPC and both 00009 usage RPCs if installed.
select n.nspname as schema_name, p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, pg_catalog.pg_get_userbyid(p.proowner) as owner,
       exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
               where split_part(setting, '=', 1) = 'search_path') as sets_search_path,
       (select pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') from pg_catalog.pg_roles r where r.rolname='authenticated') as authenticated_can_execute,
       (select pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') from pg_catalog.pg_roles r where r.rolname='anon') as anon_can_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by 1,2,3;

select n.nspname as schema_name, c.relname as relation_name, t.tgname as trigger_name,
       t.tgenabled as enabled, t.tgfoid::regprocedure as trigger_function
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','storage','auth') order by 1,2,3;

select n.nspname as schema_name, c.relname as relation_name, r.rulename, r.ev_type, r.ev_enabled
from pg_catalog.pg_rewrite r join pg_catalog.pg_class c on c.oid=r.ev_class
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage','auth') and r.rulename <> '_RETURN' order by 1,2,3;

select evtname, evtevent, evtenabled, evtfoid::regprocedure as event_function
from pg_catalog.pg_event_trigger order by evtname;
select extname, extversion from pg_catalog.pg_extension order by extname;

-- A history read is optional. Refuse views, RLS, rewrite rules, unknown column
-- types or missing privileges. Even a successful read does not prove effects.
select case when exists (
  select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='supabase_migrations' and c.relname='schema_migrations'
) then 'present' else 'absent' end as migration_history_relation_status;
select exists (
  select 1 from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attname='version' and not a.attisdropped
  join pg_catalog.pg_type t on t.oid=a.atttypid
  join pg_catalog.pg_namespace tn on tn.oid=t.typnamespace
  where n.nspname='supabase_migrations' and c.relname='schema_migrations'
    and c.relkind='r' and not c.relrowsecurity
    and tn.nspname='pg_catalog' and t.typname in ('text','varchar')
    and not exists(select 1 from pg_catalog.pg_rewrite r where r.ev_class=c.oid)
    and pg_catalog.has_schema_privilege(current_user,n.oid,'USAGE')
    and pg_catalog.has_column_privilege(current_user,c.oid,a.attname,'SELECT')
) as migration_history_safe_to_read \gset
\if :migration_history_safe_to_read
select 'available' as migration_history_status;
select version from supabase_migrations.schema_migrations
where version ~ '^[0-9]{14}$' order by version;
\else
select 'absent_or_unverified' as migration_history_status;
\endif

rollback;
