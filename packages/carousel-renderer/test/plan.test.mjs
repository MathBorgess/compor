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
  assert.deepEqual(demonstrationDiagrams, ['contrast', 'type_scale', 'hierarchy', 'category_split', 'orientation']);
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

const categories = { type: 'category_split', labels: ['Antes da prévia', 'Na prévia'], items: ['Peça editável', 'Imagem da peça'] };
const orientation = { type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Um café com leite' };

test('categorias e orientação aceitam somente campos, rótulos e amostras do contrato', () => {
  assert.ok(isDiagram(categories));
  assert.ok(isDiagram(orientation));
  for (const invalid of [
    'category_split',
    'orientation',
    { ...categories, labels: ['Prévia', 'Pre\u0301via'] },
    { ...categories, labels: ['Frase com quatro palavras', 'Na prévia'] },
    { ...categories, items: ['Peça editável', 'peça editável'] },
    { ...categories, items: ['A imagem longa demais', 'Imagem da peça'] },
    { ...categories, items: ['Peça editável'] },
    { ...categories, items: ['Oi Oi Oi Oi Oi', 'Imagem da peça'] },
    { ...categories, sample: 'Imagem da peça' },
    { ...orientation, labels: [...orientation.labels].reverse() },
    { ...orientation, labels: ['Em pé', 'Invertido'] },
    { ...orientation, labels: [...orientation.labels, 'Outra'] },
    { ...orientation, sample: 'Uma expressão longa' },
    { ...orientation, sample: 'Café\ncom leite' },
    { ...orientation, sample: '<text>Oi</text>' },
    { ...orientation, items: ['Em pé', 'Invertido'] },
    { ...orientation, rotation: 90 },
  ]) assert.equal(isDiagram(invalid), false, JSON.stringify(invalid));
});

test('comparação exige um painel largo com espaço dedicado', () => {
  const valid = deck();
  const typeScale = { type: 'type_scale', labels: ['Menor', 'Maior'], sample: 'Seu anúncio' };
  for (const diagram of [typeScale, categories, orientation]) {
    for (const layout of demonstrationLayouts) {
      valid.slides[1] = makeSlide('two', layout, 'Compare as duas opções', { diagram });
      assert.deepEqual(validateDeck(valid), []);
    }
    valid.slides[1] = makeSlide('two', 'split_vertical', 'Compare as duas opções', { diagram });
    assert.deepEqual(validateDeck(valid).map(check => check.id), ['DEMONSTRATION_LAYOUT']);
    valid.slides[1] = makeSlide('two', 'split_horizontal', 'Compare as duas opções', { diagram, art: 'data:image/png;base64,AA==' });
    assert.deepEqual(validateDeck(valid).map(check => check.id), ['DEMONSTRATION_LAYOUT']);
  }
});

test('arte raster não pode ocultar um diagrama nem ficar oculta no fechamento', () => {
  const valid = deck();
  const art = 'data:image/png;base64,AA==';
  valid.slides[1] = makeSlide('two', 'split_horizontal', 'A escala muda a leitura', { diagram: 'flow', art });
  assert.deepEqual(validateDeck(valid).map(check => check.id), ['ART_SLOT']);
  valid.slides[1] = makeSlide('two', 'cta_closing', 'Salve para praticar', { art });
  assert.deepEqual(validateDeck(valid).map(check => check.id), ['ART_SLOT']);
});
