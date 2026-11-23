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
const denseCopy = Array(8).fill('Uma linha com quebra obrigatória.').join('\n');

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
  const finalTypography = fit.checks.find(check => check.id === 'TYPOGRAPHY');
  assert.equal(fit.artPlacement.text.filter(box => box.region === 'headline').length, finalTypography.observed.lines);
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
  assert.equal(result.slides[2].artPlacement, undefined);
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

test('geometria raster usa o recorte real, o enquadramento e as linhas finais de texto', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const wideArt = async background => 'data:image/png;base64,' + (await sharp({
    create: { width: 480, height: 120, channels: 3, background },
  }).png().toBuffer()).toString('base64');

  // Use Chromium's normal layout with one test-only positioning rule. The
  // compositor's production CSS position and choices stay unchanged.
  const positionedBrowser = {
    async newContext(options) {
      const context = await browser.newContext(options);
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        const setContent = page.setContent.bind(page);
        page.setContent = (html, settings) => setContent(html.replace('</style>',
          '.framed_plate .media img{object-position:right 14px top 6px}</style>'), settings);
        return page;
      };
      return context;
    },
  };
  const result = await renderDeckInMemory({ mode: 'editorial_art', slides: [
    slide('hero_bleed', 'Luz da manhã', { art: await wideArt('#6d4028') }),
    slide('framed_plate', 'Luz da manhã\nEnquadre o café', {
      art: await wideArt('#c23d62'), accentPhrase: 'da manhã', body: 'Compare as sombras.\nFaça uma nova foto.',
    }),
    slide('artifact_proof', 'O detalhe cabe na foto', { art: await wideArt('#2361b3'), source: 'Foto do briefing' }),
    slide('bento_grid', 'Ajustes que mudam a cena', {
      art: await wideArt('#34755e'), listItems: ['Só a luz', 'Sem flash'],
    }),
    slide('cta_closing', 'Salve para praticar'),
  ] }, { browser: positionedBrowser, sharp, fonts: { 400: regular, 700: bold }, repair: false });

  const [hero, framed, proof, bento, closing] = result.slides;
  assert.deepEqual(hero.artPlacement.image, { left: -2160, top: 0, right: 3240, bottom: 1350 });
  assert.deepEqual(hero.artPlacement.clip, { left: 0, top: 0, right: 1080, bottom: 1350 });
  // The image box begins at 104 × 172, inside the 4 px border and 12 px
  // padding. Cover overflows horizontally and the position shifts both axes.
  assert.deepEqual(framed.artPlacement.image, { left: -750, top: 178, right: 962, bottom: 606 });
  assert.deepEqual(framed.artPlacement.clip, { left: 104, top: 178, right: 962, bottom: 600 });
  assert.deepEqual(proof.artPlacement.image, { left: 88, top: 917, right: 992, bottom: 1143 });
  assert.deepEqual(proof.artPlacement.clip, proof.artPlacement.image, 'o contain exclui o espaço vazio');
  assert.equal(closing.artPlacement, undefined);

  const headline = framed.artPlacement.text.filter(box => box.region === 'headline');
  const body = framed.artPlacement.text.filter(box => box.region === 'body');
  assert.equal(headline.length, 2, 'os trechos acentuado e regular da primeira linha compartilham a caixa');
  assert.equal(body.length, 2);
  assert.ok(headline[0].top < headline[1].top && headline[1].bottom < body[0].top,
    JSON.stringify({headline, body}));
  assert.ok(framed.artPlacement.text.every(box => box.left >= 88 && box.right <= 992 && box.top > framed.artPlacement.clip.bottom));
  assert.equal(proof.artPlacement.text.filter(box => box.region === 'source').length, 1);
  const list = bento.artPlacement.text.filter(box => box.region === 'list');
  assert.equal(list.length, 2);
  assert.equal(list[0].top, list[1].top);
  assert.ok(list[0].right < list[1].left, 'cada célula mantém sua caixa mesmo na mesma linha visual');

  const decoded = await sharp(framed.data).raw().toBuffer({ resolveWithObject: true });
  const sample = (x,y) => [...decoded.data.subarray((y * decoded.info.width + x) * 3, (y * decoded.info.width + x) * 3 + 3)];
  const isRaster = ([red, green, blue]) => Math.abs(red - 194) < 12 && Math.abs(green - 61) < 12 && Math.abs(blue - 98) < 12;
  assert.equal(isRaster(sample(112, 190)), true, 'o raster pinta dentro do recorte');
  assert.equal(isRaster(sample(970, 280)), false, 'o deslocamento deixa espaço à direita');
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
  slide('framed_plate', 'Separe condições de observações', {
    body: 'Registre a luz da cena e o efeito que ela produz na foto.',
    diagram: { type: 'category_split', labels: ['Condição do teste', 'Padrão observado'], items: ['Luz lateral', 'Sombra longa'] },
  }),
  slide('svg_diagram', 'Vire o texto para revisar', {
    id: 'orientation', polarity: 'inverted', body: 'Observe a forma das letras quando a leitura não é automática.',
    diagram: { type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Um café com leite' },
  }),
  slide('cta_closing', 'Um título puxa o olhar', {
    body: 'Salve para revisar seu próximo anúncio.',
    diagram: { type: 'hierarchy', labels: ['Peso igual', 'Título em destaque'], items: ['Título', 'Preço', 'Selo'] },
  }),
];

test('capa com comparação horizontal conserva manchete inteira na primeira passagem', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const cover = slide('split_horizontal', 'Anúncio a 360px: texto pequeno some', {
    kicker: '3 motivos de baixa leitura no feed',
    diagram: { type: 'type_scale', labels: ['Texto pequeno', 'Texto legível'], sample: 'Oferta' },
  });
  const result = await renderDeckInMemory({
    mode: 'editorial_art',
    slides: [cover, demonstrationSlides[2], demonstrationSlides.at(-1)],
  }, { browser, sharp, fonts: { 400: regular, 700: bold }, repair: false });

  const [first] = result.slides;
  assert.deepEqual(first.firstChecks.filter(check => check.status === 'fail'), []);
  assert.deepEqual(first.repairs, []);
  assert.equal(first.checks.find(check => check.id === 'TYPOGRAPHY').observed.headline, 116);
  assert.equal(first.artAreaFraction, 904 * 360 / (1080 * 1350));
  const crop = await sharp(result.artifacts.find(artifact => artifact.file === 'cover-grid.png').data).metadata();
  assert.deepEqual([crop.width, crop.height], [270, 360]);
});

test('capas com diagrama preservam a escala do texto dentro da margem segura', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const covers = [
    ['svg_diagram', '3 motivos para anúncios sumirem em 360px', 'Um guia visual para revisar criativos no feed mobile.'],
    ['comparison_dual', '3 motivos para anúncios sumirem em 360px', 'Um guia visual para revisar criativos no feed mobile.'],
    ['framed_plate', 'Organização da chegada para uma leitura confortável', 'Organize a recepção e confira por onde as pessoas entram e saem sem esbarrar na fila.'],
    ['split_horizontal', 'Descontos sucessivos: guia para usar bases diferentes', 'Entenda como aplicar cada desconto ao preço que está valendo.'],
  ];
  for (const [layout, title, copy] of covers) {
    await t.test(layout, async () => {
      const cover = slide(layout, title, {
        id: 'capa', body: copy,
        diagram: { type: 'focus', labels: ['Feed', 'Anúncio'] },
      });
      const result = await renderDeckInMemory({
        mode: 'editorial_art',
        slides: [cover, demonstrationSlides[1], demonstrationSlides.at(-1)],
      }, { browser, sharp, fonts: { 400: regular, 700: bold }, repair: false });
      const [first] = result.slides;
      assert.deepEqual(first.firstChecks.filter(check => check.status === 'fail'), []);
      assert.deepEqual(first.repairs, []);
      const { headline, body } = first.checks.find(check => check.id === 'TYPOGRAPHY').observed;
      assert.deepEqual({ headline, body }, { headline: 108, body: 46 });
      assert.ok(first.artAreaFraction >= 0.12);
    });
  }
});

test('painéis básicos conservam a margem da copy e recusam excesso de texto', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold, art] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
    syntheticArt(sharp, '#ffffff', '#5a4032'),
  ]);
  const fonts = { 400: regular, 700: bold };
  const diagram = slide('split_horizontal', 'Proteja a circulação durante a recepção', {
    body: 'Após a divisão dos lugares, verifique a passagem entre as cadeiras e deixe à vista o caminho da saída. Confirme que os hóspedes conseguem passar sem pisar em cabos.',
    diagram: { type: 'steps', labels: ['Chegada à sala', 'Separação dos grupos', 'Preparação da saída'] },
  });
  const makeDeck = item => ({ mode: 'editorial_art', slides: [demonstrationSlides[0], item, demonstrationSlides.at(-1)] });
  const result = await renderDeckInMemory(makeDeck(diagram), { browser, sharp, fonts, repair: false });
  const item = result.slides[1];
  assert.deepEqual(item.checks.filter(check => check.status === 'fail'), []);
  assert.deepEqual(item.repairs, []);
  assert.deepEqual(item.checks.find(check => check.id === 'TYPOGRAPHY').observed,
    { headline: 86, body: 46, figure: undefined, lines: 2 });
  assert.equal(item.artAreaFraction, 904 * 360 / (1080 * 1350));

  const framedWithList = slide('framed_plate', 'Devolução de potes começa pelo registro', {
    body: 'Na ficha fictícia, preencha pessoa, data e quantidade para registrar a devolução.',
    diagram: { type: 'focus', labels: ['Pessoa', 'Data', 'Quantidade'] },
    listItems: ['Pessoa: nome fictício', 'Data: data fictícia', 'Quantidade: quantidade fictícia'],
  });
  const framed = await renderDeckInMemory(makeDeck(framedWithList), { browser, sharp, fonts, repair: false });
  assert.ok(framed.slides[1].checks.every(check => check.status === 'pass'));
  assert.deepEqual(framed.slides[1].repairs, []);
  assert.equal(framed.slides[1].artAreaFraction, 904 * 360 / (1080 * 1350));

  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  t.after(() => page.close());
  await page.setContent(slideDocument({ ...diagram, diagram: undefined, art }, { index: 2, palette: paletteFor(), fonts }));
  assert.equal((await page.locator('.media').boundingBox()).height, 510);

  const dense = await renderDeckInMemory(makeDeck({ ...diagram, body: denseCopy }), { browser, sharp, fonts });
  assert.equal(dense.slides[1].checks.find(check => check.id === 'SAFE_ZONE').status, 'fail');
});

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
  assert.ok(result.slides.slice(1, -1).every(item => item.artAreaFraction >= 0.12));
  assert.ok(result.slides.at(-1).artAreaFraction >= 0.12);
  await verifyAssets(result, directory, sharp, ['contact-sheet.png', 'cover-grid.png']);

  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  try {
    for (const [index, item] of demonstrationSlides.entries()) {
      if (!item.diagram) continue;
      await page.setContent(slideDocument(item, { index: index + 1, palette: paletteFor(tokens), fonts }));
      await page.evaluate(() => document.fonts.ready);
      if (item.layout === 'cta_closing') {
        const area = await page.locator('.diagram-demonstration').boundingBox();
        const headline = await page.locator('main h1').boundingBox();
        const action = page.locator('main .body');
        assert.ok(area.y + area.height + 38 <= headline.y);
        assert.ok((await action.boundingBox()).y >= headline.y + headline.height);
        assert.equal(await action.textContent(), item.body);
      }
      if (item.diagram.type === 'category_split' || item.diagram.type === 'orientation') {
        const panels = await page.locator('.diagram-panel').evaluateAll(figures => figures.map(figure => {
          const sample = figure.querySelector('[data-region="diagram-sample"]');
          const caption = figure.querySelector('figcaption');
          const sampleStyle = getComputedStyle(sample);
          const frame = getComputedStyle(sample.parentElement);
          const { width, height } = sample.parentElement.getBoundingClientRect();
          return {
            label: caption.textContent, text: sample.textContent, rotation: sampleStyle.transform,
            captionTransform: getComputedStyle(caption).transform,
            appearance: { color: sampleStyle.color, background: frame.backgroundColor, border: frame.borderColor, width, height },
            children: Array.from(figure.children, child => child.tagName),
          };
        }));
        const values = item.diagram.items ?? [item.diagram.sample, item.diagram.sample];
        assert.deepEqual(panels.map(panel => panel.text), values);
        assert.deepEqual(panels.map(panel => panel.label), item.diagram.labels);
        assert.deepEqual(panels.map(panel => panel.rotation), ['none', item.diagram.type === 'orientation' ? 'matrix(-1, 0, 0, -1, 0, 0)' : 'none']);
        assert.deepEqual(panels.map(panel => panel.captionTransform), ['none', 'none']);
        assert.deepEqual(panels.map(panel => panel.children), [['DIV', 'FIGCAPTION'], ['DIV', 'FIGCAPTION']]);
        assert.deepEqual(panels[0].appearance, panels[1].appearance);
        continue;
      }
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
        assert.deepEqual(left.text.map(sample => sample.size), [32, 32, 32]);
        assert.deepEqual(right.text.map(sample => sample.size), [56, 32, 32]);
        assert.ok(right.text[0].y < right.text[1].y);
      }
    }
  } finally {
    await page.close();
  }
});

function colorHex(value) {
  const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number);
  return '#' + channels.map(channel => Math.round(value.startsWith('color(srgb') ? channel * 255 : channel)
    .toString(16).padStart(2, '0')).join('');
}

test('prova de respiro muda apenas a posição dos vizinhos e mantém rótulos legíveis', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const fonts = { 400: regular, 700: bold };
  const tokens = { light: '#f4f0e8', dark: '#20242a', accent: '#e85a3f' };
  const alt = 'Duas placas mostram o mesmo losango e quatro formas vizinhas. Na placa "Vizinhos afastados", há mais espaço em volta do losango.';
  const cover = slide('framed_plate', 'Organize as formas antes do texto', { diagram: 'focus' });
  const closing = slide('cta_closing', 'Salve para sua próxima ilustração');
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  t.after(() => page.close());

  for (const polarity of ['base', 'inverted']) {
    const proof = slide('svg_diagram', 'O espaço livre reforça o foco', {
      body: 'Observe o espaço ao redor da forma principal. Afaste as formas vizinhas para abrir espaço em torno dela.',
      diagram: { type: 'spacing' }, polarity, alt,
    });
    const result = await renderDeckInMemory({ mode:'editorial_art', tokens, slides:[cover, proof, closing] },
      { browser, sharp, fonts, repair:false });
    const item = result.slides[1];
    assert.ok(item.firstChecks.every(check => check.status === 'pass'));
    assert.ok(item.checks.every(check => check.status === 'pass'));
    assert.deepEqual(item.repairs, []);
    assert.equal(item.artAreaFraction, 904 * 360 / (1080 * 1350));
    const cadence = result.checks.find(check => check.id === 'COLLECTION_CADENCE');
    assert.equal(cadence.status, 'pass');
    assert.equal(cadence.observed.visualCoverage, 2 / 3);
    assert.deepEqual(result.altTexts[1], { index: 2, alt });

    await page.setContent(slideDocument(proof, { index:2, palette:paletteFor(tokens), fonts }));
    await page.evaluate(() => document.fonts.ready);
    const panel = page.getByRole('img', { name:alt });
    assert.deepEqual(await panel.boundingBox(), { x:88, y:156, width:904, height:360 });
    const background = colorHex(await page.locator('main').evaluate(main => getComputedStyle(main).backgroundColor));
    const plates = await panel.locator('figure').evaluateAll(figures => figures.map(figure => {
      const frame = figure.querySelector('.spacing-frame');
      const focus = figure.querySelector('.spacing-focus');
      const context = figure.querySelector('.spacing-context');
      const center = focus.getBBox();
      const caption = figure.querySelector('figcaption');
      const captionStyle = getComputedStyle(caption);
      return {
        label: caption.textContent, region: caption.dataset.region,
        labelColor: captionStyle.color, fontSize: Number.parseFloat(captionStyle.fontSize),
        frame: frame.outerHTML, focus: focus.outerHTML, focusColor: getComputedStyle(focus).fill,
        stroke: getComputedStyle(context).stroke, strokeWidth: getComputedStyle(context).strokeWidth,
        neighbors: [...context.children].map(neighbor => {
          const { e:x, f:y } = neighbor.transform.baseVal.getItem(0).matrix;
          return { shape: neighbor.innerHTML, offset: Math.hypot(x - center.x - center.width / 2, y - center.y - center.height / 2) };
        }),
      };
    }));
    const [near, far] = plates;
    assert.deepEqual(plates.map(plate => plate.label), ['Vizinhos próximos', 'Vizinhos afastados']);
    assert.ok(plates.every(plate => plate.fontSize / 3 >= 12 && plate.region === 'diagram-label' && contrast(colorHex(plate.labelColor), background) >= 4.5));
    assert.equal(near.frame, far.frame);
    assert.equal(near.focus, far.focus);
    assert.equal(near.focusColor, far.focusColor);
    assert.equal(near.stroke, far.stroke);
    assert.equal(near.strokeWidth, far.strokeWidth);
    assert.ok(contrast(colorHex(near.focusColor), background) >= 3);
    assert.ok(contrast(colorHex(near.stroke), background) >= 3);
    assert.equal(near.neighbors.length, 4);
    assert.deepEqual(near.neighbors.map(neighbor => neighbor.shape), far.neighbors.map(neighbor => neighbor.shape));
    assert.ok(far.neighbors.every((neighbor, index) => neighbor.offset > near.neighbors[index].offset));
  }
});

test('provas isolam escala do foco e agrupamento dos vizinhos', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const fonts = { 400: regular, 700: bold };
  const tokens = { light: '#f4f0e7', dark: '#202d35', accent: '#d95d39' };
  const cover = slide('framed_plate', 'Hierarquia da ilustração antes do texto', { id: 'capa', diagram: 'focus' });
  const closing = slide('cta_closing', 'Salve o guia para sua próxima ilustração');
  const scale = slide('split_horizontal', 'Use escala para indicar a forma principal', {
    body: 'Compare os tamanhos das formas. Aumente a escolhida como foco e mantenha as demais menores para criar uma diferença visível.',
    alt: 'À esquerda, os círculos têm o mesmo tamanho. À direita, só o círculo central aumenta.',
    diagram: { type: 'shape_scale' },
  });
  const grouping = slide('framed_plate', 'Organize o entorno para preservar o foco', {
    body: 'Observe quais formas cercam o elemento principal. Agrupe as secundárias no entorno para deixar a composição mais fácil de percorrer.',
    alt: 'As seis formas menores passam de dispersas a dois grupos de três, mantendo a mesma distância até o centro.',
    diagram: { type: 'shape_grouping' },
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  t.after(() => page.close());

  for (const polarity of ['base', 'inverted']) {
    const slides = [cover, { ...scale, polarity }, { ...grouping, polarity }, closing];
    const result = await renderDeckInMemory({ mode: 'editorial_art', tokens, slides }, { browser, sharp, fonts, repair: false });
    assert.ok(result.slides.every(item => item.checks.every(check => check.status === 'pass')));
    assert.equal(result.checks.find(check => check.id === 'COLLECTION_CADENCE').observed.visualCoverage, 0.75);

    for (const [index, proof] of slides.slice(1, 3).entries()) {
      const item = result.slides[index + 1];
      assert.ok(item.firstChecks.every(check => check.status === 'pass'));
      assert.deepEqual(item.repairs, []);
      assert.equal(item.artAreaFraction, 904 * 360 / (1080 * 1350));
      assert.deepEqual(result.altTexts[index + 1], { index: index + 2, alt: proof.alt });

      await page.setContent(slideDocument(proof, { index: index + 2, fonts, palette: paletteFor(tokens) }));
      await page.evaluate(() => document.fonts.ready);
      const panel = page.getByRole('img', { name: proof.alt });
      assert.deepEqual(await panel.boundingBox(), { x: 88, y: 156, width: 904, height: 360 });
      const background = colorHex(await page.locator('main').evaluate(main => getComputedStyle(main).backgroundColor));
      const scenes = await panel.locator('figure').evaluateAll(figures => figures.map(figure => {
        const readShape = shape => {
          const { x, y, width, height } = shape.getBBox();
          return { x: x + width / 2, y: y + height / 2, width, height, fill: getComputedStyle(shape).fill };
        };
        const caption = figure.querySelector('figcaption');
        const captionStyle = getComputedStyle(caption);
        return {
          width: figure.querySelector('svg').getBoundingClientRect().width,
          focus: readShape(figure.querySelector('.scene-focus')),
          neighbors: [...figure.querySelectorAll('.scene-neighbor')].map(readShape),
          label: caption.textContent, region: caption.dataset.region,
          labelColor: captionStyle.color, fontSize: Number.parseFloat(captionStyle.fontSize),
        };
      }));
      const [before, after] = scenes;
      assert.equal(before.width, after.width);
      assert.equal(before.focus.fill, after.focus.fill);
      assert.ok(scenes.every(scene => scene.fontSize / 3 >= 12 && scene.region === 'diagram-label' &&
        contrast(colorHex(scene.labelColor), background) >= 4.5 && contrast(colorHex(scene.focus.fill), background) >= 3 &&
        scene.neighbors.every(neighbor => contrast(colorHex(neighbor.fill), background) >= 3)));

      if (proof.diagram.type === 'shape_scale') {
        assert.deepEqual(scenes.map(scene => scene.label), ['Escalas iguais', 'Foco ampliado']);
        assert.deepEqual(before.neighbors, after.neighbors);
        assert.deepEqual([before.focus.x, before.focus.y], [after.focus.x, after.focus.y]);
        assert.deepEqual([before.focus.width, after.focus.width], [38, 86]);
        assert.ok(before.neighbors.every(neighbor => neighbor.width === before.focus.width));
      } else {
        assert.deepEqual(scenes.map(scene => scene.label), ['Formas dispersas', 'Em dois grupos']);
        assert.deepEqual(before.focus, after.focus);
        for (const scene of scenes) {
          assert.equal(scene.neighbors.length, 6);
          assert.ok(scene.neighbors.every(({ x, y, width, height, fill }) =>
            width === 17 && height === 17 && fill === before.neighbors[0].fill &&
            Math.abs(Math.hypot(x - scene.focus.x, y - scene.focus.y) - 76) < 0.001));
        }
        const groups = [-1, 1].map(side => after.neighbors.filter(point => Math.sign(point.x - after.focus.x) === side));
        assert.deepEqual(groups.map(group => group.length), [3, 3]);
        const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(before.neighbors.every((point, index) =>
          before.neighbors.slice(index + 1).every(other => gap(point, other) >= 75.999)));
        assert.ok(groups.every(group => group.every(a => group.every(b => gap(a, b) < 45))));
        assert.ok(groups[0].every(a => groups[1].every(b => gap(a, b) > 140)));
      }
    }
  }
});

test('matriz de leitura mantém a série legível e distingue o espécime de baixo contraste', { skip, timeout: 60_000 }, async t => {
  const { chromium } = require('playwright-core');
  const sharp = require('sharp');
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const [regular, bold] = await Promise.all([
    readFile(new URL('public/studio/dm-sans-regular.ttf', web)),
    readFile(new URL('public/studio/dm-sans-bold.ttf', web)),
  ]);
  const fonts = {400: regular, 700: bold};
  const tokens = {light:'#F5F1E8', dark:'#24272B', accent:'#D65135'};
  const caption = 'Três notas para revisar um anúncio pequeno na tela do celular.';
  const alt = 'Três comparações da mesma oferta mostram texto maior, escurecimento das letras e um destaque em negrito para Oferta.';
  const proof = slide('native_serial', 'Veja a diferença entre título e descrição', {
    id: 'hierarquia', kicker: 'Nota 03', body: 'No celular, confira se a chamada se destaca e se o endereço, a condição e a ação aparecem sem esforço.',
    alt, diagram: {type:'readability_matrix'},
  });
  const intro = [
    slide('native_serial', 'Anúncio pequeno no celular', {id:'capa', body:'Notas para revisar o anúncio na tela.'}),
    slide('native_serial', 'Teste o tamanho antes de publicar', {id:'tamanho', kicker:'Nota 01', body:'Aumente a frase principal se ela pedir zoom.'}),
    slide('native_serial', 'Compare texto e fundo', {id:'contraste', kicker:'Nota 02', body:'Mude a cor das letras para separar texto e fundo.'}),
  ];
  const closing = slide('cta_closing', 'Revise antes de publicar', {body:'Salve estas notas para revisar seu próximo anúncio.'});
  const page = await browser.newPage({viewport:{width:1080,height:1350}});
  t.after(() => page.close());

  for (const polarity of ['base', 'inverted']) {
    const note = {...proof, polarity};
    const result = await renderDeckInMemory({mode:'native_serial',tokens,caption,slides:[...intro,note,closing]},
      {browser,sharp,fonts,repair:false});
    assert.equal(result.slides.length, 5, JSON.stringify(result.checks));
    assert.ok(result.slides.every(item => item.firstChecks.every(check => check.status === 'pass') && item.checks.every(check => check.status === 'pass')));
    const { headline, body } = result.slides[3].firstChecks.find(check => check.id === 'TYPOGRAPHY').observed;
    assert.deepEqual({ headline, body }, { headline: 74, body: 44 });
    const cadence = result.checks.find(check => check.id === 'COLLECTION_CADENCE');
    assert.equal(cadence?.status, 'pass');
    assert.equal(cadence.observed.visualCoverage, 0.2);
    assert.deepEqual(result.altTexts[3], {index:4,alt});
    await page.setContent(slideDocument(note,{index:4,palette:paletteFor(tokens),fonts}));
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole('img', {name:alt}).count(), 1);
    const details = await page.evaluate(() => {
      const box = element => element.getBoundingClientRect();
      const proof = document.querySelector('.readability-matrix');
      const text = document.createRange();
      const panels = Array.from(proof.querySelectorAll('.matrix-panel'), panel => {
        const style = getComputedStyle(panel);
        const bounds = box(panel);
        const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
        const fragments = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          text.selectNodeContents(node);
          const region = text.getBoundingClientRect();
          fragments.push({ inside:region.left >= bounds.left && region.right <= bounds.right && region.top >= bounds.top && region.bottom <= bounds.bottom,
            weight:Number(getComputedStyle(node.parentElement).fontWeight) });
        }
        return {text:panel.textContent, font:Number.parseFloat(style.fontSize), color:style.color, fragments,
          measured:panel.hasAttribute('data-region'), area:bounds.width * bounds.height};
      });
      const labels = Array.from(proof.querySelectorAll('.matrix-label'), label => ({text:label.textContent,
        font:Number.parseFloat(getComputedStyle(label).fontSize), color:getComputedStyle(label).color,
        measured:label.dataset.region === 'diagram-label'}));
      return {panels,labels,anchor:box(document.querySelector('.content>*')).top,
        bodyBottom:box(document.querySelector('.body')).bottom, top:box(proof).top, bottom:box(proof).bottom,
        background:getComputedStyle(document.querySelector('main')).backgroundColor};
    });
    assert.equal(details.anchor, 300);
    assert.ok(details.bodyBottom < details.top && details.bottom <= 1170);
    assert.ok(details.panels.reduce((area, panel) => area + panel.area, 0) / (1080 * 1350) >= 0.12);
    assert.ok(details.panels.every(panel => panel.fragments.every(fragment => fragment.inside)));
    assert.deepEqual(details.labels.map(label => label.text), ['Antes','Com ajuste','Tamanho','Contraste','Hierarquia']);
    assert.ok(details.labels.every(label => label.measured && label.font / 3 >= 12 && contrast(colorHex(label.color), colorHex(details.background)) >= 4.5));
    const [small, large, low, high, equal, weighted] = details.panels;
    assert.equal(small.text, large.text);
    assert.ok(small.font < large.font && small.color === large.color);
    assert.equal(low.text, high.text);
    assert.equal(low.font, high.font);
    assert.ok(!low.measured && high.measured);
    assert.ok(contrast(colorHex(low.color), colorHex(details.background)) < 4.5);
    assert.ok(contrast(colorHex(high.color), colorHex(details.background)) >= 4.5);
    assert.equal(equal.text, weighted.text);
    assert.deepEqual(equal.fragments.map(fragment => fragment.weight), [400, 400]);
    assert.deepEqual(weighted.fragments.map(fragment => fragment.weight), [700, 400]);
  }

  const dense = await renderDeckInMemory({ mode: 'native_serial', tokens, caption,
    slides: [...intro, { ...proof, body: denseCopy }, closing] }, { browser, sharp, fonts });
  assert.equal(dense.slides[3].checks.find(check => check.id === 'LAYOUT_OVERFLOW').status, 'fail');
  assert.equal(dense.slides[3].checks.find(check => check.id === 'SAFE_ZONE').status, 'fail');
});
