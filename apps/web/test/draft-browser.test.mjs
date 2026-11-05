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
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, COMPOR_STUDIO_WEB_ENABLED:'false', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin } });
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
  let loginUser = 'alice';
  let waitForSession = null;
  await page.route('**/auth/session', async route => {
    if (waitForSession) await waitForSession;
    if (state.state === 'unavailable') return route.fulfill({ status: 503, json: state });
    await route.fulfill({ json: state });
  });
  await page.route('**/auth/sign-in', async route => {
    state = { state: 'connected', userId: loginUser };
    await route.fulfill({ status: 303, headers: { location: '/' }, body: '' });
  });
  await page.goto(origin);
  const objective = page.locator('#objective');
  await objective.fill('rascunho inicial');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForURL(`${origin}/`);
  await assert.doesNotReject(() => objective.waitFor({ state: 'visible' }));
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'rascunho inicial');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-objective:guest')), 'rascunho inicial', 'origem do rascunho deve ser preservada');
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
  await objective.fill('digitado deslogado');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Ainda não conectado' && !document.querySelector('#objective')?.disabled);
  assert.equal(await objective.inputValue(), 'digitado deslogado');
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
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.delayNextSession = true;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]) === '/auth/session' && window.delayNextSession) {
        window.delayNextSession = false;
        await new Promise(resolve => { window.releaseOldSession = resolve; });
      }
      return response;
    };
  });
  state = { state: 'connected', userId: 'alice' };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => typeof window.releaseOldSession === 'function');
  state = { state: 'connected', userId: 'bob' };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'de Bob');
  await page.evaluate(() => window.releaseOldSession());
  await page.waitForTimeout(100);
  assert.equal(await objective.inputValue(), 'de Bob', 'resposta antiga não pode substituir a sessão atual');
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if ((key === 'compor-objective:user:alice' && this.getItem('simulate-storage-failure') === '1') || (key === 'compor-objective:anonymous' && this.getItem('simulate-storage-failure') === '2')) throw new Error('storage indisponível');
      return original.call(this, key, value);
    };
  });
  await page.evaluate(() => sessionStorage.clear());
  state = { state: 'signed-out' };
  await page.reload();
  await objective.fill('não perder');
  await page.evaluate(() => sessionStorage.setItem('simulate-storage-failure', '1'));
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), '');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-objective:guest')), 'não perder');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-has-authenticated')), null);
  await page.evaluate(() => sessionStorage.removeItem('simulate-storage-failure'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'não perder');
  await page.evaluate(() => sessionStorage.setItem('simulate-storage-failure', '1'));
  await objective.fill('edição apenas em memória');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), 'edição apenas em memória');
  await page.evaluate(() => sessionStorage.removeItem('simulate-storage-failure'));
  await page.evaluate(() => sessionStorage.clear());
  state = { state: 'signed-out' };
  await page.reload();
  await objective.fill('rascunho sem conta');
  await page.evaluate(() => sessionStorage.setItem('compor-objective:user:alice', 'versão já existente'));
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'versão já existente');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-objective:guest')), 'rascunho sem conta');
  state = { state: 'signed-out' };
  await page.reload();
  await objective.fill('escrito depois de sair');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  await page.getByRole('button', { name: 'Recuperar rascunho anterior' }).click({ timeout: 3000 });
  assert.equal(await objective.inputValue(), 'escrito depois de sair');
  state = { state: 'signed-out' };
  await page.reload();
  await objective.fill('rascunho da próxima entrada');
  loginUser = 'bob';
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'rascunho da próxima entrada');
  state = { state: 'connected', userId: 'alice' };
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.status')?.textContent === 'Conta conectada');
  assert.equal(await objective.inputValue(), 'escrito depois de sair');
  state = { state: 'signed-out' };
  await page.reload();
  await page.evaluate(() => sessionStorage.setItem('simulate-storage-failure', '2'));
  await objective.fill('não navegue sem salvar');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByText('Não foi possível preservar seu rascunho. Copie o texto antes de continuar.').waitFor();
  assert.equal(await objective.inputValue(), 'não navegue sem salvar');
});

test('sem Supabase configurado é possível rascunhar em memória', { skip: !existsSync(browserPath) }, async t => {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).on('error', reject));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'ignore', env: { ...process.env, COMPOR_STUDIO_WEB_ENABLED:'false', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', APP_ORIGIN: '' } });
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
  await page.goto(origin);
  const objective = page.locator('#objective');
  await objective.fill('rascunho antes da configuração');
  assert.equal(await page.getByRole('button', { name: 'Entrar com Google' }).isDisabled(), true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await objective.inputValue(), 'rascunho antes da configuração');
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
});
