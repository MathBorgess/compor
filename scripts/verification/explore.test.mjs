import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { serveExploration } from './explore.mjs';
import { sendControl } from './client-control.mjs';

const baseGoal = JSON.parse(await readFile(new URL('./goals/G01.json', import.meta.url), 'utf8'));

async function start(t, budgets = {}, callbacks = {}, contextOverrides = {}) {
  const runDir = await mkdtemp(join(tmpdir(), 'ce-'));
  const socketPath = join(runDir, 's');
  const goal = structuredClone(baseGoal);
  goal.budgets = { ...goal.budgets, wallTimeMs: 10_000, ...budgets };
  const calls = [];
  const ctx = { runDir, actorA: goal.initialState.accounts[0], actorB: goal.initialState.accounts[1], fixture: { ledger: [] }, origin: 'http://127.0.0.1:3000', newId: randomUUID,
    request: async (...args) => { calls.push(args); return { status: 503, body: { error: 'fixture_unavailable' } }; },
    readBytes: async () => { throw Error('unused'); }, query: async () => [],
    ...contextOverrides,
  };
  const service = serveExploration(ctx, { goal, runId: 'test-run', socketPath, ...callbacks });
  service.catch(() => {});
  const send = value => sendControl({ runId: 'test-run', ...value }, { socketPath, timeoutMs: 1000 });
  t.after(async () => {
    await send({ action: 'close' }).catch(() => {});
    await service;
    await rm(runDir, { recursive: true, force: true });
  });
  const deadline = Date.now() + 2000;
  while (true) {
    try { await readFile(join(runDir, 'control-ready.json')); break; }
    catch { if (Date.now() > deadline) throw Error('control_not_ready'); await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  return { send, service, runDir, calls };
}

test('unknown actions, foreign scope and hidden identity arguments never reach the app', async t => {
  const run = await start(t);
  assert.equal((await run.send({ action: 'delete-database' })).body.error, 'unknown_action');
  assert.equal((await run.send({ action: 'inspect', runId: 'different-run' })).status, 403);
  const mutation = { action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'Synthetic', actor: 'other-account' } };
  assert.equal((await run.send(mutation)).body.error, 'invalid_arguments');
  assert.equal(run.calls.length, 0);
  const status = await run.send({ action: 'inspect' });
  assert.equal(status.body.state.result, 'not_evaluated');
  assert.equal(status.body.state.usage.modelTokens, null);
  const closed = await run.send({ action: 'close' });
  assert.equal(closed.body.closing, true);
  const result = await run.service;
  assert.deepEqual(result.observations.providerLedger.final, []);
});

test('stable request IDs prevent repeat after an unavailable response and conflicting reuse fails', async t => {
  const run = await start(t);
  const command = { action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'Synthetic' } };
  const first = await run.send(command), replay = await run.send(command);
  assert.equal(first.status, 503);
  assert.equal(first.body.ok, false);
  assert.equal(replay.body.replayed, true);
  assert.equal(run.calls.length, 1);
  const conflict = await run.send({ ...command, args: { title: 'Changed' } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'request_id_conflict');
  const stale = await run.send({ ...command, requestId: randomUUID(), expectedRevision: 1 });
  assert.equal(stale.body.error, 'context_changed');
  assert.equal(run.calls.length, 1);
});

test('exhausting the mutation budget closes the run and preserves evidence', async t => {
  const run = await start(t, { actions: 1 });
  await run.send({ action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'First' } });
  const rejected = await run.send({ action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'Second' } });
  assert.equal(rejected.status, 429);
  const result = await run.service;
  assert.equal(run.calls.length, 1);
  assert.equal(result.errors[0].message, 'budget_exhausted');
  const transcript = await readFile(join(run.runDir, 'exploration-transcript.jsonl'), 'utf8');
  assert.match(transcript, /"type":"action"/);
  assert.match(transcript, /"reason":"budget_exhausted"/);
});

test('invalid requests also consume the request budget', async t => {
  const run = await start(t, { requests: 2 });
  await run.send({ action: 'unknown-one' });
  await run.send({ action: 'unknown-two' });
  assert.equal((await run.send({ action: 'unknown-three' })).status, 429);
  const result = await run.service;
  assert.equal(result.errors[0].message, 'budget_exhausted');
  assert.equal(run.calls.length, 0);
});

test('credential-shaped strings are rejected without being copied to the transcript', async t => {
  const run = await start(t);
  const secret = 'sk-this_is_a_synthetic_credential_canary';
  const result = await run.send({ action: 'create-turn', requestId: randomUUID(), expectedRevision: 0, args: { message: secret } });
  assert.equal(result.body.error, 'credentials_not_accepted');
  await run.send({ action: 'close' });
  await run.service;
  assert.equal((await readFile(join(run.runDir, 'exploration-transcript.jsonl'), 'utf8')).includes(secret), false);
});

test('supervisor limits account for controls and stop before another app operation', async t => {
  const calls = [];
  const run = await start(t, {}, { onControl(kind) { calls.push(kind); if (kind === 'actions') throw Error('budget_exhausted:actions'); } });
  await run.send({ action: 'inspect' });
  const reply = await run.send({ action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'Synthetic' } });
  assert.equal(reply.status, 429);
  assert.deepEqual(calls, ['requests', 'requests', 'actions']);
  assert.equal(run.calls.length, 0);
  assert.equal((await run.service).errors[0].message, 'budget_exhausted:actions');
});

async function withSelectedPost(t, { failSnapshot = false } = {}) {
  const projectId = randomUUID(), pieceId = randomUUID();
  // offerFacts is optional in persisted StudioState. A selected draft does not
  // imply that any offer fact was declared.
  const state = { revision: 2, workflow: { phase: 'context' }, selection: { pieceId, baseVersion: 1 } };
  const draft = { pieceId, baseVersion: 1, content: { caption: 'Preserved caption.' } };
  let closed = false;
  const driver = {
    getState() { if (closed && failSnapshot) throw Error('final_state_unavailable'); return state; },
    async flush() {},
    close() { closed = true; },
  };
  const run = await start(t, {}, {
    loadProductModules: async () => ({ createFileStudioDriver: async () => driver, getCurrentDraft: () => draft }),
  }, { request: async () => ({ status: 201, body: { project: { id: projectId } } }) });
  const created = await run.send({ action: 'create-project', requestId: randomUUID(), expectedRevision: 0, args: { title: 'Post without offer facts' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.state.selectedPost.pieceId, pieceId);
  return { ...run, pieceId };
}

test('closing a selected post without offerFacts completes and records empty fact lists', async t => {
  const run = await withSelectedPost(t);
  assert.equal((await run.send({ action: 'close' })).status, 200);
  const result = await run.service;
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.observations.controller.reopened, {
    pieceId: run.pieceId, baseVersion: 1, content: { caption: 'Preserved caption.' }, facts: [], suggestedFacts: [],
  });
  const summary = JSON.parse(await readFile(join(run.runDir, 'exploration-summary.json'), 'utf8'));
  assert.equal(summary.reason, 'closed_by_client');
  assert.equal(summary.selectedPost.pieceId, run.pieceId);
  assert.match(await readFile(join(run.runDir, 'exploration-transcript.jsonl'), 'utf8'), /"type":"closed"/);
  await assert.rejects(() => run.send({ action: 'inspect' }));
});

test('failure to read the final snapshot remains evidence and still closes the service', async t => {
  const run = await withSelectedPost(t, { failSnapshot: true });
  assert.equal((await run.send({ action: 'close' })).status, 200);
  const result = await run.service;
  assert.deepEqual(result.errors, [{ stage: 'exploration-snapshot', message: 'final_state_unavailable' }]);
  const summary = JSON.parse(await readFile(join(run.runDir, 'exploration-summary.json'), 'utf8'));
  assert.equal(summary.reason, 'closed_by_client');
  assert.equal(summary.stateUnavailable, true);
  assert.equal(summary.result, 'not_evaluated');
  assert.deepEqual(result.observations.providerLedger.final, []);
  await assert.rejects(() => run.send({ action: 'inspect' }));
});
