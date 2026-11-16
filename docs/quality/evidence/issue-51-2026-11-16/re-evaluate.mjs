import assert from 'node:assert/strict';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const files = await json('files.sha256.json');
const actualPaths = [];
async function list(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await list(join(directory, entry.name), path + '/');
    else {
      assert.equal(entry.isFile(), true, `non-regular package file: ${path}`);
      if (path !== 'files.sha256.json') actualPaths.push(path);
    }
  }
}
await list(root);
assert.deepEqual(actualPaths.sort(), files.map(file => file.path).sort(), 'package file inventory differs');
for (const file of files) {
  const target = await realpath(resolve(root, file.path));
  assert.equal(target.startsWith(root + sep), true, 'package path escapes root');
  const bytes = await readFile(target);
  assert.equal((await stat(target)).size, file.bytes, `size mismatch: ${file.path}`);
  assert.equal(hash(bytes), file.sha256, `hash mismatch: ${file.path}`);
}

// Load executable evidence only after checking its packaged bytes. This detects
// drift; the inventory is local data, not a signed or external trust authority.
const provenance = await json('provenance.json');
for (const source of provenance.sourceFiles) {
  assert.equal(hash(await readFile(join(root, source.packagedPath))), source.sha256, `executed source mismatch: ${source.path}`);
}
const { evaluate } = await import(pathToFileURL(join(root, 'evaluator/evaluate.mjs')));
const { digestJson } = await import(pathToFileURL(join(root, 'evaluator/contracts.mjs')));

function decisions(report) {
  return {
    goalId: report.goalId, status: report.status, passed: report.passed,
    integrityValid: report.integrity.valid, completionComplete: report.completion.complete,
    criteria: report.criteria.map(criterion => ({
      id: criterion.id, profile: criterion.profile, status: criterion.status,
      checks: criterion.checks.map(check => ({ status: check.status, evidence: check.evidence })),
    })),
    modelUsage: report.modelUsage,
  };
}

const required = new Map([
  ['positive', ['G01', 'G02', 'G03']], ['replay', ['G01', 'G02', 'G03']],
  ['negative-persistence', ['G01']], ['exploration', ['G01']],
]);
assert.deepEqual(provenance.runs.map(run => run.role).sort(), [...required.keys()].sort());
const results = [];
for (const run of provenance.runs) {
  assert.deepEqual(run.cases.map(item => item.goalId).sort(), required.get(run.role), 'required scenario omitted');
  const anchor = await json(run.anchorPath);
  assert.equal(anchor.runId, run.id);
  assert.equal(anchor.suiteDigest, anchor.trustedSuiteDigest);
  const summary = await json(`runs/${run.id}/summary.json`);
  assert.deepEqual(summary.cleanup, { status: 'completed', failures: [] });
  const reports = [];
  for (const item of run.cases) {
    const goal = await json(`goals/${item.goalId}.json`);
    const options = {
      goal, expectedGoalDigest: digestJson(goal), expectedSuiteDigest: anchor.suiteDigest,
      expectedAppRevision: anchor.appRevision, expectedSnapshotDigest: anchor.snapshotDigest,
      expectedRunId: `${run.id}-${item.goalId}`,
    };
    const result = await evaluate(join(root, item.path), options);
    const saved = await json(`${item.path}/evaluation.json`);
    assert.deepEqual(decisions(result), decisions(saved), `evaluation changed: ${run.role}/${item.goalId}`);
    assert.equal(result.passed, item.expectedPassed);
    assert.equal(result.status, item.expectedStatus);
    reports.push({ goalId: item.goalId, status: result.status, passed: result.passed, criteria: result.criteria.length, checks: result.criteria.reduce((count, criterion) => count + criterion.checks.length, 0) });
    if (run.negativeControls && item.goalId === 'G01') {
      assert.equal(run.negativeControls.cases.length, 4);
      for (const negative of run.negativeControls.cases) {
        const rejected = await evaluate(join(root, negative.path), options);
        assert.equal(rejected.passed, false, `negative control accepted: ${negative.id}`);
        assert.deepEqual(decisions(rejected), decisions(await json(negative.evaluationPath)), `negative evaluation changed: ${negative.id}`);
      }
    }
  }
  results.push({ role: run.role, runId: run.id, reports, negativeControlsRejected: run.negativeControls?.cases.length ?? 0 });
}
console.log(JSON.stringify({ status: 'verified', filesVerified: files.length, results }, null, 2));
