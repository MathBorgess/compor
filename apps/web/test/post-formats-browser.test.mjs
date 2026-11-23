import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { crc32 } from 'node:zlib';
import { chromium } from 'playwright-core';
import { waitForApp, stopApp } from './wait-for-app.mjs';
import {mockPostCatalog} from './mock-post-catalog.mjs';
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

function readStoredZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let directory = bytes.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(directory), 0x02014b50);
    assert.equal(bytes.readUInt16LE(directory + 8), 0x0800, 'nome de arquivo UTF-8');
    assert.equal(bytes.readUInt16LE(directory + 10), 0, 'PNG armazenado sem recompressão');
    const length = bytes.readUInt16LE(directory + 28);
    const name = bytes.toString('utf8', directory + 46, directory + 46 + length);
    const local = bytes.readUInt32LE(directory + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.toString('utf8', local + 30, local + 30 + length), name);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const file = bytes.subarray(start, start + bytes.readUInt32LE(directory + 20));
    assert.equal(crc32(file), bytes.readUInt32LE(directory + 16));
    entries.push({name, file});
    directory += 46 + length + bytes.readUInt16LE(directory + 30) + bytes.readUInt16LE(directory + 32);
  }
  assert.equal(directory, end);
  return entries;
}

test('formatos, Voz da marca e download completo do carrossel funcionam sem geração automática', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.context().addCookies([sessionCookie(origin)]);
  const errors = [], calls = [];
  page.on('pageerror', error => errors.push(error.message));
  let projects = [];
  const versions = [];
  const privateImages = new Map();
  const coverBindings = new Map();
  let interrupted = false;
  let completeSave;
  const saveResponse = new Promise(resolve => { completeSave = resolve; });
  const routeApi = async route => {
    const request = route.request(), {pathname:path, searchParams} = new URL(request.url());
    calls.push(path);
    if (path === '/api/projects') {
      if (request.method() === 'POST') {
        projects = [{ id: project, title: request.postDataJSON().title, revision: 1 }];
        return route.fulfill({ json: { project: projects[0] } });
      }
      return route.fulfill({ json: { projects } });
    }
    if (path === '/api/ai/credential-status') return route.fulfill({ json: { defaultAvailable: false } });
    if (path === '/api/pieces') {
      if (request.method() === 'GET') return route.fulfill({json:{versions, posts:[...catalog.records.values()]}});
      await saveResponse;
      const body = request.postDataJSON();
      const latest = versions.filter(version => version.piece_id === body.pieceId).at(-1)?.version ?? 0;
      if (latest !== body.expectedVersion) return route.fulfill({status:409, json:{status:'conflict', currentVersion:latest}});
      const version = {
        project_id:project, piece_id:body.pieceId, version:latest + 1, content:body.content,
        metadata:{revision:1, baseVersion:body.baseVersion || null, approval:{status:'unapproved'}},
      };
      versions.push(version);
      return route.fulfill({json:{status:'saved', version}});
    }
    if (path === '/api/piece-version-images') {
      if (request.method() === 'GET') {
        const key = [searchParams.get('pieceId'), searchParams.get('version')].join('/');
        return route.fulfill({json:{assetId:coverBindings.get(key) ?? null}});
      }
      const {pieceId, version, assetId} = request.postDataJSON();
      coverBindings.set([pieceId, version].join('/'), assetId);
      return route.fulfill({json:{status:'bound', assetId}});
    }
    if (path === '/api/images') {
      const [projectId, pieceId, version, assetId] = ['projectId','pieceId','version','assetId'].map(key => searchParams.get(key));
      assert.equal(projectId, project);
      assert.equal(versions.some(item => item.piece_id === pieceId && String(item.version) === version), true);
      const key = [pieceId, version, assetId].join('/');
      if (request.method() === 'GET') {
        const image = privateImages.get(key);
        return image ? route.fulfill({contentType:'image/png', body:image}) : route.fulfill({status:404, json:{error:'not_found'}});
      }
      if (privateImages.has(key)) return route.fulfill({status:409, json:{error:'asset_exists'}});
      if (!interrupted && privateImages.size === 2) {
        interrupted = true;
        return route.fulfill({status:502, json:{error:'result_unknown'}});
      }
      privateImages.set(key, request.postDataBuffer());
      return route.fulfill({status:201, json:{status:'stored', assetId}});
    }
    return route.fulfill({ status: 503, json: { error: 'unexpected' } });
  };
  async function installRoutes(target) {
    await target.route('**/auth/session', route => route.fulfill({json:{state:'connected', userId:alice}}));
    await target.route('**/api/**', routeApi);
  }
  await installRoutes(page);
  const catalog = await mockPostCatalog(page);

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
    const caption = 'À luz da manhã.\nSalve para testar.';
    await page.getByLabel('Legenda', {exact:true}).fill(caption);

    const assets = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      return ['#b12f87', '#795611', '#32a36f', '#2147bd', '#ac3429'].map(color => {
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    });
    async function uploadFrame(position) {
      const frame = page.locator('.studio-frame-chip').nth(position - 1);
      await frame.click();
      const input = page.getByLabel('Imagem-base PNG ou JPEG', {exact:true});
      if (!await input.isVisible()) await button('Imagem-base').click();
      await input.setInputFiles({name:`lamina-${position}.png`, mimeType:'image/png', buffer:Buffer.from(assets[position - 1], 'base64')});
      await frame.getByText('Gerada', {exact:true}).waitFor();
    }
    await uploadFrame(1);
    await button('Revisar post').click();
    const archiveButton = button('Baixar carrossel em ZIP');
    assert.equal(await archiveButton.isDisabled(), true);
    await page.getByText('Carrossel incompleto. 1 de 5 lâminas disponíveis. Faltam 2, 3, 4, 5.', {exact:true}).waitFor();
    assert.equal(await button('Baixar lâmina 2').isDisabled(), true);
    await page.getByText('Prévia da capa no perfil', {exact:true}).click();
    const cover = page.getByRole('img', {name:'Capa do carrossel com recorte central de perfil em 3:4'});
    assert.equal(await cover.evaluate(image => getComputedStyle(image).aspectRatio), '3 / 4');
    const individual = page.waitForEvent('download');
    await button('Baixar lâmina 1').click();
    assert.deepEqual(await readFile(await (await individual).path()), Buffer.from(assets[0], 'base64'));

    await button('Pedir ajuste no estúdio').click();
    for (const position of [5, 2, 4, 3]) await uploadFrame(position);
    await button('Revisar post').click();
    await page.setViewportSize({width:390, height:844});
    assert.equal(await archiveButton.isEnabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'revisão do carrossel cabe em celular');
    const archive = page.waitForEvent('download');
    let downloads = 0;
    page.on('download', () => {downloads++;});
    await archiveButton.click();
    const result = await archive;
    await page.getByRole('status').filter({hasText:'Download do ZIP iniciado.'}).waitFor();
    assert.equal(result.suggestedFilename(), 'Carrossel de luz natural-v0.zip');
    const entries = readStoredZip(await readFile(await result.path()));
    assert.equal(downloads, 1);
    assert.deepEqual(entries.map(entry => entry.name), [
      ...assets.map((_, index) => `Carrossel de luz natural-v0-0${index + 1}.png`),
      'legenda.txt',
    ]);
    assets.forEach((asset, index) => assert.deepEqual(entries[index].file, Buffer.from(asset, 'base64')));
    assert.equal(entries.at(-1).file.toString('utf8'), caption);
    assert.equal(calls.includes('/api/images'), false, 'exportar não grava imagens');
    assert.equal(versions.length, 0, 'exportar não salva versão');
    await button('Salvar versão').click();
    assert.equal(await button('Salvando…').isDisabled(), true);
    assert.equal(await archiveButton.isDisabled(), true);
    completeSave();
    await page.getByRole('status').filter({hasText:'O resultado do salvamento é desconhecido.'}).waitFor();
    assert.equal(versions.length, 1, 'o texto ficou na versão reservada');
    assert.equal(privateImages.size, 2, 'interrompe publicações posteriores após resultado desconhecido');
    await button('Salvar versão').click();
    await page.getByRole('status').filter({hasText:'Nova versão salva.'}).waitFor();
    assert.equal(versions.length, 1);
    assert.equal(versions[0].content.frames.length, 5);
    assert.equal(versions[0].content.caption, caption);
    const savedPost = versions[0];
    assert.equal(privateImages.size, 5, 'uma publicação privada para cada lâmina');
    const savedIds = savedPost.content.frames.map(frame => frame.assetId);
    assert.equal(new Set(savedIds).size, 5);
    for (const frame of savedPost.content.frames) {
      assert.match(frame.assetId, /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
      assert.deepEqual(privateImages.get([savedPost.piece_id, savedPost.version, frame.assetId].join('/')),
        Buffer.from(assets[frame.position - 1], 'base64'));
    }
    await page.setViewportSize({width:1440, height:950});
    await page.reload();
    await archiveButton.and(page.locator(':enabled')).waitFor();
    const savedArchive = page.waitForEvent('download');
    await archiveButton.click();
    const savedResult = await savedArchive;
    assert.equal(savedResult.suggestedFilename(), 'Carrossel de luz natural-v1.zip');
    const savedEntries = readStoredZip(await readFile(await savedResult.path()));
    assert.deepEqual(savedEntries.map(entry => entry.file), entries.map(entry => entry.file));
    await button('Pedir ajuste no estúdio').click();

    const fresh = await browser.newPage({viewport:{width:390,height:844}});
    try {
      await fresh.context().addCookies([sessionCookie(origin)]);
      await installRoutes(fresh);
      await fresh.goto(`${origin}/projetos/${project}/posts/${savedPost.piece_id}`);
      const open = fresh.getByRole('button', {name:'Revisar post', exact:true});
      await open.waitFor();
      const minimize = fresh.getByRole('button', {name:'Minimizar conversa', exact:true});
      if (await minimize.isVisible()) await minimize.click();
      await open.click();
      const freshExport = fresh.getByRole('button', {name:'Baixar carrossel em ZIP', exact:true});
      await freshExport.and(fresh.locator(':enabled')).waitFor();
      const freshDownload = fresh.waitForEvent('download');
      await freshExport.click();
      const archive = await freshDownload;
      assert.equal(archive.suggestedFilename(), 'Carrossel de luz natural-v1.zip');
      assert.deepEqual(readStoredZip(await readFile(await archive.path())), savedEntries);
      assert.equal(privateImages.size, 5, 'reabrir e baixar não gravam ativos');
    } finally {
      await fresh.close();
    }

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
    completeSave();
    await page.close();
  }
});
