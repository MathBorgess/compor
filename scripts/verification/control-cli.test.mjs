import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { controlCommand } from './control-cli.mjs';
import { digestJson, sha256 } from './contracts.mjs';
import { freezeSuite } from './trust.mjs';

async function fixture(t, selected = 'all') {
  const directory = await mkdtemp(join(tmpdir(), 'compor-control-cli-'));
  const previousTrust = process.env.COMPOR_VERIFICATION_TRUST;
  process.env.COMPOR_VERIFICATION_TRUST = join(directory, 'trusted-suite.json');
  t.after(async () => {
    if (previousTrust === undefined) delete process.env.COMPOR_VERIFICATION_TRUST;
    else process.env.COMPOR_VERIFICATION_TRUST = previousTrust;
    await rm(directory, { recursive: true, force: true });
  });
  const root = join(directory, 'source'), output = join(directory, 'evidence'), runId = randomUUID();
  const runDir = join(output, runId);
  await mkdir(runDir, { recursive: true });
  const entries = [{ path: 'scripts/verification/goals/G02.json', sha256: sha256('fixed goal fixture') }];
  const source = { entries, suiteDigest: digestJson(entries) };
  await freezeSuite(root, source);
  await writeFile(join(runDir, 'anchor.json'), JSON.stringify({ runId, selected, suiteDigest: source.suiteDigest, appRevision: 'a'.repeat(40), snapshotDigest: 'b'.repeat(64) }));
  const evaluateRun = () => controlCommand('evaluate', runId, [], { root, output, dockerArgs: [], sources: async () => source });
  return { runDir, evaluateRun };
}

test('evaluation of all cannot silently accept a summary containing only G02', async t => {
  const run = await fixture(t);
  await writeFile(join(run.runDir, 'summary.json'), JSON.stringify({ goals: [{ id: 'G02', passed: true }], cleanup: { status: 'completed' } }));
  await assert.rejects(run.evaluateRun, /required_scenario_missing/);
});

test('duplicated or reordered scenarios do not replace the selected sequence', async t => {
  const run = await fixture(t);
  for (const ids of [['G01', 'G02', 'G02'], ['G03', 'G02', 'G01']]) {
    await writeFile(join(run.runDir, 'summary.json'), JSON.stringify({ goals: ids.map(id => ({ id, passed: true })), cleanup: { status: 'completed' } }));
    await assert.rejects(run.evaluateRun, /required_scenario_missing/);
  }
});

test('a reported criterion success cannot hide missing or failed cleanup', async t => {
  const run = await fixture(t, 'G02');
  for (const cleanup of [undefined, { status: 'pending' }, { status: 'failed' }]) {
    await writeFile(join(run.runDir, 'summary.json'), JSON.stringify({ goals: [{ id: 'G02', passed: true }], cleanup }));
    await assert.rejects(run.evaluateRun, /cleanup_not_completed/);
  }
});
