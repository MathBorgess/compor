import test from 'node:test';
import assert from 'node:assert/strict';
import { billedJobs, summary } from './billed-minutes.mjs';

const job = (name, conclusion, started_at, completed_at) => ({ name, status: conclusion ? 'completed' : 'in_progress', conclusion, started_at, completed_at });

test('each job that ran is rounded up to a whole minute and a skipped job costs nothing', () => {
  const rows = billedJobs([
    job('Static checks', 'success', '2026-11-09T14:02:34Z', '2026-11-09T14:03:21Z'),
    job('Contracts and data isolation', 'success', '2026-11-09T14:02:34Z', '2026-11-09T14:05:15Z'),
    job('Web types and behavior', 'success', '2026-11-09T15:02:32Z', '2026-11-09T15:17:07Z'),
    job('Production performance', 'failure', '2026-11-09T15:02:32Z', '2026-11-09T15:04:00Z'),
    job('Skipped', 'skipped', '2026-11-09T15:02:32Z', '2026-11-09T15:02:32Z'),
  ]);
  assert.deepEqual(rows.map(row => [row.seconds, row.billed]), [[47, 1], [161, 3], [875, 15], [88, 2], [0, 0]]);
  assert.match(summary(rows), /Estimativa desta execução: \*\*21 min\*\*/);
  assert.match(summary(rows), /\| Web types and behavior \| success \| 14 min 35 s \| 15 \|/);
});

test('a job still running counts at least one minute up to now', () => {
  const [gate] = billedJobs([job('Quality gate', null, '2026-11-09T15:17:11Z', null)], Date.parse('2026-11-09T15:17:16Z'));
  assert.deepEqual(gate, { name: 'Quality gate', result: 'in_progress', seconds: 5, billed: 1 });
});
