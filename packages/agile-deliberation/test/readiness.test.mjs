import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessReadiness } from '../src/readiness.js';

const complete = { brief: { offer: 'Oficina de cerâmica', action: 'Inscrever-se', audience: 'Iniciantes', direction: 'Acolhedor' } };

test('empty briefing asks a question without fabricating evidence', () => {
  const result = assessReadiness({});
  assert.deepEqual(result,assessReadiness({brief:{offer:'',audience:'',action:'',direction:''},persona:{audience:'',situation:'',need:''},direction:{criteria:[],decisions:[]}}));
  assert.equal(result.level, 'low');
  assert.equal(result.next, 'ask');
  assert.ok(result.gaps.includes('offer'));
  assert.equal(result.evidence.referenceMeaning, 'not_applicable');
});

test('selecting images is not evidence of the person’s preference', () => {
  const result = assessReadiness({ ...complete, references: [{ id: 'one' }] });
  assert.equal(result.level, 'medium');
  assert.equal(result.next, 'offer_alternatives');
  assert.equal(result.evidence.referenceMeaning, 'unknown');
  assert.ok(result.gaps.includes('reference_meaning'));
  assert.equal(result.evidence.recipientPerspective, 'hypothesis');
});

test('only human feedback on selected images clarifies their meaning', () => {
  const input = { ...complete, references: [{ id: 'one' }, { id: 'two' }] };
  const oneDiscussed = assessReadiness({ ...input, referenceFeedback: [{ referenceId: 'one', text: 'Gosto das cores' }, { referenceId: 'other', text: 'Gosto' }] });
  assert.equal(oneDiscussed.evidence.referenceMeaning, 'unknown');
  const bothDiscussed = assessReadiness({ ...input, referenceFeedback: [{ referenceId: 'one', text: 'Gosto das cores' }, { referenceId: 'two', text: 'Evitar esta tipografia' }] });
  assert.equal(bothDiscussed.level, 'high');
  assert.equal(bothDiscussed.next, 'propose_piece');
  assert.equal(bothDiscussed.evidence.referenceMeaning, 'discussed');
});

test('an accepted criterion linked to an image counts, a hypothesis alone does not', () => {
  const direction = { criteria: [{ id: 'c', viewpoint: 'creator', statement: 'Cores suaves', example: { referenceId: 'one' } }], decisions: [] };
  const input = { ...complete, direction, references: [{ id: 'one' }] };
  assert.equal(assessReadiness(input).evidence.referenceMeaning, 'unknown');
  assert.equal(assessReadiness({ ...input, direction: { ...direction, decisions: [{ criterionId: 'c', choice: 'accept' }] } }).evidence.referenceMeaning, 'discussed');
});

test('reopened tensions remain unresolved even after a past decision', () => {
  const criterion = { id: 'c', viewpoint: 'creator', statement: 'Discreto', tension: 'Discreto ou vibrante?' };
  const base = { ...complete, direction: { criteria: [criterion], decisions: [{ criterionId: 'c', choice: 'accept' }] } };
  assert.equal(assessReadiness(base).level, 'high');
  const reopened = assessReadiness({ ...base, direction: { ...base.direction, decisions: [...base.direction.decisions, { criterionId: 'c', choice: 'reopen' }] } });
  assert.equal(reopened.level, 'medium');
  assert.ok(reopened.gaps.includes('unresolved_tension'));
});

test('no selected images or full four-perspective matrix are required to propose', () => {
  const result = assessReadiness(complete);
  assert.equal(result.level, 'high');
  assert.equal(result.next, 'propose_piece');
  assert.equal(result.evidence.referenceMeaning, 'not_applicable');
  assert.ok(result.limitations.includes('heuristic_not_statistically_calibrated'));
});

test('an explicit request can proceed while preserving missing assumptions', () => {
  const result = assessReadiness({ explicitRequest: true });
  assert.equal(result.level, 'low');
  assert.equal(result.next, 'proceed_with_assumptions');
  assert.ok(result.gaps.includes('offer'));
});

test('rejects malformed input and does not echo private briefing text', () => {
  assert.throws(() => assessReadiness({ references: 'not an array' }));
  assert.doesNotMatch(JSON.stringify(assessReadiness(complete)), /Oficina de cerâmica/);
});
