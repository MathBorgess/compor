import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('pessoa edita peça e conflito preserva rascunho', { skip: !existsSync(browserPath) }, async t => {
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin } });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const deadline = Date.now() + 30000;
  while (true) { try { if ((await fetch(origin)).ok) break; } catch {} if (Date.now() > deadline) throw new Error('aplicação indisponível'); await new Promise(resolve => setTimeout(resolve, 200)); }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true }); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/auth/session', route => route.fulfill({ json: { state: 'connected', userId: 'alice' } }));
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: [{ id: '11111111-1111-4111-8111-111111111111', title: 'Oficina', created_at: '2026-11-03T00:00:00Z' }] } }));
  let attempts = 0;
  let pieceId;
  let savedVersion = null;
  await page.route('**/api/pieces*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { versions: attempts ? [{ project_id: '11111111-1111-4111-8111-111111111111', piece_id: pieceId, version: 1, content: { headline: 'Alteração externa', price: '', date: '', caption: 'Legenda externa', captionOrigin: 'user' }, created_at: '2026-11-03T00:00:00Z' }, ...(savedVersion ? [savedVersion] : [])] : [] } });
    attempts++;
    pieceId = route.request().postDataJSON().pieceId;
    if (attempts === 2) {
      const input = route.request().postDataJSON();
      savedVersion = { project_id: input.projectId, piece_id: pieceId, version: input.expectedVersion + 1, content: input.content, created_at: '2026-11-03T00:00:01Z' };
      return route.fulfill({ json: { status: 'saved', version: savedVersion } });
    }
    return route.fulfill({ status: 409, json: { status: 'conflict', currentVersion: 1 } });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Abrir Oficina' }).click();
  await page.getByRole('button', { name: 'Nova peça' }).click();
  await page.getByLabel('Título da peça').fill('Convite');
  await page.getByLabel('Legenda').fill('Uma legenda editável');
  await page.getByRole('button', { name: 'Salvar versão' }).click();
  await page.getByText(/outra versão/).waitFor();
  assert.equal(await page.getByLabel('Título da peça').inputValue(), 'Convite');
  assert.equal(await page.getByLabel('Legenda').inputValue(), 'Uma legenda editável');
  await page.getByRole('button', { name: 'Atualizar versões' }).click();
  await page.getByText(/Alteração externa/).waitFor();
  await page.getByRole('button', { name: 'Usar versão atual como base' }).click();
  assert.equal(await page.getByLabel('Legenda').inputValue(), 'Uma legenda editável');
  await page.getByRole('button', { name: 'Salvar versão' }).click();
  await page.getByText('Versão salva.').waitFor();
  await page.getByRole('button', { name: 'Abrir peça 1, versão 1' }).click();
  assert.equal(await page.getByLabel('Legenda').inputValue(), 'Legenda externa');
  await page.getByLabel('Legenda').fill('Uma legenda editável');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByLabel('Legenda').waitFor();
  assert.equal(await page.getByLabel('Legenda').inputValue(), 'Uma legenda editável');
  assert.equal(attempts, 2);
});
