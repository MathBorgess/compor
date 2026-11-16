import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { digestJson, sha256, validateManifest } from './contracts.mjs';
import { evaluate } from './evaluate.mjs';

const fixtureGoal = JSON.parse(await readFile(new URL('./goals/G02.json', import.meta.url), 'utf8'));
const appRevision = 'a'.repeat(40), snapshotDigest = 'b'.repeat(64), suiteDigest = 'c'.repeat(64);

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'compor-goal-evaluator-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = Buffer.from('synthetic private image bytes');
  const observations = {
    http: { readProjectAsB: { status: 404 }, writeProjectAsB: { status: 404 }, readAssetAsB: { status: 404 }, concurrentFirst: { status: 200, body: { status: 'completed' } }, concurrentSecond: { status: 409, body: { status: 'busy' } } },
    db: { beforeAttack: { projects: [{ id: 'project-a' }], assets: [{ id: 'asset-a' }] }, afterAttack: { projects: [{ id: 'project-a' }], assets: [{ id: 'asset-a' }] }, reservationRows: [{ id: 'reservation-one' }] },
    providerLedger: { reservationDispatches: [{ id: 'dispatch-one' }] }, files: { ownerImageSha256: sha256(bytes) },
  };
  const manifest = {
    schemaVersion: 'run/v1', runId: 'run-one', goalId: fixtureGoal.id, goalRevision: fixtureGoal.revision,
    goalDigest: digestJson(fixtureGoal), suiteDigest, appRevision, snapshotDigest, profile: 'offline', status: 'completed',
    budgets: { ...fixtureGoal.budgets }, usage: { actions: 12, requests: 24, wallTimeMs: 50, cycles: 1, candidates: 1, concurrency: 1, modelTokens: null, modelCostUsd: null },
    startedAt: '2026-11-16T12:00:00.000Z', endedAt: '2026-11-16T12:00:00.050Z', artifacts: [],
  };
  const options = { goal: fixtureGoal, expectedGoalDigest: manifest.goalDigest, expectedSuiteDigest: suiteDigest, expectedAppRevision: appRevision, expectedSnapshotDigest: snapshotDigest, expectedRunId: manifest.runId };
  async function save() {
    const serialized = JSON.stringify(observations);
    await writeFile(join(dir, 'observations.json'), serialized);
    await writeFile(join(dir, 'owner-image.bin'), bytes);
    manifest.artifacts = [{ id: 'observations', kind: 'observations', path: 'observations.json', sha256: sha256(serialized) }, { id: 'owner-image', kind: 'file', path: 'owner-image.bin', sha256: sha256(bytes) }];
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
  }
  await save();
  return { dir, observations, manifest, options, save };
}

test('independent checks pass only with all observations and actual image bytes', async t => {
  const run = await fixture(t);
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.status, 'atendido');
  assert.equal(report.passed, true);
  assert.equal(report.criteria.length, fixtureGoal.criteria.length);
  assert.deepEqual(report.modelUsage, { tokens: null, costUsd: null });
});

test('missing observation is inconclusive instead of accepting a success claim', async t => {
  const run = await fixture(t);
  delete run.observations.db.reservationRows;
  await run.save();
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.passed, false);
  assert.equal(report.criteria.find(criterion => criterion.id === 'G02.reservation-exclusive').status, 'inconclusivo');
});

test('cross-account access is a violation, including after the execution exhausts its budget', async t => {
  const run = await fixture(t);
  run.observations.http.readProjectAsB.status = 200;
  run.manifest.status = 'exhausted';
  run.manifest.usage.actions = run.manifest.budgets.actions;
  await run.save();
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.status, 'violado');
  assert.equal(report.completion.complete, false);
  assert.equal(report.criteria.find(criterion => criterion.id === 'G02.cross-account-denied').status, 'violado');
});

test('budget exhaustion and silently exceeding a limit never pass', async t => {
  const run = await fixture(t);
  run.manifest.status = 'exhausted';
  await run.save();
  assert.equal((await evaluate(run.dir, run.options)).status, 'inconclusivo');
  run.manifest.status = 'completed';
  run.manifest.usage.requests = run.manifest.budgets.requests + 1;
  await run.save();
  assert.equal((await evaluate(run.dir, run.options)).passed, false);
});

test('an unavailable concurrent request cannot masquerade as proven mutual exclusion', async t => {
  const run = await fixture(t);
  run.observations.http.concurrentSecond = { status: 503, body: { error: 'unavailable' } };
  await run.save();
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.criteria.find(criterion => criterion.id === 'G02.reservation-exclusive').status, 'violado');
});

test('a scenario error prevents success even when the observations gathered so far pass', async t => {
  const run = await fixture(t);
  run.observations.errors = [{ stage: 'final-reopen', message: 'connection_lost' }];
  await run.save();
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.passed, false);
  assert.equal(report.status, 'inconclusivo');
  assert.equal(report.criteria.every(criterion => criterion.status === 'atendido'), true);
});

test('unknown product outcome can satisfy safety, but successful replay cannot', async t => {
  const run = await fixture(t);
  const goal = JSON.parse(await readFile(new URL('./goals/G03.json', import.meta.url), 'utf8'));
  const persisted = [{ id: 'persisted-operation', state: 'completed' }], unknown = [{ id: 'unknown-operation', state: 'unknown' }];
  for (const key of Object.keys(run.observations)) delete run.observations[key];
  Object.assign(run.observations, {
    http: { persistedReplyLost: { status: 502 }, persistedReopen: { status: 200 }, persistedReplay: { status: 200, body: { status: 'completed' } }, providerReplyLost: { status: 502 }, unknownReopen: { status: 200 }, unknownReplay: { status: 409, body: { status: 'unknown' } }, unknownNewRequest: { status: 409, body: { status: 'blocked' } } },
    db: { persistedBeforeReopen: persisted, persistedAfterReopen: persisted, unknownBeforeReopen: unknown, unknownAfterReopen: unknown, unknownAssets: [] },
    controller: { persistedReopened: { operationId: 'persisted-operation', status: 'completed' }, providerLostAfterReopen: { status: 'unknown' } },
    providerLedger: { persistedBeforeReopen: [{ id: 'dispatch-one' }], persistedAfterReopen: [{ id: 'dispatch-one' }], unknownBeforeReopen: [{ id: 'dispatch-two' }], unknownAfterReopen: [{ id: 'dispatch-two' }] },
  });
  run.manifest.goalId = goal.id; run.manifest.goalRevision = goal.revision; run.manifest.goalDigest = digestJson(goal);
  const options = { ...run.options, goal, expectedGoalDigest: run.manifest.goalDigest };
  await run.save();
  assert.equal((await evaluate(run.dir, options)).status, 'atendido');
  run.observations.http.unknownReplay = { status: 200, body: { status: 'completed' } };
  await run.save();
  const report = await evaluate(run.dir, options);
  assert.equal(report.criteria.find(criterion => criterion.id === 'G03.no-repeat-after-unknown').status, 'violado');
});

test('a missing file and a changed file hash both prevent approval', async t => {
  const run = await fixture(t);
  await rm(join(run.dir, 'owner-image.bin'));
  let report = await evaluate(run.dir, run.options);
  assert.equal(report.passed, false);
  assert.equal(report.integrity.valid, false);
  await run.save();
  await writeFile(join(run.dir, 'owner-image.bin'), 'tampered bytes');
  report = await evaluate(run.dir, run.options);
  assert.equal(report.passed, false);
  assert.match(report.integrity.reasons.join(' '), /digest mismatch/);
});

test('bytes with a valid manifest hash still violate a different independently observed file digest', async t => {
  const run = await fixture(t);
  run.observations.files.ownerImageSha256 = 'd'.repeat(64);
  await run.save();
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.integrity.valid, true);
  assert.equal(report.criteria.find(criterion => criterion.id === 'G02.private-bytes-scoped').status, 'violado');
});

test('goal, suite, app, snapshot and run identities are checked against external anchors', async t => {
  const run = await fixture(t);
  for (const [field, changed] of [['goalDigest', 'd'.repeat(64)], ['suiteDigest', 'd'.repeat(64)], ['appRevision', 'd'.repeat(40)], ['snapshotDigest', 'd'.repeat(64)], ['runId', 'old-run']]) {
    const original = run.manifest[field];
    run.manifest[field] = changed;
    await run.save();
    const report = await evaluate(run.dir, run.options);
    assert.equal(report.status, 'inconclusivo', field);
    assert.equal(report.integrity.valid, false, field);
    run.manifest[field] = original;
  }
  const weakened = structuredClone(fixtureGoal);
  weakened.criteria[0].checks[0].expected = [200];
  await run.save();
  assert.equal((await evaluate(run.dir, { ...run.options, goal: weakened })).integrity.valid, false);
});

test('missing evaluator anchors, skipped runs, widened budgets and path escapes fail closed', async t => {
  const run = await fixture(t);
  await assert.rejects(evaluate(run.dir, { ...run.options, expectedSnapshotDigest: undefined }), /trusted SHA256/);
  run.manifest.status = 'skipped';
  assert.throws(() => validateManifest(run.manifest), /manifest.status/);
  await run.save();
  assert.equal((await evaluate(run.dir, run.options)).passed, false);
  run.manifest.status = 'completed';
  run.manifest.budgets.actions++;
  await run.save();
  assert.equal((await evaluate(run.dir, run.options)).integrity.valid, false);
  run.manifest.budgets.actions--;
  await run.save();
  run.manifest.artifacts[0].path = '../outside.json';
  await writeFile(join(run.dir, 'manifest.json'), JSON.stringify(run.manifest));
  assert.equal((await evaluate(run.dir, run.options)).integrity.valid, false);
});

test('an artifact symlink outside the run is rejected even if its hash matches', async t => {
  const run = await fixture(t);
  const external = await mkdtemp(join(tmpdir(), 'compor-evidence-outside-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  const file = join(external, 'image.bin');
  await writeFile(file, 'synthetic private image bytes');
  await rm(join(run.dir, 'owner-image.bin'));
  await symlink(file, join(run.dir, 'owner-image.bin'));
  const report = await evaluate(run.dir, run.options);
  assert.equal(report.passed, false);
  assert.match(report.integrity.reasons.join(' '), /escapes run directory/);
});
