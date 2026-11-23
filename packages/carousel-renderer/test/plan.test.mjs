import assert from 'node:assert/strict';
import test from 'node:test';
import { accentAgainst, contrast, layouts, paletteFor, validateDeck } from '../src/index.mjs';
import { slideDocument } from '../src/layouts.mjs';
import { cadence, demonstrationDiagrams, demonstrationLayouts, isDiagram } from '../src/plan.mjs';

const makeSlide = (id, layout, headline, extra = {}) => ({
  id, layout, headline, alt: 'Uma descrição da lâmina.', ...extra,
});

function deck() {
  return {
    mode: 'editorial_art',
    slides: [
      makeSlide('one', 'hero_bleed', 'Organize seu mural em três passos', { diagram: 'focus' }),
      makeSlide('two', 'split_horizontal', 'Seu mural precisa de uma entrada', { diagram: 'steps' }),
      makeSlide('three', 'cta_closing', 'Salve antes da próxima revisão'),
    ],
  };
}

test('compila o acento claro em pares sRGB legíveis', () => {
  const palette = paletteFor({ light: '#ffffff', dark: '#171412', accent: '#fff3a4' });
  assert.equal(palette.valid, true);
  assert.ok(contrast(palette.accentOnLight, palette.light) >= 4.8);
  assert.ok(contrast(palette.accentOnDark, palette.dark) >= 5.2);
  assert.equal(accentAgainst('#ffdeaa', '#777777', 20), null);
});

test('valida arcos, limites PT-BR e dados incorporados', () => {
  const valid = deck();
  assert.equal(layouts.length, 12);
  assert.deepEqual(validateDeck(valid), []);
  assert.equal(cadence(valid).status, 'pass');
  valid.slides[1] = makeSlide('one', 'stat_monument', 'Por isso uma estatística', { art: 'https://example.test/asset', alt: '' });
  assert.deepEqual(validateDeck(valid).map(check => check.id).sort(),
    ['ALT', 'ART_SOURCE', 'DUPLICATE_ID', 'S2_DEPENDENT_OPEN', 'STAT_SOURCE'].sort());
});

test('escapa copy e não interpreta HTML vindo do plano', () => {
  const slide = makeSlide('two', 'typo_breather', '<img src=bad> & acento', { accentPhrase: 'acento' });
  const document = slideDocument(slide, { index: 2, palette: paletteFor(), fonts: {} });
  assert.match(document, /&lt;img src=bad&gt; &amp; <em data-ink>acento<\/em>/);
  assert.doesNotMatch(document, /<img src=bad>/);
  assert.match(document, /default-src 'none'/);
});

test('comparações governam a mesma amostra e dois rótulos distintos', () => {
  const sample = { type: 'type_scale', labels: ['Menor', 'Maior'], sample: 'Seu anúncio' };
  assert.deepEqual(demonstrationDiagrams, ['contrast', 'type_scale', 'hierarchy']);
  assert.ok(isDiagram(sample));
  assert.ok(isDiagram({ ...sample, type: 'contrast' }));
  assert.ok(isDiagram({ type: 'hierarchy', labels: ['Peso igual', 'Título primeiro'], items: ['Título', 'Preço', 'Selo'] }));
  assert.ok(isDiagram('balance'));
  assert.ok(isDiagram({ type: 'balance', labels: ['Opção antiga'] }));
  for (const invalid of [
    'type_scale',
    { ...sample, labels: ['Menor', 'menor'] },
    { ...sample, labels: ['Menor', 'Maior', 'Ambos'] },
    { ...sample, labels: ['Tem mais palavras aqui', 'Maior'] },
    { ...sample, sample: 'Uma frase longa demais' },
    { ...sample, sample: '<svg>Opa</svg>' },
    { ...sample, stroke: '#ff0000' },
    { type: 'hierarchy', labels: sample.labels, items: ['Título', 'Preço', 'Preço'] },
    { type: 'hierarchy', labels: sample.labels, items: ['Título', 'Preço'] },
  ]) assert.equal(isDiagram(invalid), false, JSON.stringify(invalid));
});

test('comparação exige um painel largo com espaço dedicado', () => {
  const valid = deck();
  const diagram = { type: 'type_scale', labels: ['Menor', 'Maior'], sample: 'Seu anúncio' };
  for (const layout of demonstrationLayouts) {
    valid.slides[1] = makeSlide('two', layout, 'A escala muda a leitura', { diagram });
    assert.deepEqual(validateDeck(valid), []);
  }
  valid.slides[1] = makeSlide('two', 'split_vertical', 'A escala muda a leitura', { diagram });
  assert.deepEqual(validateDeck(valid).map(check => check.id), ['DEMONSTRATION_LAYOUT']);
  valid.slides[1] = makeSlide('two', 'split_horizontal', 'A escala muda a leitura', { diagram, art: 'data:image/png;base64,AA==' });
  assert.deepEqual(validateDeck(valid).map(check => check.id), ['DEMONSTRATION_LAYOUT']);
});
