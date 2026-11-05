import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDeliberation, proposeRefinement } from '../src/index.js';
import { copyDefinition, collectLeafSignals, updateSignals } from '../src/definition.js';

const criterion = overrides => ({
  id: 'calor', viewpoint: 'creator', dimension: 'visual', statement: 'Uma imagem acolhedora',
  example: { description: 'Luz de janela e materiais naturais' },
  counterexample: { description: 'Luz clínica e superfícies brilhantes' },
  ambiguity: 'A luz pode ser fria se a cena mostrar proximidade?',
  ...overrides,
});
const input = criteria => ({ objective: 'Convidar para uma oficina', criteria });
const decision = (id, choice) => ({ id, criterionId: 'calor', choice, reason: 'Minha escolha para este post', at: '2026-11-05T15:00:00.000Z' });

test('propõe somente uma comparação ambígua e conserva as duas perspectivas como hipóteses', () => {
  const result = prepareDeliberation(input([criterion(), criterion({ id: 'clareza', viewpoint: 'recipient', dimension: 'message', tension: 'Criador quer poesia; persona pode precisar de uma oferta explícita' })]));
  assert.equal(result.next.criterionId, 'calor');
  assert.equal(result.next.stage, 'reflect');
  assert.equal(result.next.counterexample.description, 'Luz clínica e superfícies brilhantes');
  assert.equal(result.criteria[1].provenance, 'hypothesis');
  assert.equal(result.audienceEvidenceVerified, false);
  assert.equal(result.generationAuthorized, false);
  assert.equal(result.requiresClarificationBeforeGeneration, false);
});

test('não transforma cobertura incompleta em questionário obrigatório', () => {
  const result = prepareDeliberation(input([criterion({ ambiguity: '' })]));
  assert.equal(result.next, null);
  assert.equal(result.status, 'no_open_ambiguity');
  assert.equal(result.coverage.filter(item => item.count === 0).length, 3);
  assert.equal(prepareDeliberation(input([])).next, null);
});

test('escolha reportada evita repetir fronteira; reabertura restaura a comparação e preserva histórico', () => {
  const context = { ...input([criterion()]), decisions: [decision('d1', 'accept')] };
  const snapshot = structuredClone(context);
  assert.equal(prepareDeliberation(context).next, null);
  assert.deepEqual(context, snapshot);
  context.decisions.push(decision('d2', 'reopen'));
  const result = prepareDeliberation(context);
  assert.equal(result.next.criterionId, 'calor');
  assert.deepEqual(result.reportedDecisions, context.decisions);
  assert.equal(result.persistsData, false);
});

test('sugere delimitar exemplos ausentes sem inventar referência ou evidência de público', () => {
  const result = prepareDeliberation(input([criterion({ example: { description: '' }, provenance: 'buyer_report', source: 'Relato informado pelo criador' })]));
  assert.equal(result.next.stage, 'scope');
  assert.equal(result.next.needsExamples, true);
  assert.equal(result.next.example.referenceId, null);
  assert.equal(result.audienceEvidenceVerified, false);
});

test('tensão entre persona e gosto continua decisão do criador', () => {
  const result = prepareDeliberation(input([criterion({ viewpoint: 'recipient', tension: 'Minimalismo pode esconder o preço' })]));
  assert.equal(result.next.decisionOwner, 'creator');
  assert.match(result.next.question, /Minimalismo pode esconder o preço/);
});

test('porta árvore de sinais com cópia independente e ordem de folhas do upstream', () => {
  const leaf = { concept: 'luz', description: 'luz natural', signalType: null, signals: [] };
  const root = { concept: 'calor', description: 'acolhimento', signalType: null, signals: [] };
  const definition = updateSignals(root, [leaf], 'positive');
  assert.deepEqual(collectLeafSignals(definition).map(item => item.concept), ['luz']);
  assert.equal(definition.signals[0].signalType, 'positive');
  const copy = copyDefinition(definition); copy.signals[0].description = 'mudança';
  assert.equal(definition.signals[0].description, 'luz natural');
  assert.deepEqual(root.signals, []);
  assert.deepEqual(collectLeafSignals(root), [root]);
});

test('refinamento mostra mudanças e preserva critério, sem aceitar nem gravar proposta', () => {
  const before = criterion({ signals: { necessary: ['preço legível'], positive: ['luz natural'], negative: [] } });
  const result = proposeRefinement({ criterion: before, clarification: 'Quero proximidade mesmo com luz fria', proposedStatement: 'Proximidade entre pessoas', proposedSignals: { necessary: ['preço legível'], positive: ['gestos próximos'], negative: ['isolamento'] } });
  assert.equal(result.status, 'proposal'); assert.equal(result.accepted, false);
  assert.equal(result.persistsData, false);
  assert.deepEqual(result.changes, ['statement', 'signals']);
  assert.equal(result.before.statement, before.statement);
  assert.equal(result.proposed.statement, 'Proximidade entre pessoas');
  assert.equal(result.definition.signals[2].signalType, 'negative');
  assert.equal(before.statement, 'Uma imagem acolhedora');
  const wordingOnly = proposeRefinement({ criterion: before, clarification: 'Descrever a proximidade', proposedStatement: 'Uma cena próxima e acolhedora' });
  assert.deepEqual(wordingOnly.proposed.signals, before.signals);
  assert.deepEqual(wordingOnly.changes, ['statement']);
});

test('recusa ids duplicados, decisões órfãs, campos inesperados e contexto excessivo', () => {
  assert.throws(() => prepareDeliberation(input([criterion(), criterion()])));
  assert.throws(() => prepareDeliberation({ ...input([]), decisions: [decision('d1', 'accept')] }));
  assert.throws(() => prepareDeliberation({ ...input([criterion()]), decisions: [decision('d1', 'accept'), decision('d1', 'reject')] }));
  assert.throws(() => prepareDeliberation(input([criterion({ accepted: true })])));
  assert.throws(() => prepareDeliberation(input([criterion({ provenance: 'public_source', source: 'http://example.test' })])));
  assert.throws(() => prepareDeliberation({ objective: 'x'.repeat(50_000) }));
});

test('chamadas independentes não vazam contexto ou escolhas', () => {
  const first = prepareDeliberation({ ...input([criterion()]), decisions: [decision('d1', 'accept')] });
  assert.equal(first.next, null);
  const second = prepareDeliberation(input([criterion()]));
  assert.equal(second.next.criterionId, 'calor');
  assert.deepEqual(second.reportedDecisions, []);
});
