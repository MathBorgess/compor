-- Only after the same CLI process returns successful completion.
BEGIN;
SET LOCAL search_path = pg_catalog;
LOCK TABLE ONLY compor_migration_control.latch IN ACCESS EXCLUSIVE MODE;
\ir migration-latch-guard.sql
SELECT pg_catalog.set_config('compor.migration_run_token', :'run_token', true);
DO $body$
DECLARE affected integer; token text := pg_catalog.current_setting('compor.migration_run_token');
BEGIN
  IF token !~ '^[0-9]+-[0-9]+$' THEN RAISE EXCEPTION 'invalid migration run token'; END IF;
  UPDATE compor_migration_control.latch SET run_token=NULL, acquired_at=NULL
    WHERE singleton AND run_token COLLATE pg_catalog."C" = token COLLATE pg_catalog."C";
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'migration latch not owned by this execution'; END IF;
END
$body$;
COMMIT;
