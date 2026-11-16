import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestJson, sha256 } from './contracts.mjs';
import { evaluate } from './evaluate.mjs';
import { captureNegativeControls } from './negative-controls.mjs';

const goal = JSON.parse(await readFile(new URL('./goals/G01.json', import.meta.url), 'utf8'));

async function fixture(t) {
  const runDir = await mkdtemp(join(tmpdir(), 'compor-negative-controls-'));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const image = Buffer.from('Synthetic evaluator test bytes; not a generated image');
  const facts = [{ value: 'R$ 50', authority: 'declared' }];
  const suggested = [{ value: 'Suggested positioning', authority: 'suggested' }];
  const content = { caption: 'R$ 50' };
  const observations = {
    http: { createProject: { status: 201 }, openProject: { status: 200 }, reloadProject: { status: 200 } },
    providerLedger: { beforeIntent: [], afterExplicitRequest: [{ id: 'dispatch-one' }] },
    db: { afterPreparation: { posts: [] }, afterConfirmation: { posts: [{ id: 'post-one' }] }, afterCancellation: { posts: [] }, versions: [{ piece_id: 'post-one', version: 1, content }] },
    controller: { references: { sharedIds: ['shared'], postLocalIds: ['local'], effectiveIds: ['shared', 'local'], otherPostEffectiveIds: ['shared'] }, declaredFacts: facts, suggestedFacts: suggested, reopened: { pieceId: 'post-one', baseVersion: 1, content, facts, suggestedFacts: suggested } },
    files: { authenticatedImageSha256: sha256(image) },
    clock: { selectionAt4999: [], selectionAt5000: ['selected'], batchAt14999: { remainingMs: 1, error: 'batch_waiting' }, batchAt15000: { remainingMs: 0, completed: 0 }, cancelledEvents: [], frozenAndResumed: { remainingMs: 11000 } },
  };
  const serialized = JSON.stringify(observations);
  const anchors = { expectedGoalDigest: digestJson(goal), expectedSuiteDigest: 'a'.repeat(64), expectedAppRevision: 'b'.repeat(40), expectedSnapshotDigest: 'c'.repeat(64), expectedRunId: 'negative-source-one' };
  const manifest = {
    schemaVersion: 'run/v1', runId: anchors.expectedRunId, goalId: goal.id, goalRevision: goal.revision,
    goalDigest: anchors.expectedGoalDigest, suiteDigest: anchors.expectedSuiteDigest, appRevision: anchors.expectedAppRevision, snapshotDigest: anchors.expectedSnapshotDigest,
    profile: 'offline', status: 'completed', budgets: { ...goal.budgets },
    usage: { actions: 20, requests: 40, wallTimeMs: 1000, cycles: 1, candidates: 1, concurrency: 1, modelTokens: null, modelCostUsd: null },
    startedAt: '2026-11-16T12:00:00.000Z', endedAt: '2026-11-16T12:00:01.000Z',
    artifacts: [{ id: 'observations', kind: 'observations', path: 'observations.json', sha256: sha256(serialized) }, { id: 'generated-image', kind: 'file', path: 'image.bin', sha256: sha256(image) }],
  };
  await writeFile(join(runDir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(runDir, 'observations.json'), serialized);
  await writeFile(join(runDir, 'image.bin'), image);
  return { runDir, anchors };
}

test('all four damaged evidence copies fail and the approved source remains byte-for-byte unchanged', async t => {
  const run = await fixture(t);
  const names = ['manifest.json', 'observations.json', 'image.bin'];
  const before = await Promise.all(names.map(name => readFile(join(run.runDir, name))));
  const result = await captureNegativeControls(run.runDir, { goal, anchors: run.anchors });
  assert.equal(result.passed, true);
  assert.deepEqual(result.controls.map(control => control.id), ['missing-artifact', 'corrupt-bytes', 'stale-snapshot', 'missing-manifest']);
  for (const control of result.controls) {
    assert.equal(control.evaluationPassed, false);
    assert.equal(control.detected, true);
    const report = JSON.parse(await readFile(join(run.runDir, result.directory, control.reportPath), 'utf8'));
    assert.equal(report.passed, false);
    assert.equal(report.integrity.valid, false);
  }
  assert.match(result.controls.find(control => control.id === 'corrupt-bytes').integrityReasons.join(' '), /digest mismatch/);
  assert.match(result.controls.find(control => control.id === 'stale-snapshot').integrityReasons.join(' '), /snapshotDigest mismatch/);
  const after = await Promise.all(names.map(name => readFile(join(run.runDir, name))));
  assert.deepEqual(after, before);
  assert.equal((await evaluate(run.runDir, { goal, ...run.anchors })).passed, true);
});

test('unapproved or differently anchored source produces no negative-control copies', async t => {
  const run = await fixture(t);
  await assert.rejects(captureNegativeControls(run.runDir, { goal, anchors: { ...run.anchors, expectedSnapshotDigest: 'd'.repeat(64) } }), /require_approved_source/);
  await writeFile(join(run.runDir, 'image.bin'), 'corrupted source');
  await assert.rejects(captureNegativeControls(run.runDir, { goal, anchors: run.anchors }), /require_approved_source/);
  assert.deepEqual((await readdir(run.runDir)).sort(), ['image.bin', 'manifest.json', 'observations.json']);
});
