import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('interface lista e cria projetos e explicita resultado incerto', { skip: !existsSync(browserPath) }, async t => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, COMPOR_STUDIO_WEB_ENABLED:'false', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin } });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const deadline = Date.now() + 30000;
  while (true) { try { if ((await fetch(origin)).ok) break; } catch {} if (Date.now() > deadline) throw new Error('aplicação indisponível'); await new Promise(resolve => setTimeout(resolve, 200)); }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/auth/session', route => route.fulfill({ json: { state: 'connected', userId: 'alice' } }));
  let writes = 0;
  await page.route('**/api/projects', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { projects: [{ id: 'p1', title: 'Oficina', created_at: '2026-11-03T00:00:00Z' }] } });
    writes++;
    if (writes === 1) return route.fulfill({ status: 201, json: { project: { id: 'p2', title: 'Café', created_at: '2026-11-03T00:00:00Z' } } });
    return route.fulfill({ status: 502, json: { error: 'result_unknown', retryAutomatically: false } });
  });
  await page.goto(origin);
  await page.getByText('Oficina', { exact: true }).waitFor();
  await page.getByLabel('Nome do projeto').fill('Café');
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await page.getByText('Café', { exact: true }).waitFor();
  await page.getByLabel('Nome do projeto').fill('Outro');
  await page.getByRole('button', { name: 'Criar projeto' }).click();
  await page.getByText(/A criação pode ter acontecido/).waitFor();
  await page.getByRole('button', { name: 'Atualizar lista' }).click();
  await page.getByText(/A criação anterior ainda pode aparecer/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar projeto' }).isDisabled(), true);
  assert.equal(writes, 2);
});
