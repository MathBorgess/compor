import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { stopApp, waitForApp } from './wait-for-app.mjs';
import { sessionCookie } from './session-cookie.mjs';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const draft = 'Rascunho guardado antes do login';

async function app(t) {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let startup = '';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_publictest', APP_ORIGIN: origin },
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { startup = (startup + value.toString()).slice(-6000); });
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await stopApp(child); } });
  await waitForApp({ url: origin, child, signal: t.signal, diagnostics: () => startup });
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  return { origin, browser };
}

async function entryPage(browser, origin, { signedInCookie }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  if (signedInCookie) await context.addCookies([sessionCookie(origin)]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const activity = { errors: [], external: [], scripts: [], signIn: null };
  page.on('pageerror', error => activity.errors.push(error.message));
  page.on('request', request => { if (request.resourceType() === 'script') activity.scripts.push(new URL(request.url()).pathname); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { activity.external.push(url.origin); return route.abort(); }
    if (url.pathname === '/auth/session') return route.fulfill({ json: { state: 'signed-out' } });
    if (url.pathname === '/auth/sign-in') {
      const response = await route.fetch({ maxRedirects: 0 });
      activity.signIn = { method: route.request().method(), status: response.status(), location: response.headers().location ?? '' };
      return route.fulfill({ contentType: 'text/html', body: '<p>Login simulado</p>' });
    }
    return route.continue();
  });
  await page.addInitScript(value => {
    if (!sessionStorage.getItem('light-entry-fixture')) {
      sessionStorage.setItem('light-entry-fixture', '1');
      sessionStorage.setItem('compor-objective:guest', value);
    }
  }, draft);
  await page.goto(`${origin}/?login=erro`);
  await page.locator('.entry-google:not([disabled])').waitFor();
  return { page, activity };
}

const layout = page => page.evaluate(async () => {
  await document.fonts.ready;
  const box = selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height].map(Math.round); };
  return {
    elements: [...document.querySelectorAll('main.compor-entry *')].map(element => [element.tagName, element.className, element.getAttribute('role'), element.children.length ? '' : element.textContent]),
    boxes: ['main', '.entry-brand', '.entry-panel', 'h1', '.entry-google', '.entry-alert', '.entry-draft', '.entry-byline'].map(box),
    background: getComputedStyle(document.querySelector('main')).backgroundColor,
  };
});

test('entrada sem sessão responde HTML sem JavaScript externo e só a sessão leva ao App Router', { skip: !existsSync(browserPath), timeout: 90000 }, async t => {
  const { origin } = await app(t);
  const light = await fetch(`${origin}/?login=erro`);
  const html = await light.text();
  assert.equal(light.status, 200);
  assert.equal(light.headers.get('cache-control'), 'private, no-store');
  assert.match(light.headers.get('vary') ?? '', /\bCookie\b/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/);
  assert.match(html, /role="alert">Não foi possível concluir o login\. Tente novamente\.</);
  const probe = await (await fetch(`${origin}/?login=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E`)).text();
  assert.doesNotMatch(probe, /onerror|Não foi possível concluir o login/);
  const appRouterHtml = await (await fetch(origin, { headers: { cookie: 'sb-example-auth-token=fixture' } })).text();
  assert.match(appRouterHtml, /<script\b[^>]*\bsrc="\/_next\/static\//);
});

test('entrada leve tem a mesma tela da entrada do App Router e guarda o rascunho para o login', { skip: !existsSync(browserPath), timeout: 90000 }, async t => {
  const { origin, browser } = await app(t);
  const appRouter = await entryPage(browser, origin, { signedInCookie: true });
  await appRouter.page.locator('.compor-brand-symbol[data-motion="arriving"]').waitFor();
  assert.ok(appRouter.activity.scripts.length > 0, 'o App Router carrega JavaScript');

  const { page, activity } = await entryPage(browser, origin, { signedInCookie: false });
  assert.deepEqual(activity.scripts, []);
  assert.equal(await page.evaluate(() => [...document.scripts].every(script => !script.src)), true);
  assert.equal(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('700 28px "Compor DM Sans"'))), true);
  assert.deepEqual(await layout(page), await layout(appRouter.page));
  assert.equal((await layout(page)).background, 'rgb(18, 62, 171)');

  await page.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
  await page.waitForURL(`${origin}/auth/sign-in`);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-claim-pending')), 'guest');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('compor-objective:guest')), draft);
  assert.equal(activity.signIn?.method, 'POST');
  assert.equal(activity.signIn?.status, 303);
  assert.ok(activity.signIn?.location.startsWith('https://example.supabase.co/auth/v1/authorize?provider=google'), activity.signIn?.location);
  for (const { errors, external } of [activity, appRouter.activity]) {
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  }
});
