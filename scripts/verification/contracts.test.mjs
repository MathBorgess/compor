import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestJson, validateGoal, validateObservations } from './contracts.mjs';

const goals = await Promise.all(['G01', 'G02', 'G03'].map(async id => JSON.parse(await readFile(new URL(`./goals/${id}.json`, import.meta.url), 'utf8'))));

test('all three fixed pilots validate and have distinct required criterion IDs', () => {
  const ids = [];
  for (const goal of goals) {
    assert.equal(validateGoal(goal), goal);
    ids.push(...goal.criteria.map(criterion => criterion.id));
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('goal contract rejects unbounded budgets, optional criteria and new fields', () => {
  for (const invalid of [Infinity, 0, -1, 1.5, '80']) {
    const goal = structuredClone(goals[0]);
    goal.budgets.actions = invalid;
    assert.throws(() => validateGoal(goal), /budgets.actions/);
  }
  const optional = structuredClone(goals[0]);
  optional.criteria[0].required = false;
  assert.throws(() => validateGoal(optional), /cannot be optional/);
  const unversioned = { ...goals[0], arbitraryEvaluator: 'return true' };
  assert.throws(() => validateGoal(unversioned), /unknown field/);
});

test('goal contract rejects duplicate criteria, unimplemented evaluators and malformed pointers', () => {
  const duplicate = structuredClone(goals[0]);
  duplicate.criteria.push(duplicate.criteria[0]);
  assert.throws(() => validateGoal(duplicate), /duplicate criterion/);
  const evaluator = structuredClone(goals[0]);
  evaluator.criteria[0].checks[0].kind = 'agent-self-report';
  assert.throws(() => validateGoal(evaluator), /kind/);
  const pointer = structuredClone(goals[0]);
  pointer.criteria[0].checks[0].path = '/http/~2escape';
  assert.throws(() => validateGoal(pointer), /JSON Pointer/);
});

test('goal digest is independent of key order and changes with expectations', () => {
  assert.equal(digestJson({ b: 2, a: 1 }), digestJson({ a: 1, b: 2 }));
  const changed = structuredClone(goals[0]);
  changed.criteria[0].checks[0].expected = 500;
  assert.notEqual(digestJson(changed), digestJson(goals[0]));
  assert.throws(() => digestJson({ unrecorded: undefined }), /finite JSON/);
});

test('observations reject a claimed verdict instead of collecting observable groups', () => {
  assert.throws(() => validateObservations({ passed: true }), /unknown field/);
  assert.throws(() => validateObservations({ db: { count: Infinity } }), /finite JSON/);
  assert.deepEqual(validateObservations({ http: {}, db: { rows: [] } }), { http: {}, db: { rows: [] } });
});

