import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';
import { waitForApp, stopApp } from './wait-for-app.mjs';
import { sessionCookie } from './session-cookie.mjs';
import { finishPreparation, openConversation, closeSettings } from './guided-navigation.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const alice = id(1), project = id(3);
let origin, child, browser;
const stopping = new AbortController();

before(async () => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  let logs = '';
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', APP_ORIGIN: origin },
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { logs = (logs + value).slice(-6000); });
  await waitForApp({ url: origin, child, signal: stopping.signal, diagnostics: () => logs, timeoutMs: 60000 });
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true });
});

after(async () => {
  stopping.abort();
  try { await browser?.close(); } finally { await stopApp(child); }
});

test('seletor de 4 formatos, Carrossel com grade/lâminas, Story 9:16 com áreas seguras e Voz da marca funcionam sem geração automática', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.context().addCookies([sessionCookie(origin)]);
  const errors = [], calls = [];
  page.on('pageerror', error => errors.push(error.message));
  let projects = [];
  const posts = [];
  await page.route('**/auth/session', route => route.fulfill({ json: { state: 'connected', userId: alice } }));
  await page.route('**/api/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    calls.push(path);
    if (path === '/api/projects') {
      if (request.method() === 'POST') {
        projects = [{ id: project, title: request.postDataJSON().title, revision: 1 }];
        return route.fulfill({ json: { project: projects[0] } });
      }
      return route.fulfill({ json: { projects } });
    }
    if (path === '/api/posts') {
      const body = request.postDataJSON();
      const post = { projectId: body.projectId, pieceId: body.pieceId, name: body.name, deleted: false };
      posts.push(post);
      return route.fulfill({ json: { status: 'created', post } });
    }
    if (path === '/api/ai/credential-status') return route.fulfill({ json: { defaultAvailable: false } });
    if (path === '/api/pieces') return route.fulfill({ json: { versions: [], posts } });
    return route.fulfill({ status: 503, json: { error: 'unexpected' } });
  });

  const button = name => page.getByRole('button', { name, exact: true });
  try {
    await page.goto(origin);
    await page.getByLabel('Nome do projeto', { exact: true }).fill('Estúdio Editorial');
    await button('Criar projeto e continuar').click();
    await page.getByRole('textbox', { name: 'O que vamos divulgar?', exact: true }).fill('Curso de fotografia de café');
    await finishPreparation(page, { preparePost: false });

    // 1. Preencher Voz da marca em Configurações do projeto -> Marca e direção
    await button('Configurações do projeto').click();
    await page.getByRole('dialog', { name: 'Configurações do projeto', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Marca e direção', exact: true }).click();
    await page.getByLabel('Tom e registro do perfil', { exact: true }).fill('Direto e artesanal');
    await page.getByLabel('Palavras, clichês ou estilos a evitar', { exact: true }).fill('destrave, revolucione');
    await closeSettings(page);

    // 2. Preparar Carrossel com 4 lâminas
    await page.getByLabel('Nome do post', { exact: true }).fill('Carrossel de luz natural');
    await page.locator('.studio-format-option[data-format="carousel"]').click();
    await page.getByLabel('Quantas lâminas no carrossel?', { exact: true }).fill('4');
    await button('Continuar para criação').click();
    await openConversation(page);
    await button('Começar sem IA, no editor').click();

    await page.locator('.studio-badge-format', { hasText: 'Carrossel · 4:5' }).waitFor();
    assert.equal(await page.locator('.studio-frame-chip').count(), 4);
    await button('+ Lâmina').click();
    assert.equal(await page.locator('.studio-frame-chip').count(), 5);

    // Alternar visão em grade e testar painel Textos + botão Refinar copy com IA
    await button('Ver grade (5)').click();
    assert.equal(await page.locator('.studio-frame-grid-card').count(), 5);
    await button('Ver grade (5)').click();
    await button('Textos').click();
    await page.getByLabel('Manchete na imagem (gancho)', { exact: true }).fill('Por que sua foto fica cinza');
    assert.ok(await button('Refinar copy com IA').isVisible());

    // 3. Criar novo post como Story 9:16 e alternar Guia de áreas seguras
    await button('Posts do projeto').click();
    await button('Criar novo post').click();
    await page.getByLabel('Nome do post', { exact: true }).fill('Story bastidor');
    await page.locator('.studio-format-option[data-format="story"]').click();
    await button('Continuar para criação').click();
    await openConversation(page);
    await button('Começar sem IA, no editor').click();

    await page.locator('.studio-badge-format', { hasText: 'Story · 9:16' }).waitFor();
    assert.equal(await page.locator('.studio-post-frame').getAttribute('data-format'), 'story');
    assert.equal(await page.locator('.studio-safe-zones').count(), 0);
    await button('Guia de áreas seguras').click();
    assert.equal(await page.locator('.studio-safe-zones').count(), 1);
    await button('Guia de áreas seguras').click();
    assert.equal(await page.locator('.studio-safe-zones').count(), 0);

    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem horizontal');
    assert.equal(calls.some(path => path === '/api/studio/chat' || path === '/api/agent/image'), false, 'trocar formato e editar não gera imagem automaticamente');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
