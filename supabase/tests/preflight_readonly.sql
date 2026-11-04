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

rollback;
