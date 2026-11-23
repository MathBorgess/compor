import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paletteFor } from './color.mjs';
import { reviewTextContrast } from './contrast-coverage.mjs';
import { slideDocument } from './layouts.mjs';
import { cadence, validateDeck } from './plan.mjs';
import { compareArtwork } from './visuals.mjs';

export { diagrams, layouts, modes, validateDeck } from './plan.mjs';
export { accentAgainst, contrast, paletteFor } from './color.mjs';

const WIDTH = 1080;
const HEIGHT = 1350;
const SHEET_COLUMNS = 4;
const JPEG = { quality: 92, chromaSubsampling: '4:4:4', progressive: false };
const REPAIRABLE = new Set(['LAYOUT_OVERFLOW', 'TEXT_COLLISION', 'SAFE_ZONE', 'TYPOGRAPHY']);

function check(id, pass, observed) {
  return { id, status: pass ? 'pass' : 'fail', observed };
}

async function captureGeometry(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('400 46px "DM Sans"'), document.fonts.load('700 86px "DM Sans"')]);
    await document.fonts.ready;
    const canvas = document.querySelector('main');
    const media = canvas.querySelector('.media');
    const img = media?.querySelector('img');
    const rect = bounds => ({ left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom });
    const text = [];
    const regions = Array.from(document.querySelectorAll('[data-region]'), element => {
      const name = element.dataset.region;
      const style = getComputedStyle(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const snippets = [];
      const linesBySlot = new Map();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const parent = node.parentElement;
        const colors = getComputedStyle(parent);
        const prominence = Number.parseFloat(colors.fontSize) >= 64 && Number(colors.fontWeight) >= 700;
        const slot = parent.closest('li') ?? element;
        for (const item of range.getClientRects()) {
          if (!item.width || !item.height) continue;
          const box = rect(item);
          snippets.push({ ...box, color: colors.color, minimum: prominence ? 3 : 4.5 });
          if (!img) continue;
          const lines = linesBySlot.get(slot) ?? new Map();
          linesBySlot.set(slot, lines);
          const row = Math.round(box.top);
          const existing = lines.get(row);
          lines.set(row, existing ? {
            left: Math.min(box.left, existing.left), top: Math.min(box.top, existing.top),
            right: Math.max(box.right, existing.right), bottom: Math.max(box.bottom, existing.bottom),
          } : box);
        }
      }
      for (const lines of linesBySlot.values()) {
        for (const box of lines.values()) text.push({ region: name, ...box });
      }
      return {
        name, ...rect(element.getBoundingClientRect()), size: Number.parseFloat(style.fontSize), snippets,
        lineCount: new Set(snippets.map(box => Math.round(box.top))).size,
      };
    });

    function innerBox(element, includePadding) {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const inset = side => Number.parseFloat(style.getPropertyValue('border-' + side + '-width')) +
        (includePadding ? 0 : Number.parseFloat(style.getPropertyValue('padding-' + side)));
      return {
        left: bounds.left + inset('left'), top: bounds.top + inset('top'),
        right: bounds.right - inset('right'), bottom: bounds.bottom - inset('bottom'),
      };
    }

    function intersect(bounds, clip) {
      const left = Math.min(Math.max(bounds.left, clip.left), clip.right);
      const top = Math.min(Math.max(bounds.top, clip.top), clip.bottom);
      return {
        left, top, right: Math.max(left, Math.min(bounds.right, clip.right)),
        bottom: Math.max(top, Math.min(bounds.bottom, clip.bottom)),
      };
    }

    function rasterPlacement(img) {
      const content = innerBox(img, false);
      const availableWidth = content.right - content.left;
      const availableHeight = content.bottom - content.top;
      const fit = getComputedStyle(img).objectFit;
      if (availableWidth <= 0 || availableHeight <= 0 || !['cover', 'contain'].includes(fit)) return;
      const position = img.computedStyleMap?.().get('object-position');
      if (!position?.x?.toSum || !position?.y?.toSum) return;
      const scale = (fit === 'contain' ? Math.min : Math.max)(
        availableWidth / img.naturalWidth, availableHeight / img.naturalHeight);
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      // Chromium resolves keywords and edge offsets into percentages and px.
      // Cover can give negative free space, which reverses percentage offsets.
      const offset = (axis, free) => Array.from(axis.toSum('percent', 'px').values)
        .reduce((value, term) => value + (term.unit === 'percent' ? term.value * free / 100 : term.value), 0);
      const left = content.left + offset(position.x, availableWidth - width);
      const top = content.top + offset(position.y, availableHeight - height);
      const image = { left, top, right: left + width, bottom: top + height };
      const panel = intersect(innerBox(media, true), rect(canvas.getBoundingClientRect()));
      return { image, clip: intersect(image, intersect(content, panel)), text };
    }

    const mediaRect = media?.getBoundingClientRect();
    const mediaArea = mediaRect && getComputedStyle(media).display !== 'none' ? mediaRect.width * mediaRect.height : 0;
    const artPlacement = img?.naturalWidth > 0 && img.naturalHeight > 0 ? rasterPlacement(img) : undefined;
    return {
      regions, mediaArea, artPlacement,
      fonts: Array.from(document.fonts, font => font.status),
      decoded: Array.from(document.images).every(image => image.complete && image.naturalWidth > 0),
      scrollWidth: canvas.scrollWidth, scrollHeight: canvas.scrollHeight,
    };
  });
}

function overlaps(a, b) {
  const allowance = 0.25;
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > allowance &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > allowance;
}

function gradeGeometry(geometry, { index, fontCount, hasArt }) {
  const collisions = geometry.regions.flatMap((a, position) =>
    geometry.regions.slice(position + 1).filter(b => overlaps(a, b)).map(b => [a.name, b.name]));
  const brokenRegions = geometry.regions.filter(region =>
    region.snippets.some(box =>
      box.left < 87.75 || box.right > 992.25 || box.top < 111.75 ||
      box.bottom > (region.name === 'source' ? 1230.25 : 1170.25) ||
      (box.top < 147.75 && box.right > 860.25)));
  const headline = geometry.regions.find(region => region.name === 'headline');
  const body = geometry.regions.find(region => region.name === 'body');
  const figure = geometry.regions.find(region => region.name === 'figure');
  const typePass = Boolean(headline && headline.size >= (index === 1 ? hasArt ? 88 : 100 : 64) &&
    (index === 1 || headline.lineCount <= 3) &&
    (!body || (body.size >= 40 && headline.size / body.size >= 1.35)) &&
    (!figure || figure.size >= 160));
  return [
    check('LAYOUT_OVERFLOW', geometry.scrollWidth <= WIDTH && geometry.scrollHeight <= HEIGHT, [geometry.scrollWidth, geometry.scrollHeight]),
    check('TEXT_COLLISION', collisions.length === 0, collisions),
    check('SAFE_ZONE', brokenRegions.length === 0, brokenRegions.map(region => region.name)),
    check('TYPOGRAPHY', typePass, { headline: headline?.size, lines: headline?.lineCount, body: body?.size, figure: figure?.size }),
    check('ASSET_DECODE', geometry.decoded && geometry.fonts.length === fontCount && geometry.fonts.every(status => status === 'loaded'), geometry.fonts),
  ];
}

async function gradeContrast(page, sharp, regions) {
  await page.evaluate(() => document.documentElement.classList.add('measure'));
  const background = await page.screenshot({ type: 'png', scale: 'css', animations: 'disabled' });
  await page.evaluate(() => document.documentElement.classList.remove('measure'));
  const pixels = await sharp(background).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const observed = reviewTextContrast(pixels, regions);
  return check('TEXT_CONTRAST', observed.failures.length === 0, observed);
}

function fitFor(slide, index) {
  return { head: index === 1 ? (slide.art ? 88 : 100) : 64, body: 40, figure: 160 };
}

async function imageFor(sharp, art) {
  if (!art) return null;
  const [declared, payload] = art.split(',');
  const bytes = Buffer.from(payload, 'base64');
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' });
  const { format, width, height, pages } = await image.metadata();
  if (declared !== `data:image/${format};base64` || (pages ?? 1) !== 1) throw Error('unsupported_art');
  const embedded = await image.autoOrient().resize({ width: WIDTH, height: HEIGHT, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { embedded, source: { sha256: digest(bytes), bytes: bytes.length, format, width, height, embeddedSha256: digest(embedded) } };
}

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}

function describeAsset(file, data) {
  return { file, sha256: digest(data), bytes: data.length };
}

async function inspect(page, slide, options) {
  await page.setContent(slideDocument(slide, options), { waitUntil: 'load' });
  const geometry = await captureGeometry(page);
  const checks = gradeGeometry(geometry, { index: options.index, fontCount: Object.keys(options.fonts).length, hasArt: Boolean(slide.art) });
  return { geometry, checks };
}

async function renderSlide({ page, sharp, slide, index, fonts, palette, incoming, repair }) {
  const raster = await imageFor(sharp, slide.art).catch(() => false);
  if (raster === false) {
    return { result: { id: slide.id, index, checks: [check('ASSET_DECODE', false, 'Imagem raster inválida.')] } };
  }
  const sourceArt = raster?.embedded;
  const input = sourceArt ? { ...slide, art: 'data:image/png;base64,' + sourceArt.toString('base64') } : slide;
  const options = { index, palette, fonts, incoming };
  let { geometry, checks } = await inspect(page, input, options);
  const firstContrast = await gradeContrast(page, sharp, geometry.regions);
  const firstChecks = [...checks, firstContrast];
  const repairs = [];
  if (repair && checks.some(result => result.status === 'fail' && REPAIRABLE.has(result.id))) {
    options.fit = fitFor(input, index);
    ({ geometry, checks } = await inspect(page, input, options));
    repairs.push('fit_to_floor');
  }
  let contrast = repairs.length ? await gradeContrast(page, sharp, geometry.regions) : firstContrast;
  if (repair && contrast.status === 'fail' && input.layout === 'hero_bleed' && sourceArt) {
    for (const scrim of [0.88, 0.94]) {
      options.scrim = scrim;
      ({ geometry, checks } = await inspect(page, input, options));
      contrast = await gradeContrast(page, sharp, geometry.regions);
      repairs.push('scrim_' + scrim);
      if (contrast.status === 'pass') break;
    }
  }
  checks.push(contrast);
  const capture = await page.screenshot({ type: 'png', scale: 'device', animations: 'disabled' });
  const jpeg = await sharp(capture).resize(WIDTH, HEIGHT).withIccProfile('srgb').jpeg(JPEG).toBuffer();
  const meta = await sharp(jpeg).metadata();
  const jpegCheck = check('JPEG_PROFILE', meta.width === WIDTH && meta.height === HEIGHT && meta.format === 'jpeg' &&
    meta.space === 'srgb' && meta.hasProfile && !meta.isProgressive && meta.chromaSubsampling === '4:4:4' &&
    jpeg.length >= 15_000 && jpeg.length <= 8_000_000,
  { width: meta.width, height: meta.height, bytes: jpeg.length, chroma: meta.chromaSubsampling, smallFile: jpeg.length < 15_000 });
  checks.push(jpegCheck);
  const asset = describeAsset('slide-' + String(index).padStart(2, '0') + '.jpg', jpeg);
  const result = { id: slide.id, index, ...asset, checks, firstChecks, repairs, artAreaFraction: geometry.mediaArea / (WIDTH * HEIGHT) };
  if (raster) {
    result.artSource = raster.source;
    if (geometry.artPlacement) result.artPlacement = geometry.artPlacement;
  }
  return { result, jpeg, sourceArt };
}

async function sheet(sharp, images, { width = 216, height = 270, format = 'png', fit = 'cover' } = {}) {
  const columns = Math.min(images.length, SHEET_COLUMNS);
  const rows = Math.ceil(images.length / columns);
  const background = '#e4e0da';
  const tiles = await Promise.all(images.map(async (image, index) => ({
    input: await sharp(image).resize(width, height, { fit, background }).png().toBuffer(),
    left: (index % columns) * width, top: Math.floor(index / columns) * height,
  })));
  const canvas = sharp({ create: { width: width * columns, height: height * rows, channels: 3, background } }).composite(tiles);
  return format === 'jpeg' ? canvas.withIccProfile('srgb').jpeg(JPEG).toBuffer() : canvas.png().toBuffer();
}

async function renderArtifacts(sharp, rendered) {
  const artifacts = [];
  const add = (file, data, details) => artifacts.push({ ...describeAsset(file, data), data, ...details });
  const slides = rendered.flatMap(slide => slide.jpeg ? [slide.jpeg] : []);
  const art = rendered.filter(slide => slide.sourceArt);
  if (slides.length) add('contact-sheet.png', await sheet(sharp, slides));
  if (rendered[0]?.jpeg) {
    const cover = await sharp(rendered[0].jpeg).extract({ left: 34, top: 0, width: 1012, height: HEIGHT }).resize(270, 360).png().toBuffer();
    add('cover-grid.png', cover);
  }
  if (art.length) {
    const columns = Math.min(art.length, SHEET_COLUMNS);
    const tiles = art.map(({ result }, index) => ({
      slideIndex: result.index, slideId: result.id, column: index % columns, row: Math.floor(index / columns),
    }));
    const data = await sheet(sharp, art.map(slide => slide.sourceArt), { width: 360, height: 450, format: 'jpeg', fit: 'contain' });
    add('art-sheet.jpg', data, { tiles });
  }
  return artifacts;
}

export async function renderDeckInMemory(deck, { browser, sharp, fonts, repair = true, signal }) {
  const profile = 'compor-carousel-jpeg-4x5.v1';
  const planChecks = validateDeck(deck);
  if (planChecks.length) return { profile, slides: [], checks: planChecks, artifacts: [] };
  if (!fonts?.[400]?.length || !fonts?.[700]?.length) throw Error('carousel_fonts_required');
  signal?.throwIfAborted();
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2,
    locale: 'pt-BR', serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  const cancel = () => { void context.close().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const palette = paletteFor(deck.tokens);
    const rendered = [];
    for (const [offset, slide] of deck.slides.entries()) {
      signal?.throwIfAborted();
      rendered.push(await renderSlide({ page, sharp, slide, index: offset + 1, fonts, palette, incoming: deck.slides[offset - 1]?.bridge, repair }));
    }
    const slides = rendered.map(({ result }) => result);
    const collection = cadence(deck);
    const visualCoverage = slides.filter(slide => slide.artAreaFraction >= 0.12).length / slides.length;
    const checks = [{ ...collection, status: deck.mode === 'editorial_art' && visualCoverage < 0.5 ? 'fail' : collection.status,
      observed: { ...collection.observed, declaredVisualCoverage: collection.observed.visualCoverage, visualCoverage } }];
    checks.push(await compareArtwork(sharp, rendered));
    const artifacts = await renderArtifacts(sharp, rendered);
    return {
      profile,
      slides: rendered.map(({ result, jpeg }) => ({ ...result, data: jpeg })),
      altTexts: deck.slides.map(({ alt }, offset) => ({ index: offset + 1, alt })),
      checks, artifacts, caption: deck.caption ?? '',
    };
  } finally {
    signal?.removeEventListener('abort', cancel);
    await context.close().catch(error => { if (!signal?.aborted) throw error; });
  }
}

export async function renderDeck(deck, { outputDir, ...options }) {
  const rendered = await renderDeckInMemory(deck, options);
  if (rendered.slides.length) await mkdir(outputDir, { recursive: true, mode: 0o700 });
  async function save({ data, ...asset }) {
    if (data) await writeFile(join(outputDir, asset.file), data, { flag: 'wx', mode: 0o600 });
    return asset;
  }
  const slides = [];
  for (const slide of rendered.slides) slides.push(await save(slide));
  const artifacts = [];
  for (const artifact of rendered.artifacts) artifacts.push(await save(artifact));
  return { profile: rendered.profile, slides, checks: rendered.checks, artifacts };
}
