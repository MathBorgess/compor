import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compose } from './compose-phoenix-creative.mjs';

const script = fileURLToPath(new URL('./compose-phoenix-creative.mjs', import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');
const imageHash = svg => sha(Buffer.from(svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/)[1], 'base64'));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function syntheticFixture(dir) {
  const manifest={versao:'teste',base:'base-alternativa-grafica.png',base_sha256:sha(image),titulo_linhas:['O dinheiro do','seu trabalho','no dia a dia'],subtitulo:'Uma ideia de curso para pessoas autônomas',rotulo_trabalho:'Contas do trabalho',rotulo_pessoal:'Contas pessoais'};
  const path=join(dir,'manifesto.json');
  await writeFile(join(dir,manifest.base),image);
  await writeFile(path,JSON.stringify(manifest));
  return {manifest,path};
}

test('editing JSON changes text while image bytes and unchanged text remain exact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-editable-test-'));
  try {
    const {manifest:original,path:fixture}=await syntheticFixture(dir);
    const a = await compose(fixture);
    const edited = {...original, versao: 'teste-pessoa', subtitulo: 'Finanças do seu jeito', rotulo_trabalho: 'Meu trabalho'};
    const path = join(dir, 'editado.json'); await writeFile(path, JSON.stringify(edited));
    const b = await compose(path);
    assert.equal(a.base_sha256, original.base_sha256);
    assert.equal(b.base_sha256, original.base_sha256);
    assert.equal(imageHash(a.svg), imageHash(b.svg));
    assert.equal(imageHash(a.svg), original.base_sha256);
    const title = svg => svg.match(/<text id="titulo"[^>]*>(.*?)<\/text>/)[1];
    assert.equal(title(a.svg), title(b.svg));
    assert.match(b.svg, /Finanças do seu jeito/);
    assert.match(b.svg, /Meu trabalho/);
    assert.match(b.svg, /Contas pessoais/);
    assert.doesNotMatch(b.svg, /Uma ideia de curso para pessoas autônomas/);
    const suspicious = {...edited, rotulo_trabalho:'<a>&'};
    await writeFile(path, JSON.stringify(suspicious));
    assert.match((await compose(path)).svg, /&lt;a&gt;&amp;/);
    await writeFile(path, JSON.stringify({...edited,base_sha256:'0'.repeat(64)}));
    await assert.rejects(compose(path), /hash da base mudou/);
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('CLI creates a new SVG without overwriting an existing result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'compor-editable-cli-'));
  try {
    const {manifest,path:fixture}=await syntheticFixture(dir);
    const output = join(dir, 'resultado.svg');
    const first = spawnSync(process.execPath,[script,fixture,output],{encoding:'utf8'});
    assert.equal(first.status,0,first.stderr);
    const before = await readFile(output);
    assert.equal(imageHash(before.toString('utf8')),manifest.base_sha256);
    const second = spawnSync(process.execPath,[script,fixture,output],{encoding:'utf8'});
    assert.notEqual(second.status,0);
    assert.deepEqual(await readFile(output),before);
  } finally { await rm(dir, {recursive:true,force:true}); }
});
