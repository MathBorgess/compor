-- psql -v ON_ERROR_STOP=1 -v run_token=<run id>-<attempt> -f this-file
-- Successful exit confirms COMMIT before the CLI may dispatch migrations.
BEGIN;
SET LOCAL search_path = pg_catalog;
LOCK TABLE ONLY compor_migration_control.latch IN ACCESS EXCLUSIVE MODE;
\ir migration-latch-guard.sql
SELECT pg_catalog.set_config('compor.migration_run_token', :'run_token', true);
DO $body$
DECLARE affected integer; token text := pg_catalog.current_setting('compor.migration_run_token');
BEGIN
  IF token !~ '^[0-9]+-[0-9]+$' THEN RAISE EXCEPTION 'invalid migration run token'; END IF;
  UPDATE compor_migration_control.latch SET run_token=token, acquired_at=pg_catalog.clock_timestamp()
    WHERE singleton AND run_token IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'migration latch unavailable or held'; END IF;
END
$body$;
COMMIT;
