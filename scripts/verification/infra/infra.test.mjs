import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { defaultRepoRoot, onlyLoopback, verifyMigrations } from './preflight.mjs';
import { FIXTURE_USERS, FIXTURE_OPENAI_KEY } from './stack.mjs';

test('manifest refuses a changed migration instead of reporting the pinned schema', async t => {
  const expected = await verifyMigrations();
  assert.equal(expected.migrations.length, 37);
  const root = await mkdtemp(join(tmpdir(), 'compor-infra-migration-negative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'supabase/migrations'), { recursive: true });
  for (const migration of expected.migrations) await copyFile(join(defaultRepoRoot, 'supabase/migrations', migration.name), join(root, 'supabase/migrations', migration.name));
  await appendFile(join(root, 'supabase/migrations', expected.migrations[0].name), '\n-- divergent candidate\n');
  await assert.rejects(verifyMigrations(root), /migration_digest_mismatch/);
});

test('network precondition rejects an interface able to leave loopback', () => {
  assert.equal(onlyLoopback({ lo: [{ internal: true }] }), true);
  assert.equal(onlyLoopback({ lo: [{ internal: true }], eth0: [{ internal: false }] }), false);
});

test('all unchanged migrations run on the declared fixture and preserve roles, RLS and the fixed Vault RPC', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-infra-sql-'));
  let db = new PGlite(directory);
  t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }); });
  await db.exec('create database compor_verify');
  await db.close();
  db = new PGlite(directory, { database: 'compor_verify', username: 'postgres' });
  const baseline = await readFile(new URL('./baseline.sql', import.meta.url), 'utf8');
  await assert.rejects(db.exec(baseline), /refusing non-empty or unguarded/);
  const inventory = await verifyMigrations();
  const sources = [];
  for (const migration of inventory.migrations) sources.push(await readFile(join(defaultRepoRoot, 'supabase/migrations', migration.name), 'utf8'));
  await db.exec("begin; set local compor.verification_baseline='synthetic-offline-v1';\n" + baseline + '\n' + sources.join('\n') + '\ncommit;');
  await db.query('insert into auth.users(id) values ($1),($2)', [FIXTURE_USERS.alice, FIXTURE_USERS.bob]);
  await db.query('insert into vault.synthetic_secrets(name,decrypted_secret) values ($1,$2)', ['COMPOR_CIN_OPENAI', FIXTURE_OPENAI_KEY]);
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: FIXTURE_USERS.alice })]);
  const project = (await db.query("insert into public.projects(title) values ('Synthetic isolation') returning id,owner_id")).rows[0];
  assert.equal(project.owner_id, FIXTURE_USERS.alice);
  const post = '33333333-3333-4333-8333-333333333333';
  const created = (await db.query('select public.create_project_post($1,$2,$3) as value', [project.id, post, 'Synthetic post'])).rows[0].value;
  assert.equal(created.status, 'created');
  const content = { headline: '', price: '', date: '', caption: 'Synthetic', captionOrigin: 'user' };
  const version = (await db.query('select public.save_piece_version($1,$2,0,$3::jsonb) as value', [project.id, post, JSON.stringify(content)])).rows[0].value;
  assert.equal(version.status, 'saved');
  const storagePath = `${FIXTURE_USERS.alice}/${project.id}/${post}/1/44444444-4444-4444-8444-444444444444.png`;
  await db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)", [storagePath]);
  assert.equal((await db.query('select name from storage.objects')).rows[0].name, storagePath);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: FIXTURE_USERS.bob })]);
  assert.deepEqual((await db.query('select * from public.projects')).rows, []);
  assert.deepEqual((await db.query('select * from public.project_posts')).rows, []);
  assert.deepEqual((await db.query('select * from storage.objects')).rows, []);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)", [storagePath]), error => error.code === '42501');
  const denied = (await db.query('select public.create_project_post($1,$2,$3) as value', [project.id, post, 'Intrusion'])).rows[0].value;
  assert.equal(denied.status, 'not_found');
  await assert.rejects(db.query('select public.compor_default_openai_key()'), error => error.code === '42501');
  await db.exec('reset role; set role service_role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  assert.equal((await db.query('select public.compor_default_openai_key() as key')).rows[0].key, FIXTURE_OPENAI_KEY);
  await assert.rejects(db.query('select * from vault.decrypted_secrets'), error => error.code === '42501');
  await assert.rejects(db.query('select * from public.projects'), error => error.code === '42501');
});
