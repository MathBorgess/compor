// Execute com NODE_PATH apontando para o runtime que fornece sharp: node --test scripts/evals/compose-botanica.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'compose-botanica.mjs');
const sharp = createRequire(import.meta.url)('sharp');

test('preserva a base e a versão anterior, escapa texto e recusa sobrescrita', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'compor-botanica-test-'));
  try {
    const base = join(temp, 'base.png');
    const image = await sharp({create:{width:1122,height:1402,channels:3,background:'#eeeeee'}}).png().toBuffer();
    await writeFile(base,image);
    const svg = join(temp, 'out.svg');
    const png = join(temp, 'out.png');
    const data = {titulo_linhas:['Botânica em','aquarela'],subtitulo:'Curso para iniciantes',inicio:'Início previsto',duracao:'6 semanas',exercicios:'Exercícios práticos',cta:'Conheça o curso',apoio:'Mais informações'};
    const manifest = join(temp, 'original.json');
    await writeFile(manifest,JSON.stringify(data));
    await run(process.execPath, [script, base, manifest, svg, png]);
    const beforeSvg = await readFile(svg);
    const beforePng = await readFile(png);
    await assert.rejects(run(process.execPath, [script, base, manifest, svg, png]));
    assert.deepEqual(await readFile(svg), beforeSvg);
    assert.deepEqual(await readFile(png), beforePng);

    const revised = {...data, marca:'Ateliê fictício', cta:'Pintar & <criar>'};
    const nextManifest = join(temp, 'alterado.json');
    const svg3 = join(temp, 'v3.svg');
    await writeFile(nextManifest, JSON.stringify(revised));
    await run(process.execPath, [script, base, nextManifest, svg3, join(temp, 'v3.png')]);
    const content = await readFile(svg3, 'utf8');
    assert.match(content, /Pintar &amp; &lt;criar&gt;/);
    assert.match(content, /Ateliê fictício/);
    const encoded = content.match(/data:image\/png;base64,([^"']+)/)?.[1];
    assert.ok(encoded);
    assert.deepEqual(Buffer.from(encoded, 'base64'), image);
  } finally {
    await rm(temp, { recursive: true, force: true }); // Apenas o diretório temporário criado neste teste.
  }
});
