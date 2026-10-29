// Execute com NODE_PATH apontando para o runtime que fornece sharp: node --test scripts/evals/compose-botanica.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const artifacts = join(root, 'docs/evals/2026-10-29-phoenix-e2e/artifacts');
const script = join(here, 'compose-botanica.mjs');
const base = join(artifacts, 'botanica-base-v2.png');

test('preserva a base e a versão anterior, escapa texto e recusa sobrescrita', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'compor-botanica-test-'));
  try {
    const svg = join(temp, 'out.svg');
    const png = join(temp, 'out.png');
    const v2 = join(artifacts, 'botanica-texto-v2.json');
    await run(process.execPath, [script, base, v2, svg, png]);
    assert.deepEqual(await readFile(svg), await readFile(join(artifacts, 'botanica-v2-editavel.svg')));
    const beforeSvg = await readFile(svg);
    const beforePng = await readFile(png);
    await assert.rejects(run(process.execPath, [script, base, v2, svg, png]));
    assert.deepEqual(await readFile(svg), beforeSvg);
    assert.deepEqual(await readFile(png), beforePng);

    const data = JSON.parse(await readFile(join(artifacts, 'botanica-texto-v3.json'), 'utf8'));
    data.cta = 'Pintar & <criar>';
    const manifest = join(temp, 'alterado.json');
    const svg3 = join(temp, 'v3.svg');
    await writeFile(manifest, JSON.stringify(data));
    await run(process.execPath, [script, base, manifest, svg3, join(temp, 'v3.png')]);
    const content = await readFile(svg3, 'utf8');
    assert.match(content, /Pintar &amp; &lt;criar&gt;/);
    assert.match(content, /Ateliê Clara Flores/);
    const encoded = content.match(/data:image\/png;base64,([^"']+)/)?.[1];
    assert.ok(encoded);
    assert.deepEqual(Buffer.from(encoded, 'base64'), await readFile(base));
  } finally {
    await rm(temp, { recursive: true, force: true }); // Apenas o diretório temporário criado neste teste.
  }
});
