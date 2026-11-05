import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userId = '00000000-0000-4000-8000-000000000001';

test('entrada Studio oferece Google, preserva rascunho anterior e permite recuperar falha de sessão', { skip: !existsSync(browserPath), timeout: 90000 }, async t => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: 'ignore',
    env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin },
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  });
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline || child.exitCode !== null) throw Error('aplicação indisponível');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  let session = 'signed-out', loginCount = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/session') return route.fulfill({ status: session === 'unavailable' ? 503 : 200, json: { state: session, ...(session === 'connected' ? { userId } : {}) } });
    if (url.pathname === '/auth/sign-in') {
      assert.equal(route.request().method(), 'POST');
      loginCount++;
      session = 'connected';
      return route.fulfill({ status: 303, headers: { location: origin }, body: '' });
    }
    if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [] } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    return route.continue();
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('entry-fixture-initialized')) {
      sessionStorage.setItem('entry-fixture-initialized', '1');
      sessionStorage.setItem('compor-objective:guest', 'Rascunho anterior à entrada Google');
    }
  });
  await page.goto(`${origin}/?login=erro`);
  const google = page.getByRole('button', { name: 'Entrar com Google', exact: true });
  await google.waitFor();
  await page.locator('.entry-google:not([disabled])').waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Bom ter você por aqui.', exact: true }).count(), 1);
  assert.equal(await page.locator('input, textarea').count(), 0);
  assert.equal(await page.getByText('Não foi possível concluir o login. Tente novamente.', { exact: true }).count(), 1);
  await page.getByText('Seu rascunho anterior está preservado', { exact: true }).click();
  assert.equal(await page.getByText('Rascunho anterior à entrada Google', { exact: true }).isVisible(), true);
  await google.focus();
  assert.equal(await google.evaluate(element => document.activeElement === element), true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await google.isVisible());
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.compor-brand-symbol img').evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'compor-objective:guest') throw Error('synthetic storage failure');
      return setItem.call(this, key, value);
    };
  });
  await google.click();
  await page.getByText('Não foi possível preservar seu rascunho. Copie o texto antes de continuar.', { exact: true }).waitFor();
  assert.equal(loginCount, 0);
  assert.equal(await page.getByText('Rascunho anterior à entrada Google', { exact: true }).isVisible(), true);
  await page.reload();
  await google.waitFor();
  await page.locator('.entry-google:not([disabled])').waitFor();
  await google.click();
  await page.waitForFunction(() => sessionStorage.getItem('compor-objective:user:00000000-0000-4000-8000-000000000001') === 'Rascunho anterior à entrada Google');
  assert.equal(loginCount, 1);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-objective:guest')), 'Rascunho anterior à entrada Google');
  session = 'unavailable';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('Login temporariamente indisponível.', { exact: true }).waitFor();
  assert.equal(await google.isDisabled(), true);
  assert.equal(await page.locator('.entry-draft').count(), 0);
  session = 'signed-out';
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.locator('.entry-google:not([disabled])').waitFor();
  assert.equal(await page.locator('.entry-draft').count(), 0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `/tmp/compor-entry-${width}.png`, fullPage: true });
  }
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
