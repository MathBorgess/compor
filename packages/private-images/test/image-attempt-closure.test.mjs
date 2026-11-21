import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const otherProject = '33333333-3333-4333-8333-333333333333';
const piece = '44444444-4444-4444-8444-444444444444';
const attempt = '55555555-5555-4555-8555-555555555555';
const firstReservation = '66666666-6666-4666-8666-666666666666';
const secondReservation = '77777777-7777-4777-8777-777777777777';
const session = 'sess_fixture';
const turn = 'turn_fixture';

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.projects (id uuid primary key, owner_id uuid not null, title text not null, deleted_at timestamptz);
    create table public.agent_attempts (id uuid primary key, owner_id uuid, project_id uuid, state text);
    create table public.image_tool_reservations (
      id uuid primary key, owner_id uuid, project_id uuid, piece_id uuid, piece_version integer,
      agent_attempt_id uuid, session_id text, turn_id text, call_id text, state text
    );
    create table public.image_consent_declarations (reservation_id uuid, owner_id uuid);
    create table public.image_tool_executions (
      id uuid primary key default gen_random_uuid(), owner_id uuid not null, reservation_id uuid not null unique,
      asset_id uuid not null default gen_random_uuid(),
      state text not null default 'running' constraint image_tool_executions_state_check check (state in ('running','unknown','completed','quality_held')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.exploration_images (
      id uuid primary key, owner_id uuid not null, project_id uuid not null, state text not null,
      batch_id uuid, batch_position integer, quality_reason text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint exploration_images_state_check check (state in ('running','unknown','completed','rejected','closed_unknown','quality_held'))
    );
    create table public.project_posts (project_id uuid, piece_id uuid, deleted_at timestamptz);
    create table public.foreground_image_waits (owner_id uuid primary key, reservation_id uuid, expires_at timestamptz);
    create table public.exploration_planning_attempts (owner_id uuid, project_id uuid, state text);
    create table public.exploration_rejection_proofs (image_id uuid, owner_id uuid, project_id uuid, digest text);
    create function public.complete_image_tool_execution(p_execution_id uuid) returns boolean
    language plpgsql as $$
    declare v_state text;
    begin
      select state into v_state from public.image_tool_executions where id = p_execution_id;
      if v_state not in ('running','completed') then raise exception 'execution unavailable' using errcode = '42501'; end if;
      return true;
    end $$;
  `);
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261119000045_image_attempt_closure.sql', import.meta.url), 'utf8'));
  await db.query('insert into public.projects(id,owner_id,title) values ($1,$2,$3),($4,$2,$5)', [project, alice, 'Oficina Norte', otherProject, 'Outro projeto']);
  await db.query('insert into public.agent_attempts(id,owner_id,project_id,state) values ($1,$2,$3,$4)', [attempt, alice, project, 'started']);
  await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false)`);
  return db;
}

function reservation(id, call) {
  return [id, alice, project, piece, 1, attempt, session, turn, call, 'reserved'];
}

test('400, 429 e 5xx não travam a conta e o pedido encerrado não é reenviado', async () => {
  const db = await database();
  const cases = [
    ['call_400', 'provider_rejected_400', 'failure'],
    ['call_429', 'provider_rejected_429', 'retryable'],
    ['call_500', 'result_unknown', 'retryable'],
  ];
  for (const [call, reason, outcome] of cases) {
    const reservationId = crypto.randomUUID();
    await db.query('insert into public.image_tool_reservations values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', reservation(reservationId, call));
    await db.query('insert into public.image_consent_declarations values ($1,$2)', [reservationId, alice]);
    const claim = (await db.query('select * from public.claim_image_tool_execution($1)', [reservationId])).rows[0];
    assert.equal(claim.is_new, true);
    assert.equal(claim.state, 'running');
    const before = (await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count;
    assert.equal((await db.query('select public.fail_image_tool_execution($1,$2,$3)', [claim.execution_id, reason, outcome])).rows[0].fail_image_tool_execution, true);
    const row = (await db.query('select state, closure_reason, provider_outcome from public.image_tool_executions where id=$1', [claim.execution_id])).rows[0];
    assert.deepEqual(row, { state: 'failed', closure_reason: reason, provider_outcome: outcome });
    assert.equal((await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count, before);
    await assert.rejects(() => db.query('select public.complete_image_tool_execution($1)', [claim.execution_id]));
    const replay = (await db.query('select * from public.claim_image_tool_execution($1)', [reservationId])).rows[0];
    assert.equal(replay.is_new, false);
    assert.equal(replay.execution_id, claim.execution_id);
  }
  await db.query('insert into public.image_tool_reservations values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', reservation(secondReservation, 'call_next'));
  await db.query('insert into public.image_consent_declarations values ($1,$2)', [secondReservation, alice]);
  const next = (await db.query('select * from public.claim_image_tool_execution($1)', [secondReservation])).rows[0];
  assert.equal(next.is_new, true);
  assert.notEqual(next.execution_id, null);
  await db.close();
});

test('timeout continua incerto até o encerramento e a morte no meio libera sem nova execução', async () => {
  const db = await database();
  await db.query('insert into public.image_tool_reservations values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', reservation(firstReservation, 'call_timeout'));
  await db.query('insert into public.image_consent_declarations values ($1,$2)', [firstReservation, alice]);
  const running = (await db.query('select * from public.claim_image_tool_execution($1)', [firstReservation])).rows[0];
  assert.equal((await db.query('select public.mark_image_tool_execution_unknown($1)', [running.execution_id])).rows[0].mark_image_tool_execution_unknown, true);
  await db.query('insert into public.image_tool_reservations values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', reservation(secondReservation, 'call_after_timeout'));
  await db.query('insert into public.image_consent_declarations values ($1,$2)', [secondReservation, alice]);
  assert.equal((await db.query('select * from public.claim_image_tool_execution($1)', [secondReservation])).rows[0].state, 'blocked');
  const before = (await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count;
  assert.equal((await db.query('select public.close_unconfirmed_image_work()')).rows[0].close_unconfirmed_image_work, 'closed');
  assert.equal((await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count, before);
  assert.equal((await db.query('select state from public.image_tool_executions where id=$1', [running.execution_id])).rows[0].state, 'failed');
  const resumed = (await db.query('select * from public.claim_image_tool_execution($1)', [secondReservation])).rows[0];
  assert.equal(resumed.is_new, true);
  assert.notEqual(resumed.execution_id, running.execution_id);

  await db.query("update public.image_tool_executions set state='running', closure_reason=null, provider_outcome=null, lease_expires_at=clock_timestamp() - interval '1 minute' where id=$1", [running.execution_id]);
  const status = (await db.query(
    'select public.image_tool_wait_status($1,$2,$3,$4,$5,$6,$7) as value',
    [project, piece, 1, attempt, session, turn, 'call_after_timeout'],
  )).rows[0].value;
  assert.notEqual(status, 'waiting_image');
  assert.equal((await db.query('select state from public.image_tool_executions where id=$1', [running.execution_id])).rows[0].state, 'unknown');
  const countBeforeClose = (await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count;
  assert.equal((await db.query('select public.close_unconfirmed_image_work()')).rows[0].close_unconfirmed_image_work, 'closed');
  assert.equal((await db.query('select count(*)::int as count from public.image_tool_executions')).rows[0].count, countBeforeClose);
  assert.equal((await db.query('select public.close_unconfirmed_image_work()')).rows[0].close_unconfirmed_image_work, 'already_closed');
  await db.close();
});

test('uma execução dentro do prazo não é encerrada e outro projeto informa o nome', async () => {
  const db = await database();
  await db.query('insert into public.image_tool_reservations values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', reservation(firstReservation, 'call_live'));
  await db.query('insert into public.image_consent_declarations values ($1,$2)', [firstReservation, alice]);
  const live = (await db.query('select * from public.claim_image_tool_execution($1)', [firstReservation])).rows[0];
  assert.equal((await db.query('select public.close_unconfirmed_image_work()')).rows[0].close_unconfirmed_image_work, 'already_closed');
  assert.equal((await db.query('select state from public.image_tool_executions where id=$1', [live.execution_id])).rows[0].state, 'running');
  const hold = (await db.query('select public.image_account_hold($1) as value', [otherProject])).rows[0].value;
  assert.equal(hold.screen, 'running_with_lease');
  assert.equal(hold.sameProject, false);
  assert.equal(hold.projectTitle, 'Oficina Norte');
  await db.close();
});
