import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root = new URL('../../../', import.meta.url).pathname;
const run = promisify(execFile), env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
const prepare = (...args) => JSON.parse(execFileSync('python3', ['-B', ...args], { cwd: root, encoding: 'utf8', env }));
const artifacts = [
  prepare('scripts/prepare_compor_migrations.py', '35925f0b130fb4ed0123d2b460cc42ffe2698c2f'),
  prepare('scripts/prepare_image_26_migration.py'),
  prepare('scripts/prepare_recovery_migration.py'),
  prepare('scripts/prepare_studio_migrations.py'),
  prepare('scripts/prepare_studio_migrations.py', '--proof'),
];
const sql = await Promise.all(artifacts.map(async item => (await readFile(item.path, 'utf8')).replace(/^\\.*$/gm, '')));
const studioSql = sql[3];
async function fixture(t, apply = true) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to public;grant execute on function auth.uid() to public;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;`);
  for (const source of sql.slice(0, 3)) await db.exec(source);
  if (apply) await db.exec(studioSql);
  return db;
}

test('studio bundle applies both migrations atomically from exactly thirteen audited rows', async t => {
  const db = await fixture(t, false);
  await db.exec(studioSql);
  const rows = (await db.query('select version,source_commit,sha256 from compor_migration_audit.applied order by version')).rows;
  assert.equal(rows.length, 15);
  for (const item of artifacts[3].migrations) assert.deepEqual(rows.find(row => row.version === item.filename.slice(0, 14)), { version: item.filename.slice(0, 14), source_commit: item.source_commit, sha256: item.sha256 });
  await assert.rejects(() => db.exec(studioSql)); await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n, 15);
});

test('history, RPC/column drift, partial objects and transaction failures refuse the application', async t => {
  for (const mutation of [
    "update compor_migration_audit.applied set sha256=repeat('0',64) where version='20261103000000'",
    'create table public.studio_turns(id uuid)',
    'alter table public.projects add column unexpected text',
    "create or replace function public.save_piece_version(p_project_id uuid,p_piece_id uuid,p_expected_version integer,p_content jsonb) returns jsonb language sql security definer set search_path='' as $$select '{}'::jsonb$$",
    'failure_after_ddl',
  ]) {
    const db = await fixture(t, false);
    if (mutation !== 'failure_after_ddl') await db.exec(mutation);
    const attempt = mutation === 'failure_after_ddl' ? studioSql.replace('INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)', 'SELECT 1/0; INSERT INTO compor_migration_audit.applied(version,filename,source_commit,sha256)') : studioSql;
    await assert.rejects(() => db.exec(attempt)); await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from compor_migration_audit.applied')).rows[0].n, 13);
    assert.equal((await db.query("select to_regclass('public.piece_version_metadata') is null absent")).rows[0].absent, true);
    assert.equal((await db.query("select count(*)::int n from pg_attribute where attrelid='public.projects'::regclass and attname='revision' and not attisdropped")).rows[0].n, 0);
  }
});

test('psql proof checks both owners, every new RPC and exact rollback snapshots', async t => {
  if (spawnSync('psql', ['--version']).status !== 0) return t.skip('psql unavailable');
  const db = await fixture(t, false), dir = await mkdtemp(join(tmpdir(), 'compor-studio-socket-'));
  const server = new PGLiteSocketServer({ db, path: join(dir, '.s.PGSQL.5432') });
  await server.start();
  t.after(async () => { await server.stop(); await rm(dir, { recursive: true, force: true }); });
  await db.exec(`insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
   insert into public.projects(id,owner_id,title) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','preserve-existing');`);
  const baseline = async () => (await db.query("select (select count(*)::int from auth.users) users,(select count(*)::int from public.projects) projects,(select title from public.projects where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') title")).rows[0];
  const expected = await baseline();
  const call = async (paths, output) => {
    const files = (Array.isArray(paths) ? paths : [paths]).flatMap(path => ['-f', path]);
    try { return await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', '5432', '-U', 'postgres', '-d', 'postgres', ...files, ...(output ? ['-o',output] : [])], { env, maxBuffer: 1024 * 1024 }); }
    finally {
      const end = Date.now() + 10000;
      while (server.getStats().activeConnections || db.isInTransaction()) {
        if (Date.now() > end) throw Error('socket disconnect rollback timed out');
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
  };
  const evidence = join(dir, 'combined-result.txt');
  await call([artifacts[3].path, artifacts[4].path], evidence);
  const first = await readFile(evidence, 'utf8');
  assert.match(first, /^COMMIT$/m); assert.match(first, /^ROLLBACK$/m);
  assert.match(first, /STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);
  assert.deepEqual(await baseline(), expected);
  assert.equal((await db.query('select count(*)::int n from public.studio_turns')).rows[0].n, 0);
  await db.exec('drop policy piece_version_metadata_select_owner on public.piece_version_metadata;create policy piece_version_metadata_select_owner on public.piece_version_metadata for select to authenticated using(true)');
  await assert.rejects(() => call(artifacts[4].path), error => /cross-account metadata\/write accepted/.test(error.stderr));
  assert.deepEqual(await baseline(), expected);
  await db.exec("drop policy piece_version_metadata_select_owner on public.piece_version_metadata;create policy piece_version_metadata_select_owner on public.piece_version_metadata for select to authenticated using(exists(select 1 from public.projects p where p.id=piece_version_metadata.project_id and p.owner_id=(select auth.uid())))");
  await db.exec('alter table public.studio_turns add column unexpected text');
  await assert.rejects(() => call(artifacts[4].path), error => /unexpected studio table columns/.test(error.stderr));
  await db.exec('alter table public.studio_turns drop column unexpected');
  await db.exec(`create function auth.unsafe() returns trigger language plpgsql as $$begin return new;end$$;create trigger unsafe before insert on auth.users for each row execute function auth.unsafe()`);
  await assert.rejects(() => call(artifacts[4].path), error => /unexpected table, RLS, trigger, rule, descendant or generated column/.test(error.stderr));
  await db.exec('drop trigger unsafe on auth.users');
  // Built-in expression/partial indexes, used by managed auth schemas, remain
  // valid. Non-catalog callbacks must be refused BEFORE fixtures are inserted.
  await db.exec('alter table auth.users add column email text;create index managed_email_index on auth.users(lower(email)) where email is not null');
  assert.match((await call(artifacts[4].path)).stdout, /STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);
  await db.exec(`create sequence auth.fixture_hook_calls;
   create function auth.fixture_index_hook(v uuid) returns uuid language plpgsql immutable as $$begin perform nextval('auth.fixture_hook_calls');return v;end$$;
   create function auth.fixture_index_predicate(v uuid) returns boolean language plpgsql immutable as $$begin perform nextval('auth.fixture_hook_calls');return true;end$$;
   create function auth.fixture_index_operator(v uuid,w uuid) returns boolean language plpgsql immutable as $$begin perform nextval('auth.fixture_hook_calls');return true;end$$;
   create operator auth.##(leftarg=uuid,rightarg=uuid,function=auth.fixture_index_operator);
   create function auth.fixture_index_compare(v uuid,w uuid) returns integer language plpgsql immutable as $$begin perform nextval('auth.fixture_hook_calls');return pg_catalog.uuid_cmp(v,w);end$$;
   create operator class pg_catalog.fixture_uuid_callbacks for type uuid using btree as
    operator 1 <(uuid,uuid),operator 2 <=(uuid,uuid),operator 3 =(uuid,uuid),operator 4 >=(uuid,uuid),operator 5 >(uuid,uuid),
    function 1 auth.fixture_index_compare(uuid,uuid);`);
  for (const statement of [
    'create index fixture_external_index on auth.users(auth.fixture_index_hook(id))',
    'create index fixture_external_index on auth.users(id) where auth.fixture_index_predicate(id)',
    'create index fixture_external_index on auth.users(id) where id operator(auth.##) id',
    'create index fixture_external_index on auth.users(id pg_catalog.fixture_uuid_callbacks)',
    'create index fixture_external_index on compor_migration_audit.applied(auth.fixture_index_hook(null::uuid))',
  ]) {
    await db.exec(statement);
    await db.exec('alter sequence auth.fixture_hook_calls restart with 1');
    await assert.rejects(() => call(artifacts[4].path), error => /unexpected index callback/.test(error.stderr));
    assert.equal((await db.query('select is_called from auth.fixture_hook_calls')).rows[0].is_called, false);
    assert.deepEqual(await baseline(), expected);
    await db.exec(statement.includes('compor_migration_audit') ? 'drop index compor_migration_audit.fixture_external_index' : 'drop index auth.fixture_external_index');
  }
  await db.exec('drop operator class pg_catalog.fixture_uuid_callbacks using btree;drop operator family pg_catalog.fixture_uuid_callbacks using btree');
  for (const [setup, cleanup] of [
    ["alter table auth.users add column fixture_sequence bigint default nextval('auth.fixture_hook_calls')", 'alter table auth.users drop column fixture_sequence'],
    ["alter table auth.users add constraint fixture_sequence_check check(nextval('auth.fixture_hook_calls')>0)", 'alter table auth.users drop constraint fixture_sequence_check'],
    ["create policy fixture_sequence_policy on public.projects for select to authenticated using(nextval('auth.fixture_hook_calls')>0)", 'drop policy fixture_sequence_policy on public.projects'],
  ]) {
    await db.exec(setup);
    await db.exec('alter sequence auth.fixture_hook_calls restart with 1');
    await assert.rejects(() => call(artifacts[4].path), error => /unexpected identity or volatile default, constraint or policy|unexpected policy relation/.test(error.stderr));
    assert.equal((await db.query('select is_called from auth.fixture_hook_calls')).rows[0].is_called, false);
    await db.exec(cleanup);
  }
  await db.exec('alter table auth.users add column fixture_identity bigint generated by default as identity;alter sequence auth.users_fixture_identity_seq restart with 1');
  await assert.rejects(() => call(artifacts[4].path), error => /unexpected identity or volatile default, constraint or policy/.test(error.stderr));
  assert.equal((await db.query('select is_called from auth.users_fixture_identity_seq')).rows[0].is_called, false);
  await db.exec('alter table auth.users drop column fixture_identity');
  await db.exec('alter table auth.users add column fixture_random uuid default gen_random_uuid()');
  assert.match((await call(artifacts[4].path)).stdout, /STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK/);
  await db.exec('alter table auth.users drop column fixture_random');
  const altered = join(dir, 'snapshot.sql');
  await writeFile(altered, (await readFile(artifacts[4].path, 'utf8')).replace('ROLLBACK;\n', "ROLLBACK;\nUPDATE public.projects SET title='unexpected-after-rollback' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';\n"));
  await assert.rejects(() => call(altered), error => /Post-rollback snapshot changed/.test(error.stdout));
  await db.exec("update public.projects set title='preserve-existing' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'");
  assert.deepEqual(await baseline(), expected);
});

test('wrappers pin TLS/host, clear inherited connection options and reject changed artifacts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-studio-wrappers-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const args = join(dir, 'args'), childEnv = join(dir, 'env'), ca = join(dir, 'ca'), openssl = join(dir, 'openssl'), psql = join(dir, 'psql');
  await writeFile(ca, 'synthetic');
  await writeFile(openssl, "#!/bin/sh\nprintf '%s\\n' 'sha256 Fingerprint=80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'\n"); await chmod(openssl, 0o700);
  await writeFile(psql, `#!/bin/sh\nprintf '%s\\n' "$@" > '${args}'\nenv > '${childEnv}'\nwhile [ "$#" -gt 0 ]; do if [ "$1" = '-o' ]; then shift; output=$1; fi; shift; done\nprintf '%s\\n' COMMIT ROLLBACK STUDIO_RLS_CHECKS_PASSED_AND_ROLLED_BACK > "$output"\n`); await chmod(psql, 0o700);
  const wrapperEnv = { ...env, PATH: `${dir}:${process.env.PATH}`, TMPDIR: dir, PGHOST: 'attacker.invalid', PGOPTIONS: '-c ssl=off', PGPASSWORD: 'synthetic-do-not-inherit' };
  for (const [wrapper, artifact, verify] of [['scripts/apply_studio_test_project.sh', artifacts[3], '--verify'], ['supabase/tests/studio_rls_capture.sh', artifacts[4], '--verify-proof']]) {
    const wrapperArgs = path => verify === '--verify' ? [path,artifacts[4].path,ca] : [path,ca];
    const result = spawnSync('sh', [join(root, wrapper), ...wrapperArgs(artifact.path)], { cwd: root, env: wrapperEnv, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const argv = (await readFile(args, 'utf8')).split('\n'), actualEnv = (await readFile(childEnv, 'utf8')).split('\n');
    assert.ok(argv.includes('db.dpboawdnuxuzjoufpiry.supabase.co')); assert.ok(argv.includes('-W')); assert.ok(argv.includes('ON_ERROR_STOP=1'));
    assert.ok(actualEnv.includes('PGSSLMODE=verify-full')); assert.ok(actualEnv.includes('PGGSSENCMODE=disable')); assert.ok(actualEnv.includes(`PGSSLROOTCERT=${ca}`));
    assert.ok(!actualEnv.some(row => /^(PGHOST|PGOPTIONS|PGPASSWORD)=/.test(row)));
    const changed = join(dir, verify === '--verify' ? 'apply.sql' : 'proof.sql');
    await writeFile(changed, (await readFile(artifact.path, 'utf8')) + '\n-- changed');
    assert.notEqual(spawnSync('python3', ['-B', 'scripts/prepare_studio_migrations.py', verify, changed], { cwd: root, env }).status, 0);
    await rm(args);
    assert.notEqual(spawnSync('sh', [join(root, wrapper), ...wrapperArgs(changed)], { cwd: root, env: wrapperEnv }).status, 0);
    await assert.rejects(() => readFile(args));
  }
  await writeFile(psql, `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = '-o' ]; then shift; output=$1; fi; shift; done\nprintf '%s\\n' COMMIT > "$output"\nexit 3\n`);
  const partial = spawnSync('sh', [join(root, 'scripts/apply_studio_test_project.sh'), artifacts[3].path, artifacts[4].path, ca], { cwd: root, env: wrapperEnv, encoding: 'utf8' });
  assert.notEqual(partial.status, 0); assert.match(partial.stderr, /Migrações já aplicadas.*Não repita a aplicação/);
  await writeFile(openssl, "#!/bin/sh\nprintf '%s\\n' wrong\n");
  assert.notEqual(spawnSync('sh', [join(root, 'scripts/apply_studio_test_project.sh'), artifacts[3].path, artifacts[4].path, ca], { cwd: root, env: wrapperEnv }).status, 0);
});

test.after(async () => { for (const item of artifacts) await rm(new URL('.', `file://${item.path}`).pathname, { recursive: true, force: true }); });
