#!/usr/bin/env python3
"""Real PostgreSQL integration tests. Runs only on an isolated disposable Docker DB.

Requires a local postgres:15-alpine image and a running managed Docker daemon.
Does not connect to any external database or pull an image.
"""
import concurrent.futures
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[2]
SQL = ROOT / 'supabase' / 'automation'
env = os.environ.copy()
for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    env.pop(name, None)
docker = ['docker', '--host=unix:///var/run/docker.sock']
name = 'compor-migration-latch-' + uuid.uuid4().hex[:12]

def command(args, *, input=None, check=True):
    return subprocess.run(args, input=input, text=True, capture_output=True, check=check, env=env, timeout=30)

def db(sql, token=None, check=True, script=None):
    args = docker + ['exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']
    if token is not None:
        args += ['-v', 'run_token=' + token]
    if script is not None:
        args += ['-f', '/tmp/compor-automation/' + script]
        sql = None
    return command(args, input=sql, check=check)

def file(name):
    return (SQL / name).read_text()

try:
    command(docker + ['run', '-d', '--rm', '--network=none', '--name', name,
                      '-e', 'POSTGRES_PASSWORD=synthetic-not-a-real-password', 'postgres:15-alpine'])
    for _ in range(60):
        if ('PostgreSQL init process complete' in command(docker + ['logs', name], check=False).stdout and command(docker + ['exec', name, 'pg_isready', '-U', 'postgres'], check=False).returncode == 0):
            break
        import time
        time.sleep(.25)
    else:
        raise RuntimeError('disposable postgres not ready')
    command(docker + ['cp', str(SQL), name + ':/tmp/compor-automation'])
    bootstrap = file('migration-latch-bootstrap.sql')
    acquire = file('migration-latch-acquire.sql')
    release = file('migration-latch-release.sql')
    db('CREATE ROLE latch_test_untrusted NOLOGIN; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO latch_test_untrusted; ALTER DEFAULT PRIVILEGES GRANT ALL ON SCHEMAS TO latch_test_untrusted;')
    db(bootstrap)
    assert db(bootstrap, check=False).returncode != 0, 'bootstrap must not reuse an existing schema'
    assert db(None, 'invalid', check=False, script='migration-latch-acquire.sql').returncode != 0
    # Independent sessions racing for the singleton: exactly one acquires it.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda token: db(None, token, check=False, script='migration-latch-acquire.sql'), ('100-1', '200-1')))
    winners = [i for i, result in enumerate(results) if result.returncode == 0]
    assert len(winners) == 1, [(r.returncode, r.stderr) for r in results]
    winner = ('100-1', '200-1')[winners[0]]
    loser = ('100-1', '200-1')[1-winners[0]]
    assert db(None, loser, check=False, script='migration-latch-release.sql').returncode != 0, 'other execution must not clear lock'
    # An execution that disappears after acquisition leaves durable state held.
    assert db(None, '300-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    assert db('SET ROLE latch_test_untrusted; SELECT * FROM compor_migration_control.latch;', check=False).returncode != 0
    db(None, winner, script='migration-latch-release.sql')
    # ACL drift fails closed until an operator restores the reviewed controls.
    db('GRANT USAGE ON SCHEMA compor_migration_control TO latch_test_untrusted;')
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    db('REVOKE USAGE ON SCHEMA compor_migration_control FROM latch_test_untrusted;')
    db('GRANT SELECT (run_token) ON compor_migration_control.latch TO latch_test_untrusted;')
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    db('REVOKE SELECT (run_token) ON compor_migration_control.latch FROM latch_test_untrusted;')
    # A check can have non-transactional side effects; reject before UPDATE.
    db("CREATE SEQUENCE public.latch_test_seq; ALTER TABLE compor_migration_control.latch ADD CONSTRAINT external_effect CHECK (nextval('public.latch_test_seq') > 0);")
    before = db('SELECT last_value FROM public.latch_test_seq;').stdout
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    assert db('SELECT last_value FROM public.latch_test_seq;').stdout == before
    db('ALTER TABLE compor_migration_control.latch DROP CONSTRAINT external_effect;')
    db('ALTER TABLE compor_migration_control.latch ALTER COLUMN acquired_at SET DEFAULT now();')
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    db('ALTER TABLE compor_migration_control.latch ALTER COLUMN acquired_at DROP DEFAULT;')
    db('CREATE INDEX latch_extra_index ON compor_migration_control.latch ((length(run_token)));')
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    db('DROP INDEX compor_migration_control.latch_extra_index;')
    db("CREATE FUNCTION public.latch_test_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM nextval('public.latch_test_seq'); RETURN NEW; END$$; CREATE TRIGGER external_trigger BEFORE UPDATE ON compor_migration_control.latch FOR EACH ROW EXECUTE FUNCTION public.latch_test_trigger();")
    before = db('SELECT last_value FROM public.latch_test_seq;').stdout
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    assert db('SELECT last_value FROM public.latch_test_seq;').stdout == before
    db('DROP TRIGGER external_trigger ON compor_migration_control.latch;')
    db('CREATE TABLE public.latch_test_fk (target boolean REFERENCES compor_migration_control.latch(singleton));')
    assert db(None, '250-1', check=False, script='migration-latch-acquire.sql').returncode != 0
    db('DROP TABLE public.latch_test_fk;')

    db(None, '300-1', script='migration-latch-acquire.sql')
    db(None, '300-1', script='migration-latch-release.sql')
    # A transaction failing before COMMIT rolls back the attempted latch write.
    db("BEGIN; UPDATE compor_migration_control.latch SET run_token='400-1', acquired_at=clock_timestamp(); SELECT 1/0; COMMIT;", check=False)
    db(None, '500-1', script='migration-latch-acquire.sql')
    # A failure reported after the release COMMIT can leave the latch free;
    # this is safe only because the workflow reaches release after CLI success.
    post_release = docker + ['exec', name, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'run_token=500-1', '-f', '/tmp/compor-automation/migration-latch-release.sql', '-c', 'SELECT 1/0']
    assert command(post_release, check=False).returncode != 0
    db(None, '550-1', script='migration-latch-acquire.sql')
    db(None, '550-1', script='migration-latch-release.sql')
    # A pooler-style database role contains a dot; role name is compared by OID.
    db('CREATE ROLE "postgres.abcdefghijklmnopqrst" NOLOGIN;')
    db('CREATE DATABASE latch_owner OWNER "postgres.abcdefghijklmnopqrst";')
    base = docker + ['exec', name, 'psql', '-X', '-U', 'postgres', '-d', 'latch_owner', '-v', 'ON_ERROR_STOP=1', '-c', 'SET ROLE "postgres.abcdefghijklmnopqrst"']
    command(base + ['-f', '/tmp/compor-automation/migration-latch-bootstrap.sql'])
    command(base + ['-v', 'run_token=600-1', '-f', '/tmp/compor-automation/migration-latch-acquire.sql'])
    command(base + ['-v', 'run_token=600-1', '-f', '/tmp/compor-automation/migration-latch-release.sql'])
    print('PASS: atomic concurrent acquisition, crash persistence, ACL, drift, role identity and rollback')
finally:
    command(docker + ['rm', '-f', name], check=False)
