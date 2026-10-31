import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PROTOCOL, session, evaluateOne, runStudy } from '../scripts/calibration/phoenix-calibration.mjs';

test('synthetic calibration partitions sessions and varies candidate relevance without encoding it in IDs or SIDs', () => {
  const seeds = [...PROTOCOL.train,...PROTOCOL.validation,...PROTOCOL.test];
  assert.equal(new Set(seeds).size, seeds.length);
  assert.deepEqual(session(1234), session(1234));
  const samples = Array.from({length:30},(_,i)=>session(40000+i));
  assert.ok(new Set(samples.map(s=>s.candidates.findIndex(c=>c.grade===3))).size > 5);
  for (const s of samples) {
    assert.equal(s.candidates.length,24);
    assert.equal(s.candidates.filter(c=>c.grade===3).length,2);
    const result = evaluateOne(s,createPhoenixHyperparams());
    assert.ok(result.ndcg >= 0 && result.ndcg <= 1);
    assert.ok(result.uniqueSids >= 1/3 && result.uniqueSids <= 1);
  }
});

test('calibration result is reproducible and selects the winner before reserved test evaluation', () => {
  // The original result.json remains historical evidence. This fixture is the
  // separately recorded rerun after unknown SID handling changed formulas.ts.
  const expected = JSON.parse(readFileSync(new URL('../../../docs/evals/2026-10-29-phoenix-calibracao/result-after-unknown-sid.json',import.meta.url),'utf8'));
  const actual = runStudy();
  assert.deepEqual(actual, expected);
  assert.equal(actual.trials.length, PROTOCOL.randomTrials+1);
  const finalists = actual.trials.filter(t=>t.validation);
  assert.equal(finalists.length, PROTOCOL.finalists);
  const winner = finalists.sort((a,b)=>b.validation.ndcg3-a.validation.ndcg3 || a.index-b.index)[0];
  assert.equal(actual.selection.winnerIndex,winner.index);
  assert.equal(actual.final.pairedPerSession.length,PROTOCOL.test.length);
  assert.equal(actual.label,'synthetic_simulation_not_human_evaluation');
});
