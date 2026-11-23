import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { layouts, renderDeck } from '../src/index.mjs';

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

async function verifyAssets(result, directory, sharp) {
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
  assert.deepEqual(result.artifacts.map(artifact => artifact.file).sort(), ['art-sheet.jpg', 'contact-sheet.png', 'cover-grid.png']);
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
