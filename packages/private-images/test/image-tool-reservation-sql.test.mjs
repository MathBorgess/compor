import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111', bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = '22222222-2222-4222-8222-222222222222', piece = '33333333-3333-4333-8333-333333333333', attempt = '44444444-4444-4444-8444-444444444444';
const args = [project, piece, 1, attempt, 'sess_123', 'turn_123', 'call_123'];
const reserve = 'select * from public.reserve_image_tool_call($1,$2,$3,$4,$5,$6,$7)';

test('reserva isolada deduplica chamada e preserva estado desconhecido', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to public; grant execute on function auth.uid() to public;
  `);
  for (const file of ['20261103000000_projects.sql', '20261103000001_piece_versions.sql', '20261103000002_agent_attempts.sql', '20261103000004_image_tool_reservations.sql']) {
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1),($2)', [alice, bob]);
  await db.query('insert into public.projects(id,owner_id,title) values($1,$2,$3)', [project, alice, 'Oficina']);
  await db.query('insert into public.piece_versions(project_id,piece_id,version,content) values($1,$2,1,\'{}\'::jsonb)', [project, piece]);
  await db.query('insert into public.piece_versions(project_id,piece_id,version,content) values($1,$2,2,\'{}\'::jsonb)', [project, piece]);
  await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key) values($1,$2,$3,$4)', [attempt, alice, project, '55555555-5555-4555-8555-555555555555']);
  const otherProject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherPiece = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', otherAttempt = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.query('insert into public.projects(id,owner_id,title) values($1,$2,$3)', [otherProject, bob, 'Outro']);
  await db.query('insert into public.piece_versions(project_id,piece_id,version,content) values($1,$2,1,\'{}\'::jsonb)', [otherProject, otherPiece]);
  await db.query('insert into public.agent_attempts(id,owner_id,project_id,idempotency_key) values($1,$2,$3,$4)', [otherAttempt, bob, otherProject, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false)`);
  const results = await Promise.all(Array.from({ length: 5 }, () => db.query(reserve, args)));
  assert.equal(results.filter(result => result.rows[0].is_new).length, 1);
  assert.ok(results.every(result => result.rows[0].state === 'reserved'));
  await assert.rejects(() => db.query(reserve, [project, piece, 2, attempt, 'sess_123', 'turn_123', 'call_123']));
  await assert.rejects(() => db.query('update public.image_tool_reservations set state=\'unknown\''));
  const otherCall = [project, piece, 1, attempt, 'sess_123', 'turn_123', 'call_other'];
  assert.equal((await db.query(reserve, otherCall)).rows[0].is_new, true);
  const unknown = await db.query('select public.mark_image_tool_call_unknown($1,$2,$3,$4)', [project, 'sess_123', 'turn_123', 'call_123']);
  assert.equal(unknown.rows[0].mark_image_tool_call_unknown, true);
  await db.query("select public.finish_agent_attempt($1,$2,'unknown')", [project, attempt]);
  await assert.rejects(() => db.query(reserve, [project, piece, 1, attempt, 'sess_123', 'turn_123', 'call_new']));
  const reservedBeforeFinish = (await db.query(reserve, otherCall)).rows[0];
  assert.equal(reservedBeforeFinish.is_new, false); assert.equal(reservedBeforeFinish.state, 'reserved');
  const duplicate = await db.query(reserve, args);
  assert.equal(duplicate.rows[0].is_new, false); assert.equal(duplicate.rows[0].state, 'unknown');
  await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
  assert.equal((await db.query('select * from public.image_tool_reservations')).rows.length, 0);
  await assert.rejects(() => db.query(reserve, args));
  await assert.rejects(() => db.query(reserve, [otherProject, otherPiece, 1, otherAttempt, 'sess_123', 'turn_123', 'call_123']));
  await assert.rejects(() => db.query('select public.mark_image_tool_call_unknown($1,$2,$3,$4)', [project, 'sess_123', 'turn_123', 'call_123']));
});
