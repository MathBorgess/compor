import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { artPlatePrompt } from './art-direction.mjs';
import { sha256 } from './protocol.mjs';

const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const referenceByteLimit = 2 * 1024 * 1024;
const waveSize = 2;

async function styleReference(bytes, light) {
  let transport = bytes;
  let mime = 'image/png';
  if (transport.length > referenceByteLimit) {
    const sharp = require('sharp');
    transport = await sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error' })
      .resize({ width: 768, height: 960, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: light }).jpeg({ quality: 84 }).toBuffer();
    mime = 'image/jpeg';
  }
  if (transport.length > referenceByteLimit) throw Error('style_reference_too_large');
  return {
    image: { data: transport.toString('base64'), mime },
    trace: { role: 'style_only', sourceSha256: sha256(bytes), transportSha256: sha256(transport), bytes: transport.length, mime },
  };
}

export async function runRasterBatch({ direction, receipt, directory, record, requestImage }) {
  await mkdir(directory, { mode: 0o700 });
  const attempts = direction.plates.map(plate => {
    const prompt = artPlatePrompt(direction, plate);
    return {
      plate, prompt,
      evidence: { slideId: plate.slideId, slideIndex: plate.slideIndex, state: 'not_run', promptSha256: sha256(prompt) },
    };
  });
  Object.assign(receipt, {
    state: 'prepared', outputDirectory: basename(directory), directionSha256: sha256(JSON.stringify(direction)),
    masterSha256: sha256(JSON.stringify(direction.master)), plates: attempts.map(item => item.evidence),
  });
  const assets = new Map();

  async function dispatch(wave, reference) {
    for (const { evidence } of wave) {
      evidence.state = 'submitted';
      evidence.operation = reference ? 'edits' : 'generations';
      if (reference) evidence.styleReference = reference.trace;
    }
    await record();
    await Promise.all(wave.map(async ({ plate, prompt, evidence }) => {
      try {
        const { art, ...verdict } = await requestImage(prompt, evidence, reference?.image);
        Object.assign(evidence, verdict);
        if (verdict.state !== 'completed') return;
        if (typeof art !== 'string' || !art.startsWith('data:image/png;base64,')) throw Error('plate_output_unusable');
        const bytes = Buffer.from(art.slice(art.indexOf(',') + 1), 'base64');
        const file = 'plate-' + String(plate.slideIndex).padStart(2, '0') + '.png';
        Object.assign(evidence, { sha256: sha256(bytes), bytes: bytes.length });
        await writeFile(join(directory, file), bytes, { flag: 'wx', mode: 0o600 });
        evidence.file = file;
        assets.set(plate.slideId, { art, bytes });
      } catch {
        Object.assign(evidence, { state: 'unknown', reason: 'plate_result_unconfirmed' });
      }
    }));
    await record();
    const failure = wave.find(({ evidence }) => evidence.state === 'unknown')
      ?? wave.find(({ evidence }) => evidence.state !== 'completed');
    return failure?.evidence;
  }

  const finish = async (state, reason) => {
    Object.assign(receipt, { state, ...(reason && { reason }) });
    await record();
    return { state, reason, assets };
  };
  const anchor = attempts[0];
  let failure = await dispatch([anchor]);
  if (failure) return finish(failure.state, failure.reason);
  let reference;
  try {
    reference = await styleReference(assets.get(anchor.plate.slideId).bytes, direction.master.paletteBinding.light);
  } catch {
    return finish('failed_execution', 'style_reference_unavailable');
  }
  for (let offset = 1; offset < attempts.length; offset += waveSize) {
    failure = await dispatch(attempts.slice(offset, offset + waveSize), reference);
    if (failure) return finish(failure.state, failure.reason);
  }
  return finish('completed');
}
