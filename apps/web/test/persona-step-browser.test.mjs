import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp } from './wait-for-app.mjs';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('etapa da pessoa compradora permite lacunas e preserva informações com fontes, sem chamadas externas', { skip: !existsSync(browserPath) }, async t => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'compor-persona-ui-'));
  // One ordered cleanup: the dev server writes into the fixture, so it must stop
  // before removal, and a failed step must not leave the server or browser alive.
  let child, browser;
  t.after(async () => { try { await browser?.close(); } finally { try { await stopApp(child); } finally { await rm(fixture, { recursive: true, force: true }); } } });
  await mkdir(resolve(fixture, 'app'));
  await mkdir(resolve(fixture, 'lib'));
  await mkdir(resolve(fixture, 'lib/phoenix'));
  await symlink(resolve('node_modules'), resolve(fixture, 'node_modules'), 'dir');
  await writeFile(resolve(fixture, 'package.json'), JSON.stringify({ name: 'compor-persona-test', private: true, type: 'module' }));
  await writeFile(resolve(fixture, 'next.config.mjs'), 'export default { turbopack: { root: import.meta.dirname } };');
  await writeFile(resolve(fixture, 'app/layout.jsx'), 'export default function Layout({children}) { return <html lang="pt-BR"><body>{children}</body></html>; }');
  await writeFile(resolve(fixture, 'app/persona-step.tsx'), await readFile(new URL('../app/persona-step.tsx', import.meta.url)));
  await writeFile(resolve(fixture, 'lib/studio-domain.ts'), await readFile(new URL('../lib/studio-domain.ts', import.meta.url)));
  await writeFile(resolve(fixture, 'lib/schema.ts'), await readFile(new URL('../lib/schema.ts', import.meta.url)));
  await writeFile(resolve(fixture, 'lib/post-catalog.ts'), await readFile(new URL('../lib/post-catalog.ts', import.meta.url)));
  await writeFile(resolve(fixture, 'lib/reference-exploration-contract.ts'), await readFile(new URL('../lib/reference-exploration-contract.ts', import.meta.url)));
  await writeFile(resolve(fixture, 'lib/phoenix/catalog.ts'), await readFile(new URL('../lib/phoenix/catalog.ts', import.meta.url)));
  await writeFile(resolve(fixture, 'app/page.jsx'), `"use client";
import {useState} from 'react';
import PersonaStep from './persona-step';
export default function TestPage() {
  const [value,setValue]=useState({audience:'',situation:'',need:'',culturalReferences:'',claims:[]});
  const [continued,setContinued]=useState(null),[back,setBack]=useState(false),[disabled,setDisabled]=useState(false);
  return <><button onClick={()=>setDisabled(!disabled)}>Alternar bloqueio</button><PersonaStep value={value} onChange={setValue} onContinue={setContinued} onBack={()=>setBack(true)} disabled={disabled}/><output aria-label="Valor local">{JSON.stringify(value)}</output><output aria-label="Continuação">{continued ? JSON.stringify(continued) : ''}</output>{back&&<p>Retornou ao briefing</p>}</>;
}`);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let startup = '';
  child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', fixture, '--webpack', '-p', String(port), '-H', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, NEXT_TELEMETRY_DISABLED: '1' } });
  const recordStartup = chunk => { const output = startup + chunk; startup = output.length > 5000 ? output.slice(0, 4000) + output.slice(-1000) : output; };
  child.stdout.on('data', recordStartup);
  child.stderr.on('data', recordStartup);
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw Error(`fixture indisponível: ${startup}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const page = await browser.newPage();
  let externalCalls = 0;
  await page.route('**/api/**', route => { externalCalls++; return route.abort(); });
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Conhecendo quem vai comprar' }).waitFor();
  await page.getByRole('button', { name: 'Continuar com o que sei' }).click();
  assert.deepEqual(JSON.parse(await page.getByLabel('Continuação').innerText()), { audience: '', situation: '', need: '', culturalReferences: '', claims: [] });
  await page.getByLabel('Quem você quer alcançar?').fill('Pessoas que estão começando a aprender música');
  await page.getByLabel('Em que situação essa pessoa está?').fill('Pratica em casa depois do trabalho');
  await page.getByLabel('O que ela quer conseguir?').fill('Tocar uma primeira canção');
  await page.getByText('Adicionar referências e evidências (opcional)', { exact: true }).click();
  await page.getByLabel('Referências culturais e linguagem').fill('Uma compradora citou um programa de rádio. Não generalizar.');
  await page.getByRole('button', { name: 'Adicionar informação ou hipótese' }).click();
  await page.getByLabel('Informação 1', { exact: true }).fill('Uma pessoa entrevistada prefere exemplos curtos');
  await page.getByLabel('Origem da informação 1').selectOption('public_source');
  await page.getByText('Identifique a fonte pública dessa informação para poder revisá-la depois.').waitFor();
  await page.getByLabel('Fonte ou referência 1').fill('https://example.org/relato-sintetico');
  assert.equal(await page.getByText('Identifique a fonte pública dessa informação para poder revisá-la depois.').count(), 0);
  const state = JSON.parse(await page.getByLabel('Valor local').innerText());
  assert.match(state.claims[0].id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(state.claims[0], { id: state.claims[0].id, text: 'Uma pessoa entrevistada prefere exemplos curtos', provenance: 'public_source', source: 'https://example.org/relato-sintetico' });
  await page.getByRole('button', { name: 'Continuar com o que sei' }).click();
  assert.deepEqual(JSON.parse(await page.getByLabel('Continuação').innerText()), state);
  await page.getByRole('button', { name: 'Alternar bloqueio' }).click();
  assert.equal(await page.getByLabel('Quem você quer alcançar?').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Continuar com o que sei' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Adicionar informação ou hipótese' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Alternar bloqueio' }).click();
  await page.getByRole('button', { name: 'Remover informação 1' }).click();
  const withoutClaim = JSON.parse(await page.getByLabel('Valor local').innerText());
  assert.equal(withoutClaim.claims.length, 0);
  assert.equal(withoutClaim.culturalReferences, state.culturalReferences);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.getByText('Retornou ao briefing').waitFor();
  assert.equal(externalCalls, 0);
  assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
});
