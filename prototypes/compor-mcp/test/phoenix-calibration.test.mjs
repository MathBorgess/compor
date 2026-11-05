import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PROTOCOL, session, evaluateOne, runStudy } from '../scripts/calibration/phoenix-calibration.mjs';

const fixtureRoot = new URL('./fixtures/phoenix-calibration-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', fixtureRoot), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function frozenSplits() {
  assert.deepEqual(manifest.protocol, PROTOCOL);
  return Object.fromEntries(['train','validation','test'].map(name => {
    const entry = manifest.splits[name];
    const compressed = readFileSync(new URL(entry.file, fixtureRoot));
    assert.equal(compressed.length, entry.gzipBytes);
    assert.equal(sha(compressed), entry.gzipSha256);
    const bytes = gunzipSync(compressed, { maxOutputLength:entry.bytes });
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha(bytes), entry.sha256);
    const sessions = JSON.parse(bytes.toString('utf8'));
    assert.deepEqual(sessions.map(row => row.seed), PROTOCOL[name]);
    return [name, sessions];
  }));
}

function assertEquivalentInputs(actual, expected, path = 'session') {
  if (typeof expected === 'number' && !Number.isInteger(expected)) {
    assert.equal(typeof actual, 'number', path);
    assert.ok(Number.isFinite(actual), path);
    // At least six orders below reported precision (1e-6), and eight below
    // ranking precision (1e-4); permits libm rounding without feature drift.
    const tolerance = 1e-12 * Math.max(1, Math.abs(expected));
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} differs from ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, expected.length, path);
    expected.forEach((value, index) => assertEquivalentInputs(actual[index], value, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', path);
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
    for (const [key, value] of Object.entries(expected)) assertEquivalentInputs(actual[key], value, `${path}.${key}`);
  } else {
    assert.equal(actual, expected, path);
  }
}

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
  const historicalBytes = readFileSync(new URL('../../../docs/evals/2026-10-29-phoenix-calibracao/result-after-unknown-sid.json',import.meta.url));
  assert.equal(sha(historicalBytes), manifest.sourceResultSha256);
  const expected = JSON.parse(historicalBytes.toString('utf8'));
  assert.equal(expected.hashes.generator, manifest.sourceGeneratorSha256);
  for (const name of ['train','validation','test']) assert.equal(manifest.splits[name].sha256, expected.hashes[name]);
  const replay = JSON.parse(readFileSync(new URL('../../../docs/evals/2026-10-29-phoenix-calibracao/frozen-input-replay-2026-11-05.json',import.meta.url),'utf8'));
  assert.equal(replay.sourceResultSha256, manifest.sourceResultSha256);
  assert.equal(replay.fixtureManifestSha256, sha(readFileSync(new URL('manifest.json', fixtureRoot))));
  assert.equal(replay.historicalGeneratorSha256, manifest.sourceGeneratorSha256);
  expected.hashes.generator = replay.generatorSha256;
  const actual = runStudy(frozenSplits());
  assert.deepEqual(actual, expected);
  assert.equal(sha(JSON.stringify(actual)), replay.resultSha256);
  assert.equal(actual.trials.length, PROTOCOL.randomTrials+1);
  const finalists = actual.trials.filter(t=>t.validation);
  assert.equal(finalists.length, PROTOCOL.finalists);
  const winner = finalists.sort((a,b)=>b.validation.ndcg3-a.validation.ndcg3 || a.index-b.index)[0];
  assert.equal(actual.selection.winnerIndex,winner.index);
  assert.equal(actual.final.pairedPerSession.length,PROTOCOL.test.length);
  assert.equal(actual.label,'synthetic_simulation_not_human_evaluation');
});

test('new synthetic generation preserves historical inputs within floating-point tolerance and keeps discrete data exact', () => {
  for (const sessions of Object.values(frozenSplits())) {
    for (const historical of sessions) {
      const generated = session(historical.seed);
      assertEquivalentInputs(generated, historical);
    }
  }
});
