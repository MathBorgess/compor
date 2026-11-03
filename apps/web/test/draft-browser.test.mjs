import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('rascunhos pertencem à conta, aguardam sessão e sobrevivem a falhas', { skip: !existsSync(browserPath) }, async t => {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).on('error', reject));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin } });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const deadline = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw new Error('aplicação indisponível');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let state = { state: 'signed-out' };
  let waitForSession = null;
  await page.route('**/auth/session', async route => {
    if (waitForSession) await waitForSession;
    if (state.state === 'unavailable') return route.fulfill({ status: 503, json: state });
    await route.fulfill({ json: state });
  });
  await page.route('**/auth/sign-in', async route => {
    state = { state: 'connected', userId: 'alice' };
    await route.fulfill({ status: 303, headers: { location: '/' }, body: '' });
  });
  await page.goto(origin);
  const objective = page.locator('#objective');
  await objective.fill('rascunho inicial');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForURL(`${origin}/`);
  await assert.doesNotReject(() => objective.waitFor({ state: 'visible' }));
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'rascunho inicial');
  state = { state: 'connected', userId: 'bob' };
  let releaseSession;
  waitForSession = new Promise(resolve => { releaseSession = resolve; });
  await page.reload();
  assert.equal(await objective.inputValue(), '');
  assert.equal(await objective.isDisabled(), true);
  releaseSession();
  waitForSession = null;
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), '');
  await objective.fill('de Bob');
  state = { state: 'signed-out' };
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#objective')?.disabled);
  assert.equal(await objective.inputValue(), '');
  state = { state: 'unavailable' };
  await page.reload();
  await page.waitForFunction(() => document.body.textContent.includes('Login temporariamente indisponível.'));
  assert.equal(await objective.inputValue(), '');
  assert.equal(await objective.isDisabled(), true);
  state = { state: 'connected', userId: 'alice' };
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), 'rascunho inicial');
  state = { state: 'connected', userId: 'bob' };
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), 'de Bob');
});
