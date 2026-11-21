import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const project = '22222222-2222-4222-8222-222222222222';
const otherProject = '33333333-3333-4333-8333-333333333333';
const piece = '44444444-4444-4444-8444-444444444444';
const secret = 'a'.repeat(64);
const proof = createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
const unavailable = error => error.code === '42501';

async function database(t) {
  const directory = await mkdtemp(join(tmpdir(), 'compor-closure-'));
  let db = new PGlite(directory);
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  await db.exec('create database compor_verify');
  await db.close();
  db = new PGlite(directory, { database: 'compor_verify', username: 'postgres' });
  const baseline = await readFile(new URL('../../../scripts/verification/infra/baseline.sql', import.meta.url), 'utf8');
  const migrations = new URL('../../../supabase/migrations/', import.meta.url);
  const names = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
  const sources = await Promise.all(names.map(name => readFile(new URL(name, migrations), 'utf8')));
  await db.exec("begin; set local compor.verification_baseline='synthetic-offline-v1';\n" + baseline + '\n' + sources.join('\n') + '\ncommit;');
  await db.query('insert into auth.users(id) values ($1),($2)', [alice, bob]);
  await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Oficina Norte'),($3,$2,'Outro projeto')", [project, alice, otherProject]);
  await db.query("insert into public.piece_versions(project_id,piece_id,version,content) values($1,$2,1,'{}'),($3,$2,1,'{}')", [project, piece, otherProject]);
  await authenticate(db, alice);
  return db;
}

async function authenticate(db, user) {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'authenticated', sub: user })]);
}

async function reserve(db, call, target = project) {
  const request = randomUUID();
  const turn = 'turn_' + call;
  const { result } = (await db.query('select public.reserve_studio_turn($1,$2,$3) as result', [target, request, proof])).rows[0];
  assert.equal(result.status, 'reserved');
  const attempt = result.turn.attempt_id;
  await db.query("select public.set_studio_turn_state($1,$2,'action_required',$3)", [target, request, turn]);
  const { reservation_id: id } = (await db.query('select * from public.reserve_image_tool_call($1,$2,1,$3,$4,$5,$6)', [target, piece, attempt, 'sess_fixture', turn, 'call_' + call])).rows[0];
  await db.query('select * from public.declare_image_generation_consent($1,true)', [id]);
  await db.query("select public.start_usage_measurement_v3($1,$2,'agent',$2,'gpt-6.1-terra')", [target, attempt]);
  return { id, request, target, attempt };
}

const claim = async (db, reservation) =>
  (await db.query('select * from public.claim_post_image_execution_proven($1,$2)', [reservation.id, proof])).rows[0];
const close = async (db, target = project) =>
  (await db.query('select public.close_unconfirmed_image_work($1) as result', [target])).rows[0].result;
const confirm = async (db, reservation) =>
  (await db.query('select public.confirm_closed_image_attempt($1,$2) as result', [reservation.target, reservation.request])).rows[0].result;

test('recusas autenticadas por prova liquidam o turno e não despacham a mesma reserva duas vezes', async t => {
  const db = await database(t);
  const cases = [
    ['bad_request', 'provider_rejected_400', 'failure'],
    ['rate_limited', 'provider_rejected_429', 'retryable'],
    ['provider_error', 'result_unknown', 'retryable'],
  ];
  for (const [call, reason, outcome] of cases) {
    const reservation = await reserve(db, call);
    const execution = await claim(db, reservation);
    assert.equal(execution.is_new, true);
    const params = [execution.execution_id, secret, reason, outcome];
    const fail = 'select public.fail_image_tool_execution($1,$2,$3,$4) as result';
    await assert.rejects(db.query(fail, [execution.execution_id, 'b'.repeat(64), reason, outcome]), unavailable);
    await assert.rejects(db.query(fail, [execution.execution_id, secret, null, outcome]), error => error.code === '22023');
    assert.equal((await db.query(fail, params)).rows[0].result, true);
    assert.equal((await db.query(fail, params)).rows[0].result, true);
    assert.equal(await confirm(db, reservation), 'failed_image_attempt');
    assert.equal((await db.query('select state from public.agent_attempts where id=$1', [reservation.attempt])).rows[0].state, 'unknown');
    assert.equal((await db.query("select state from public.usage_measurements where part='agent' and part_id=$1", [reservation.attempt])).rows[0].state, 'unknown');
    await assert.rejects(db.query('select public.complete_image_tool_execution($1)', [execution.execution_id]), unavailable);
    const replay = await claim(db, reservation);
    assert.equal(replay.is_new, false);
    assert.equal(replay.execution_id, execution.execution_id);
    assert.equal(replay.state, 'failed');
  }
});

test('prazo ativo e escopo do projeto protegem o trabalho; só a prova permite encerrar uma incerteza recente', async t => {
  const db = await database(t);
  const reservation = await reserve(db, 'timeout');
  const execution = await claim(db, reservation);
  const id = execution.execution_id;
  assert.equal(await close(db), 'already_closed');
  await assert.rejects(db.query('select public.mark_image_tool_execution_unknown($1)', [id]), unavailable);
  await assert.rejects(db.query('select public.mark_image_tool_execution_unknown($1,$2)', [id, 'b'.repeat(64)]), unavailable);
  assert.equal((await db.query('select public.image_account_hold($1) as result', [otherProject])).rows[0].result.projectTitle, 'Oficina Norte');
  await authenticate(db, bob);
  await assert.rejects(db.query('select public.mark_image_tool_execution_unknown($1,$2)', [id, secret]), unavailable);
  await assert.rejects(close(db), unavailable);
  assert.equal(await confirm(db, reservation), 'unverified');
  await authenticate(db, alice);
  assert.equal((await db.query('select public.mark_image_tool_execution_unknown($1,$2) as result', [id, secret])).rows[0].result, true);
  const next = await reserve(db, 'other', otherProject);
  assert.equal((await claim(db, next)).state, 'blocked');
  assert.equal(await close(db, otherProject), 'already_closed');
  assert.equal(await close(db), 'closed');
  assert.equal(await close(db), 'already_closed');
  assert.equal(await confirm(db, reservation), 'failed_image_attempt');
  const retry = await claim(db, next);
  assert.equal(retry.is_new, true);
  assert.notEqual(retry.execution_id, id);
});

test('lease expirado vira incerto, e a passagem do prazo liquida apenas sem PNG armazenado', async t => {
  const db = await database(t);
  const reservation = await reserve(db, 'expired');
  const execution = await claim(db, reservation);
  await db.exec('reset role');
  await db.query("update public.image_tool_executions set lease_expires_at=clock_timestamp() - interval '1 second' where id=$1", [execution.execution_id]);
  await authenticate(db, alice);
  assert.equal((await db.query('select public.image_account_hold($1) as result', [project])).rows[0].result.screen, 'result_unknown');
  await db.exec('reset role');
  await db.query("update public.image_tool_executions set unconfirmed_expires_at=clock_timestamp()-interval '1 second' where id=$1", [execution.execution_id]);
  await authenticate(db, alice);
  assert.equal((await db.query('select public.image_account_hold($1) as result', [project])).rows[0].result.screen, 'none');
  assert.equal(await confirm(db, reservation), 'failed_image_attempt');

  const retry = await reserve(db, 'stored');
  const stored = await claim(db, retry);
  await db.query("insert into storage.objects(bucket_id,name) values ('compor-project-images',$1)", [alice + '/' + project + '/' + piece + '/1/' + stored.asset_id + '.png']);
  await db.query('select public.mark_image_tool_execution_unknown($1,$2)', [stored.execution_id, secret]);
  assert.equal(await close(db), 'already_closed');
  assert.equal(await confirm(db, retry), 'unverified');
  assert.equal((await db.query('select public.complete_image_tool_execution($1) as result', [stored.execution_id])).rows[0].result, true);
});
