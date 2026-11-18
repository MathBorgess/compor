import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases, packet} from './packets.mjs';

const local = name => new URL(name, import.meta.url);
const read = name => JSON.parse(readFileSync(local(name)));
const freeze = read('freeze.json');
for (const [name, expected] of Object.entries(freeze.files)) {
  assert.equal(createHash('sha256').update(readFileSync(local(name))).digest('hex'), expected, name);
}
assert.equal(cases.filter(c => c.split === 'dev').length, 3);
assert.equal(cases.filter(c => c.split === 'holdout').length, 2);
const controls = read('contrasts.json');
assert.equal(new Set(controls.map(c => c.id)).size, 15);
assert.equal(controls.length, 15);
const sizes = [];
for (const c of cases) {
  const full = packet(c.id, 'with'), less = packet(c.id, 'without');
  sizes.push(full.referenceImages.length);
  const removed = full.rubric.references.find(r => r.id === full.rubric.optionalId);
  assert.ok(removed && removed.origin !== 'local-upload');
  assert.deepEqual(full.context, less.context);
  assert.deepEqual(less.referenceImages, full.referenceImages.filter(r => r.id !== removed.id));
  assert.deepEqual(less.visualInput.entries, full.visualInput.entries.filter(r => r.id !== removed.id).map((r, i) => ({...r, ordinal: i + 1})));
  assert.deepEqual(less.rubric.references.filter(r => !r.present).map(r => r.id), [removed.id]);
  for (const r of full.rubric.references) {
    for (const key of ['asset','label','origin','intent','attribute','placement','forbidden']) assert.ok(r[key].trim(), key);
    assert.ok(['keep','omit'].includes(r.decision));
    if (r.origin === 'local-upload') assert.equal(r.decision, 'keep');
    assert.ok(full.context.direction.includes(r.id + ' = ' + r.label));
  }
  const trios = controls.filter(v => v.caseId === c.id);
  assert.equal(trios.filter(t => t.expected === 'accept' && !t.duplicatePair && !t.driftPosition).length, 1);
  assert.equal(trios.filter(t => t.expected === 'reject' && t.duplicatePair && !t.driftPosition).length, 1);
  assert.equal(trios.filter(t => t.expected === 'reject' && !t.duplicatePair && t.driftPosition).length, 1);
  for (const control of trios) {
    assert.equal(control.split, c.split);
    const ids = full.rubric.references.filter(r => r.decision === 'keep').map(r => r.id);
    // The frozen product baseline only checks normalized string inequality. Each semantic
    // challenge is valid on that baseline, so it can distinguish additional semantic checks.
    assert.ok(validateExplorationPlan({version: 2, referenceIds: ids, items: control.items}, full.context, full.visualInput), control.id);
  }
}
assert.deepEqual(sizes.sort((a,b) => a-b), [2,3,4,5,6]);
console.log('Corpus v1 conferido: 5 casos, 10 braços e 15 trios.');
