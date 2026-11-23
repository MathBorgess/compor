import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { contrast, layouts, paletteFor, renderDeck, renderDeckInMemory } from '../src/index.mjs';
import { slideDocument } from '../src/layouts.mjs';

const web = new URL('../../../apps/web/', import.meta.url);
const require = createRequire(new URL('package.json', web));
const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
const skip = executablePath ? false : 'Defina BROWSER_EXECUTABLE_PATH para rodar o canário Chromium.';
const profile = 'compor-carousel-jpeg-4x5.v1';

function slide(layout, headline, extra = {}) {
  return { id: layout, layout, headline, alt: 'Uma lâmina sintética de leitura em português.', ...extra };
}

async function syntheticArt(sharp, background, fill) {
  const figure = Buffer.from(`<svg width="320" height="400"><circle cx="160" cy="130" r="54" fill="${fill}"/><rect x="78" y="206" width="164" height="105" rx="12" fill="${fill}"/></svg>`);
  const png = await sharp({create: {width: 320, height: 400, channels: 3, background}})
    .composite([{input: figure}]).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function decks(lightArt, darkArt) {
  return [
    [
      slide('hero_bleed', 'À luz, o café muda', {art: lightArt, accentPhrase: 'café', kicker: 'Luz natural', bridge: 'hairline_thread'}),
      slide('split_horizontal', 'Grão úmido pede atenção', {art: darkArt, accentPhrase: 'úmido', body: 'Compare a cor do café à luz da manhã.'}),
      slide('split_vertical', 'Iluminação e composição alteram cartões', {art: lightArt, accentPhrase: 'composição', body: 'Procure equilíbrio entre a chávena e o fundo.'}),
      slide('framed_plate', 'Papel dá textura', {art:darkArt}),
      slide('stat_monument', 'Cada passo tem função', {figure: '4×', source: 'Dado sintético usado no canário.', polarity: 'inverted', body: 'Repita o teste em condições iguais.'}),
      slide('svg_diagram', 'Um caminho por vez', {diagram: 'flow', accentPhrase: 'caminho', body: 'Separe a preparação da execução da tarefa.'}),
      slide('cta_closing', 'Salve para a próxima sessão', {polarity: 'inverted'}),
    ],
    [
      slide('hero_bleed', 'Há ritmo na edição', {art: darkArt, accentPhrase: 'ritmo', bridge: 'color_band_echo'}),
      slide('bento_grid', 'Quatro ações pequenas', {accentPhrase: 'ações', listItems: ['Ângulo', 'Luz lateral', 'Enquadramento', 'Proporção']}),
      slide('comparison_dual', 'Duas formas de começar', {diagram: 'balance', listItems: ['Um rascunho rápido', 'Uma referência visual']}),
      slide('typo_breather', 'Menos ruído, mais intenção', {accentPhrase: 'intenção', body: 'Reserve uma pausa antes de escolher as cores.'}),
      slide('artifact_proof', 'O próprio papel prova', {art: lightArt, source: 'Arte sintética da bancada.'}),
      slide('native_serial', 'Guarde decisões pequenas', {body: 'Anote a mudança que mais ajudou a ler à primeira vista.'}),
      slide('framed_plate', 'A tensão encontra espaço', {art: darkArt}),
      slide('cta_closing', 'Envie para quem cria com você'),
    ],
  ].map(slides => ({mode: 'editorial_art', tokens: {light: '#ffffff', dark: '#171412', accent: '#fff3a4'}, slides}));
}

async function verifyAssets(result, directory, sharp, expectedArtifacts = ['art-sheet.jpg', 'contact-sheet.png', 'cover-grid.png']) {
  for (const artifact of [...result.slides, ...result.artifacts]) {
    const bytes = await readFile(join(directory, artifact.file));
    assert.equal(bytes.length, artifact.bytes, artifact.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.file);
  }
  for (const {file} of result.slides) {
    const info = await sharp(join(directory, file)).metadata();
    assert.deepEqual([info.width, info.height, info.format, info.space, info.chromaSubsampling], [1080, 1350, 'jpeg', 'srgb', '4:4:4'], file);
    assert.equal(info.hasProfile, true, file);
    assert.equal(info.isProgressive, false, file);
  }
  const cover = await sharp(join(directory, 'cover-grid.png')).metadata();
  assert.deepEqual([cover.width, cover.height], [270, 360]);
  assert.deepEqual(result.artifacts.map(artifact => artifact.file).sort(), expectedArtifacts);
}

test('Chromium renderiza os doze arquétipos em JPEG sRGB e registra o fit', {skip, timeout: 60_000}, async t => {
  const {chromium} = require('playwright-core');
  const sharp = require('sharp');
  const directory = await mkdtemp(join(tmpdir(), 'compor-carousel-browser-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const browser = await chromium.launch({executablePath, headless: true});
  t.after(() => browser.close());
  const [regular, bold, lightArt, darkArt] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
    syntheticArt(sharp, '#ffffff', '#5a4032'),
    syntheticArt(sharp, '#252367', '#efae27'),
  ]);
  const fixtures = decks(lightArt, darkArt);
  assert.deepEqual([...new Set(fixtures.flatMap(deck => deck.slides.map(item => item.layout)))].sort(), [...layouts].sort());

  const failures = [];
  const duplicates = [];
  const fitted = [];
  for (const [index, deck] of fixtures.entries()) {
    const outputDir = join(directory, `deck-${index + 1}`);
    const result = await renderDeck(deck, {outputDir, browser, sharp, fonts: {400: regular, 700: bold}});
    assert.equal(result.profile, profile);
    assert.equal(result.slides.length, deck.slides.length, JSON.stringify(result.checks));
    await verifyAssets(result, outputDir, sharp);
    failures.push(...result.checks.filter(check => check.status === 'fail' && check.id !== 'DUPLICATE_VISUAL'));
    const duplication = result.checks.find(check => check.id === 'DUPLICATE_VISUAL');
    assert.equal(duplication?.status, 'fail', 'as imagens repetidas foram plantadas na fixture');
    duplicates.push(duplication.observed.pairs.filter(pair => pair.exact).map(pair => pair.slides));
    for (const item of result.slides) {
      failures.push(...item.checks.filter(check => check.status === 'fail').map(check => ({layout: item.id, ...check})));
      if (item.repairs.includes('fit_to_floor')) fitted.push(item);
    }
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(duplicates, [[[1, 3], [2, 4]], [[1, 7]]]);
  const fit = fitted.find(item => item.id === 'split_vertical');
  assert.ok(fit, 'o texto longo na coluna exerce a recuperação de fit');
  assert.ok(fit.firstChecks.some(check => check.status === 'fail'));
  assert.ok(fit.checks.every(check => check.status === 'pass'));
});

test('folha raster preserva bordas e vincula os pixels à lâmina correta', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const stripe = background => ({ create: { width: 48, height: 120, channels: 3, background } });
  const image = await sharp({ create: { width: 480, height: 120, channels: 3, background: '#eeeeee' } })
    .composite([{ input: stripe('#ff0000'), left: 0, top: 0 }, { input: stripe('#0000ff'), left: 432, top: 0 }])
    .png().toBuffer();
  const encoded = image.toString('base64');
  const result = await renderDeckInMemory({ mode: 'editorial_art', slides: [
    slide('hero_bleed', 'Dê forma ao contraste'),
    slide('split_horizontal', 'Duas cores ocupam as bordas', { art: 'data:image/png;base64,' + encoded }),
    slide('framed_plate', 'O painel guarda o registro', { art: 'data:image/jpeg;base64,' + encoded }),
    slide('svg_diagram', 'Compare antes de fechar', { diagram: 'flow' }),
    slide('cta_closing', 'Salve para praticar'),
  ] }, { browser, sharp, fonts: { 400: regular, 700: bold } });
  const { embeddedSha256, ...source } = result.slides[1].artSource;
  assert.deepEqual(source, {
    sha256: createHash('sha256').update(image).digest('hex'), bytes: image.length,
    format: 'png', width: 480, height: 120,
  });
  const normalized = await sharp(image).autoOrient().resize({
    width: 1080, height: 1350, fit: 'inside', withoutEnlargement: true,
  }).png().toBuffer();
  assert.equal(embeddedSha256, createHash('sha256').update(normalized).digest('hex'));
  assert.equal(result.slides[2].file, undefined);
  assert.equal(result.slides[2].checks[0].id, 'ASSET_DECODE');
  assert.equal(result.slides[2].checks[0].status, 'fail');
  const sheet = result.artifacts.find(item => item.file === 'art-sheet.jpg');
  assert.deepEqual(sheet.tiles, [{ slideIndex: 2, slideId: 'split_horizontal', column: 0, row: 0 }]);
  const { data, info } = await sharp(sheet.data).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height], [360, 450]);
  const pixel = x => [...data.subarray((225 * info.width + x) * 3, (225 * info.width + x) * 3 + 3)];
  const [redLeft, , blueLeft] = pixel(8);
  const [redRight, , blueRight] = pixel(352);
  assert.ok(redLeft > 220 && blueLeft < 35, 'a borda esquerda permanece na folha');
  assert.ok(blueRight > 220 && redRight < 35, 'a borda direita permanece na folha');
});

const demonstrationSlides = [
  slide('hero_bleed', 'Seu anúncio some no feed?', { body: 'Três ajustes para ler sem ampliar.' }),
  slide('split_horizontal', 'Dê escala à mensagem', {
    body: 'Abra a prévia a 360 px e aumente a frase principal até ler sem zoom.',
    diagram: { type: 'type_scale', labels: ['Texto pequeno', 'Texto ampliado'], sample: 'Seu anúncio' },
  }),
  slide('svg_diagram', 'Separe a frase do fundo', {
    polarity: 'inverted', body: 'Compare a mesma frase sobre o mesmo fundo.',
    diagram: { type: 'contrast', labels: ['Contraste baixo', 'Contraste alto'], sample: 'Seu anúncio' },
  }),
  slide('comparison_dual', 'Escolha o que aparece primeiro', {
    body: 'Dê peso ao título e use preço e selo como apoio.',
    diagram: { type: 'hierarchy', labels: ['Peso igual', 'Título dominante'], items: ['Título', 'Preço', 'Selo'] },
  }),
  slide('cta_closing', 'Salve para revisar seu anúncio'),
];

function effectiveContrast({ fill, opacity }, background) {
  const channels = color => color.match(/\d+/g).map(Number);
  const [r, g, b] = channels(background);
  const bg = [r, g, b];
  const hex = values => '#' + values.map(value => value.toString(16).padStart(2, '0')).join('');
  const paint = channels(fill).map((value, index) => Math.round(value * opacity + bg[index] * (1 - opacity)));
  return contrast(hex(paint), hex(bg));
}

test('comparações mostram mudanças reais e rótulos legíveis nos JPEGs', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const directory = await mkdtemp(join(tmpdir(), 'compor-carousel-diagrams-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const fonts = { 400: regular, 700: bold };
  const tokens = { light: '#ffffff', dark: '#171412', accent: '#bc5c35' };
  const result = await renderDeck({ mode: 'editorial_art', tokens, slides: demonstrationSlides }, { outputDir: directory, browser, sharp, fonts, repair: false });
  assert.equal(result.slides.length, demonstrationSlides.length, JSON.stringify(result.checks));
  const failures = [...result.checks, ...result.slides.flatMap(item => item.checks)].filter(check => check.status !== 'pass');
  assert.deepEqual(failures, []);
  assert.ok(result.slides.slice(1, 4).every(item => item.artAreaFraction >= 0.12));
  await verifyAssets(result, directory, sharp, ['contact-sheet.png', 'cover-grid.png']);

  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    for (const [index, item] of demonstrationSlides.entries()) {
      if (!item.diagram) continue;
      await page.setContent(slideDocument(item, { index: index + 1, palette: paletteFor(tokens), fonts }));
      await page.evaluate(() => document.fonts.ready);
      const panels = await page.locator('.diagram-panel').evaluateAll(figures => figures.map(figure => {
        const svg = figure.querySelector('svg');
        return {
          label: figure.querySelector('figcaption').textContent,
          background: getComputedStyle(svg.querySelector('rect')).fill,
          text: Array.from(svg.querySelectorAll('text'), text => {
            const style = getComputedStyle(text);
            const { x, y, width, height } = text.getBBox();
            return { value: text.textContent, size: parseFloat(style.fontSize), fill: style.fill, opacity: Number(style.opacity), x, y, width, height };
          }),
        };
      }));
      const values = item.diagram.items ?? [item.diagram.sample];
      assert.deepEqual(panels.map(panel => panel.label), item.diagram.labels);
      for (const { text } of panels) assert.deepEqual(text.map(sample => sample.value), values);
      for (const sample of panels.flatMap(panel => panel.text)) {
        assert.ok(sample.x >= 0 && sample.x + sample.width <= 420);
        assert.ok(sample.y >= 0 && sample.y + sample.height <= 192);
      }
      const [left, right] = panels;
      if (item.diagram.type === 'type_scale') {
        assert.equal(right.text[0].size / left.text[0].size, 2);
        assert.equal(right.text[0].opacity, left.text[0].opacity);
      } else if (item.diagram.type === 'contrast') {
        assert.equal(right.background, left.background);
        assert.equal(right.text[0].size, left.text[0].size);
        assert.ok(effectiveContrast(left.text[0], left.background) < 4.5);
        assert.ok(effectiveContrast(right.text[0], right.background) >= 4.5);
      } else {
        assert.deepEqual(left.text.map(sample => sample.size), [26, 26, 26]);
        assert.deepEqual(right.text.map(sample => sample.size), [56, 26, 26]);
        assert.ok(right.text[0].y < right.text[1].y);
      }
    }
  } finally {
    await page.close();
  }
});
