import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { sha256 } from './protocol.mjs';

const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const sharp = require('sharp');

export async function writeRenderFixture(directory, { mode, caption = '', salt }) {
  const firstPass = join(directory, 'first-pass');
  await mkdir(firstPass, { recursive: true });
  const plan = { mode, caption, claims: [], slides: [
    { id: 'capa', layout: 'framed_plate', headline: 'Entenda o exemplo', alt: 'Um convite para ler o exemplo.', diagram: 'focus' },
    { id: 'prova', layout: 'svg_diagram', headline: 'Compare os passos', alt: 'Uma sequência de passos.', diagram: 'steps' },
    { id: 'fecho', layout: 'cta_closing', headline: 'Salve para revisar', alt: 'Um convite para salvar.' },
  ] };
  const artifact = async (file, bytes) => {
    await writeFile(join(firstPass, file), bytes);
    return { file, sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) };
  };
  const planFile = await artifact('plan.json', JSON.stringify(plan, null, 2) + '\n');
  const lines = Array.from({ length: 38 }, (_, index) => `M0 ${index * 45 - 300}l1080 540`).join(' ');
  const stripes = Buffer.from(`<svg width="1080" height="1350"><path d="${lines}" stroke="white" stroke-opacity=".35" stroke-width="3"/></svg>`);
  const jpegs = await Promise.all(plan.slides.map(slide => sharp({ create: { width: 1080, height: 1350,
    channels: 3, background: '#' + sha256(salt + slide.id).slice(0, 6) } }).composite([{ input: stripes }])
    .withIccProfile('srgb').jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer()));
  const slides = await Promise.all(jpegs.map(async (bytes, offset) => {
    const index = offset + 1;
    const metadata = await sharp(bytes).metadata();
    assert.deepEqual([metadata.width, metadata.height, metadata.format, metadata.space, metadata.chromaSubsampling,
      metadata.isProgressive, metadata.hasProfile], [1080, 1350, 'jpeg', 'srgb', '4:4:4', false, true]);
    assert.ok(bytes.length >= 15_000 && bytes.length <= 8_000_000);
    return { id: plan.slides[offset].id, index, ...await artifact(`slide-0${index}.jpg`, bytes),
      checks: [{ id: 'JPEG_PROFILE', status: 'pass', observed: {
        width: metadata.width, height: metadata.height, bytes: bytes.length, chroma: metadata.chromaSubsampling, smallFile: false,
      } }], firstChecks: [], repairs: [] };
  }));
  const tiles = await Promise.all(jpegs.map(async (bytes, index) => ({
    input: await sharp(bytes).resize(216, 270).png().toBuffer(), left: index * 216, top: 0,
  })));
  const sheets = await Promise.all([
    artifact('contact-sheet.png', await sharp({ create: { width: 648, height: 270, channels: 3, background: 'white' } })
      .composite(tiles).png().toBuffer()),
    artifact('cover-grid.png', await sharp(jpegs[0]).extract({ left: 34, top: 0, width: 1012, height: 1350 }).resize(270, 360).png().toBuffer()),
  ]);
  const receipt = await artifact('render-checks.json', JSON.stringify({ profile: 'compor-carousel-jpeg-4x5.v1',
    slides, checks: [], artifacts: sheets }, null, 2) + '\n');
  const snapshot = { outcome: 'delivered', inputSha256: planFile.sha256, slideCount: slides.length, artSheetApplicable: false,
    artifacts: [...slides, ...sheets, planFile, receipt].map(({ file, sha256: digest }) => ({ file: `first-pass/${file}`, sha256: digest })),
    checks: { JPEG_PROFILE: { status: 'pass', evidence: 'Perfil e dimensões dos JPEGs sintéticos verificados.' },
      ART_PURITY: { status: 'not_applicable', evidence: 'A fixture não inclui arte raster no plano.' } },
  };
  return { snapshot, jpgHashes: slides.map(slide => slide.sha256) };
}
