import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { inspectClaimLedger, numberedFacts } from './grounding.mjs';

const deck = { slides: [{ id: 'capa', headline: 'Três motivos para ler em 360 px', body: 'Faça uma revisão antes de exportar.' }] };
const claim = (slot, quote, factId = 'f1', slideId = 'capa') => ({ slideId, slot, quote, factId });

test('mantém referência estável e não exige fonte para enumeração e medida de layout', () => {
  assert.deepEqual(numberedFacts(['Marca Traço Claro.']), [{ id: 'f1', text: 'Marca Traço Claro.' }]);
  assert.deepEqual(inspectClaimLedger(deck, [], []), { status: 'pass', issues: [], anchors: [] });
});

test('trava promessa numérica sem citação no mesmo slot', () => {
  const candidate = {
    ...deck, caption: 'Uma semana com ganho de 47%.',
    slides: [{ ...deck.slides[0], body: 'Eu ganhei 47% na primeira semana.' }],
  };
  const facts = ['Eu ganhei 47 por cento na primeira semana.'];
  const result = inspectClaimLedger(candidate, [claim('body', 'Eu ganhei 47% na primeira semana.')], facts);
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.issues, [{ id: 'UNBOUND_RESULT', slot: 'deck:caption', detail: '47%' }]);
  assert.equal(result.anchors[0].factId, 'f1');
});

test('recusa usuário ou juiz que cita slot inexistente, fato inventado ou unidade diferente', () => {
  const candidate = { slides: [{ id: 'capa', headline: 'Ganhe 47% mais', alt: 'Capa do conjunto.' }] };
  const facts = ['O produto custa R$ 47.'];
  const result = inspectClaimLedger(candidate, [
    claim('headline', '47%'), claim('listItems.0', '47%'), claim('headline', '47%', 'f2'),
  ], facts);
  assert.deepEqual(result.issues.map(issue => issue.id), ['CLAIM_ANCHOR', 'CLAIM_ANCHOR', 'CLAIM_ANCHOR', 'UNBOUND_RESULT']);
});

test('a mesma quantia em reais, ligada ao fato permitido, cumpre o contrato literal', () => {
  const candidate = { slides: [{ id: 'capa', headline: 'Inscrição de R$ 99' }] };
  const result = inspectClaimLedger(candidate, [claim('headline', 'R$ 99')], ['A inscrição custa 99 reais.']);
  assert.equal(result.status, 'pass');
  assert.equal(result.anchors[0].quote, 'R$ 99');
});

test('lê números em legendas, diagramas e listas, inclusive nomes de slot com posição', () => {
  const candidate = { slides: [{
    id: 'miolo', headline: 'Opções da oficina', listItems: ['R$ 81'],
    diagram: { labels: ['12/02'], items: ['R$ 99'], sample: '20% melhor' },
  }], caption: 'Chegamos em 10/02.' };
  const result = inspectClaimLedger(candidate, [], []);
  assert.deepEqual(result.issues.map(issue => issue.slot), [
    'miolo:listItems.0', 'miolo:diagram.sample', 'miolo:diagram.labels.0', 'miolo:diagram.items.0', 'deck:caption',
  ]);
});

test('exige lastro para multiplicadores sem tomar dimensões de layout como resultado', () => {
  const candidate = { slides: [{ id: 'um', headline: 'Venda 3× mais', body: 'Use um quadro de 1080×1350.' }] };
  assert.deepEqual(inspectClaimLedger(candidate, [], []).issues.map(issue => issue.detail), ['3×']);
  assert.equal(inspectClaimLedger(candidate, [claim('headline', '3×', 'f1', 'um')], ['Medição: 3 vezes o resultado.']).status, 'pass');
});
