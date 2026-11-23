import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cssRgbLuminance, luminance, paletteFor, ratio } from './color.mjs';
import { slideDocument } from './layouts.mjs';
import { cadence, validateDeck } from './plan.mjs';
import { compareArtwork } from './visuals.mjs';

export { diagrams, layouts, modes, validateDeck } from './plan.mjs';
export { accentAgainst, contrast, paletteFor } from './color.mjs';

const WIDTH = 1080;
const HEIGHT = 1350;
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
    const rect = (bounds) => ({ left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom });
    const regions = Array.from(document.querySelectorAll('[data-region]'), element => {
      const name = element.dataset.region;
      const style = getComputedStyle(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const snippets = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const parent = node.parentElement;
        const colors = getComputedStyle(parent);
        const prominence = Number.parseFloat(colors.fontSize) >= 64 && Number(colors.fontWeight) >= 700;
        for (const item of range.getClientRects()) {
          if (item.width && item.height) snippets.push({ ...rect(item), color: colors.color, minimum: prominence ? 3 : 4.5 });
        }
      }
      return {
        name, ...rect(element.getBoundingClientRect()), size: Number.parseFloat(style.fontSize), snippets,
        lineCount: new Set(snippets.map(box => Math.round(box.top))).size,
      };
    });
    const media = canvas.querySelector('.media');
    const mediaRect = media?.getBoundingClientRect();
    const mediaArea = mediaRect && getComputedStyle(media).display !== 'none' ? mediaRect.width * mediaRect.height : 0;
    return {
      regions, mediaArea,
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
  const { data, info } = await sharp(background).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const failures = [];
  for (const region of regions) {
    let minimum = Infinity;
    let passing = true;
    for (const box of region.snippets) {
      const textLuminance = cssRgbLuminance(box.color);
      if (!Number.isFinite(textLuminance)) {
        passing = false;
        continue;
      }
      for (let y = Math.max(0, Math.ceil(box.top)); y < Math.min(info.height, box.bottom); y += 4) {
        for (let x = Math.max(0, Math.ceil(box.left)); x < Math.min(info.width, box.right); x += 4) {
          const offset = (y * info.width + x) * info.channels;
          const backgroundLuminance = luminance([data[offset], data[offset + 1], data[offset + 2]]);
          const contrast = ratio(textLuminance, backgroundLuminance);
          minimum = Math.min(minimum, contrast);
          passing &&= contrast >= box.minimum;
        }
      }
    }
    if (!passing) failures.push({ region: region.name, minimum: Number.isFinite(minimum) ? minimum : null });
  }
  return check('TEXT_CONTRAST', failures.length === 0, { failures, samplingStep: 4, method: 'solid foreground against text-hidden line region' });
}

function fitFor(slide, index) {
  return { head: index === 1 ? (slide.art ? 88 : 100) : 64, body: 40, figure: 160 };
}

async function imageFor(sharp, art) {
  if (!art) return null;
  const bytes = Buffer.from(art.slice(art.indexOf(',') + 1), 'base64');
  const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' });
  const metadata = await image.metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw Error('unsupported_art');
  return image.autoOrient().resize({ width: WIDTH, height: HEIGHT, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

async function writeAsset(outputDir, file, bytes) {
  await writeFile(join(outputDir, file), bytes, { flag: 'wx', mode: 0o600 });
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

async function inspect(page, slide, options) {
  await page.setContent(slideDocument(slide, options), { waitUntil: 'load' });
  const geometry = await captureGeometry(page);
  const checks = gradeGeometry(geometry, { index: options.index, fontCount: Object.keys(options.fonts).length, hasArt: Boolean(slide.art) });
  return { geometry, checks };
}

async function renderSlide({ page, sharp, slide, index, fonts, palette, outputDir, incoming, repair }) {
  const sourceArt = await imageFor(sharp, slide.art).catch(() => false);
  if (sourceArt === false) {
    return { result: { id: slide.id, index, checks: [check('ASSET_DECODE', false, 'Imagem raster inválida.')] } };
  }
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
    meta.space === 'srgb' && meta.hasProfile && !meta.isProgressive && meta.chromaSubsampling === '4:4:4' && jpeg.length <= 8_000_000,
  { width: meta.width, height: meta.height, bytes: jpeg.length, chroma: meta.chromaSubsampling, smallFile: jpeg.length < 15_000 });
  checks.push(jpegCheck);
  const asset = await writeAsset(outputDir, 'slide-' + String(index).padStart(2, '0') + '.jpg', jpeg);
  return { result: { id: slide.id, index, ...asset, checks, firstChecks, repairs, artAreaFraction: geometry.mediaArea / (WIDTH * HEIGHT) }, jpeg, sourceArt };
}

async function sheet(sharp, images, { width = 216, height = 270, format = 'png' } = {}) {
  const columns = Math.min(images.length, 4);
  const rows = Math.ceil(images.length / columns);
  const tiles = await Promise.all(images.map(async (image, index) => ({
    input: await sharp(image).resize(width, height, { fit: 'cover' }).png().toBuffer(),
    left: (index % columns) * width, top: Math.floor(index / columns) * height,
  })));
  const canvas = sharp({ create: { width: width * columns, height: height * rows, channels: 3, background: '#e4e0da' } }).composite(tiles);
  return format === 'jpeg' ? canvas.withIccProfile('srgb').jpeg(JPEG).toBuffer() : canvas.png().toBuffer();
}

async function renderArtifacts(sharp, rendered, outputDir) {
  const artifacts = [];
  const slides = rendered.flatMap(slide => slide.jpeg ? [slide.jpeg] : []);
  const art = rendered.flatMap(slide => slide.sourceArt ? [slide.sourceArt] : []);
  if (slides.length) artifacts.push(await writeAsset(outputDir, 'contact-sheet.png', await sheet(sharp, slides)));
  if (rendered[0]?.jpeg) {
    const cover = await sharp(rendered[0].jpeg).extract({ left: 34, top: 0, width: 1012, height: HEIGHT }).resize(270, 360).png().toBuffer();
    artifacts.push(await writeAsset(outputDir, 'cover-grid.png', cover));
  }
  if (art.length) artifacts.push(await writeAsset(outputDir, 'art-sheet.jpg', await sheet(sharp, art, { format: 'jpeg' })));
  return artifacts;
}

export async function renderDeck(deck, { outputDir, browser, sharp, fonts, repair = true }) {
  const profile = 'compor-carousel-jpeg-4x5.v1';
  const planChecks = validateDeck(deck);
  if (planChecks.length) return { profile, slides: [], checks: planChecks, artifacts: [] };
  if (!fonts?.[400]?.length || !fonts?.[700]?.length) throw Error('carousel_fonts_required');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2,
    locale: 'pt-BR', serviceWorkers: 'block', reducedMotion: 'reduce',
  });
  try {
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const palette = paletteFor(deck.tokens);
    const rendered = [];
    for (const [offset, slide] of deck.slides.entries()) {
      rendered.push(await renderSlide({ page, sharp, slide, index: offset + 1, fonts, palette, outputDir, incoming: deck.slides[offset - 1]?.bridge, repair }));
    }
    const slides = rendered.map(({ result }) => result);
    const collection = cadence(deck);
    const visualCoverage = slides.filter(slide => slide.artAreaFraction >= 0.12).length / slides.length;
    const checks = [{ ...collection, status: deck.mode === 'editorial_art' && visualCoverage < 0.5 ? 'fail' : collection.status,
      observed: { ...collection.observed, declaredVisualCoverage: collection.observed.visualCoverage, visualCoverage } }];
    checks.push(await compareArtwork(sharp, rendered));
    const artifacts = await renderArtifacts(sharp, rendered, outputDir);
    return { profile, slides, checks, artifacts };
  } finally {
    await context.close();
  }
}
