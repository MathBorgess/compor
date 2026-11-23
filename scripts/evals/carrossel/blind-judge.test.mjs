import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderJudgePanels } from './blind-judge.mjs';
import { sha256 } from './protocol.mjs';

const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const sharp = require('sharp');

test('a folha do juiz mantém resolução de leitura, sequência e hashes com segunda linha', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-blind-panels-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const colors = ['#d22130', '#23863d', '#095ec5', '#f5d349', '#126480', '#68228b'];
  const fixtures = await Promise.all(colors.map(async (background, index) => {
    const bytes = await sharp({ create: { width: 1080, height: 1350, channels: 3, background } }).jpeg().toBuffer();
    const path = join(directory, `${index + 1}.jpg`);
    await writeFile(path, bytes);
    return { path, sha256: sha256(bytes) };
  }));
  const panels = await renderJudgePanels(fixtures.map(({ path }) => path));
  const sizes = await Promise.all([panels.first, panels.second, panels.cover, panels.overview].map(panel => sharp(panel).metadata()));
  assert.deepEqual(sizes.map(({ width, height }) => [width, height]), [[540, 675], [540, 675], [270, 360], [1392, 688]]);
  assert.deepEqual(panels.hashes, fixtures.map(fixture => fixture.sha256));
  const last = await sharp(panels.overview).extract({ left: 120, top: 450, width: 1, height: 1 }).raw().toBuffer();
  const sixth = colors[5].slice(1).match(/../g).map(channel => parseInt(channel, 16));
  assert.ok(last.every((value, channel) => Math.abs(value - sixth[channel]) <= 4));
});
