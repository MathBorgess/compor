import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDirection, proposeCriterion, decideCriterion, directionForAgent } from '../lib/studio-direction.mjs';
import { createStudioState, parseStudioState, createPost, addCreativeCriterion, recordCreativeDecision, prepareAdjustment } from '../lib/studio-state.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const criterion = (viewpoint = 'creator', dimension = 'visual') => ({ id: id(10), viewpoint, dimension, statement: 'Proximidade sem promessa de resultado', example: { description: 'Mostrar uma situação concreta de aprendizado', referenceId: null }, counterexample: { description: 'Prometer transformação garantida', referenceId: null }, provenance: 'hypothesis', source: '', tension: 'O criador prefere impacto; a persona pode precisar de contexto.' });
const decision = (choice, n = 20) => ({ id: id(n), criterionId: id(10), choice, reason: 'Prefiro explicar o contexto.', at: '2026-11-05T18:00:00.000Z' });

test('exemplos e contraexemplos distinguem as duas perspectivas e os dois tipos de critério', () => {
  for (const viewpoint of ['creator', 'recipient']) for (const dimension of ['visual', 'message']) {
    const direction = proposeCriterion(parseDirection(), criterion(viewpoint, dimension));
    const context = directionForAgent(direction)[0];
    assert.equal(context.viewpoint, viewpoint);
    assert.equal(context.dimension, dimension);
    assert.equal(context.creatorDecision, 'reopen');
    assert.match(context.counterexample.description, /garantida/);
  }
});

test('aceitar uma hipótese da persona registra uma escolha sem inventar evidência de público', () => {
  const proposed = proposeCriterion(parseDirection(), criterion('recipient', 'message'));
  const accepted = decideCriterion(proposed, decision('accept'));
  assert.equal(directionForAgent(accepted)[0].provenance, 'hypothesis');
  assert.equal(directionForAgent(accepted)[0].creatorDecision, 'accept');
  assert.equal(proposed.decisions.length, 0);
  const reopened = decideCriterion(accepted, decision('reopen', 21));
  assert.equal(directionForAgent(reopened)[0].creatorDecision, 'reopen');
  assert.equal(reopened.decisions[0].choice, 'accept');
});

test('propostas não podem se passar por decisões humanas nem sobrescrever um critério existente', () => {
  const proposed = proposeCriterion(parseDirection(), criterion());
  assert.throws(() => proposeCriterion(parseDirection(), { ...criterion(), decision: 'accept' }));
  assert.throws(() => proposeCriterion(proposed, { ...criterion(), statement: 'Outra afirmação' }), /conflict/);
  assert.throws(() => decideCriterion(proposed, { ...decision('accept'), criterionId: id(999) }));
  assert.throws(() => proposeCriterion(parseDirection(), { ...criterion(), example: { description: '', referenceId: null } }));
});

test('direção rejeita origem pública inválida e credenciais nos exemplos', () => {
  assert.throws(() => proposeCriterion(parseDirection(), { ...criterion(), provenance: 'public_source', source: 'javascript:alert(1)' }));
  assert.throws(() => proposeCriterion(parseDirection(), { ...criterion(), counterexample: { description: 'sk-confidential', referenceId: null } }));
});

test('estado antigo ganha direção vazia e uma tentativa preserva os critérios usados', () => {
  let state = createStudioState({ userId: id(1), projectId: id(2) });
  const old = structuredClone(state);
  delete old.direction;
  assert.deepEqual(parseStudioState(old).direction, { criteria: [], decisions: [] });
  state = createPost(state, { pieceId: id(3) });
  state = addCreativeCriterion(state, criterion());
  state = prepareAdjustment(state, { requestId: id(4), messageId: id(5), eventId: id(6), instruction: 'Explore esta direção', createdAt: '2026-11-05T18:00:00.000Z' });
  state = recordCreativeDecision(state, decision('accept'));
  assert.equal(state.direction.decisions.length, 1);
  assert.equal(state.adjustments[0].context.direction.decisions.length, 0);
  assert.equal(state.adjustments[0].context.direction.criteria[0].statement, criterion().statement);
});
