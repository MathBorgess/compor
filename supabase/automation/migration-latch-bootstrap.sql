-- Apply only after identifying and reviewing the target. Not a Supabase CLI migration.
-- This one-time bootstrap intentionally fails if the schema already exists.
BEGIN;
CREATE SCHEMA compor_migration_control;
REVOKE ALL ON SCHEMA compor_migration_control FROM PUBLIC;
CREATE TABLE compor_migration_control.latch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  run_token text,
  acquired_at timestamptz,
  CHECK ((run_token IS NULL) = (acquired_at IS NULL)),
  CHECK (run_token IS NULL OR run_token ~ '^[0-9]+-[0-9]+$')
);
ALTER TABLE compor_migration_control.latch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE compor_migration_control.latch FROM PUBLIC;
-- Explicit default privileges may grant roles even on a newly created table.
-- Strip every non-owner ACL rather than assuming PostgreSQL defaults.
DO $body$
DECLARE principal record;
BEGIN
  FOR principal IN
    SELECT DISTINCT a.grantee, n.nspowner AS owner_oid
      FROM pg_catalog.pg_namespace n,
           LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n',n.nspowner))) a
      WHERE n.nspname='compor_migration_control' AND a.grantee NOT IN (0,n.nspowner)
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA compor_migration_control FROM %I CASCADE', pg_catalog.pg_get_userbyid(principal.grantee));
  END LOOP;
  FOR principal IN
    SELECT DISTINCT a.grantee, c.relowner AS owner_oid
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
           LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r',c.relowner))) a
      WHERE n.nspname='compor_migration_control' AND c.relname='latch' AND a.grantee NOT IN (0,c.relowner)
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE compor_migration_control.latch FROM %I CASCADE', pg_catalog.pg_get_userbyid(principal.grantee));
  END LOOP;
END
$body$;
INSERT INTO compor_migration_control.latch(singleton) VALUES (true);
COMMIT;
