import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {carouselPlanJson} from '../lib/carousel-plan-json.ts';
import {finishPreparation, openConversation} from './guided-navigation.mjs';
import {mockPostCatalog} from './mock-post-catalog.mjs';
import {sessionCookie} from './session-cookie.mjs';
import {stopApp, waitForApp} from './wait-for-app.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const alice = id(1), project = id(3);
const title = 'Carrossel de luz natural';
const caption = 'À luz da manhã.\nSalve para testar.';
const sha256 = input => createHash('sha256').update(input).digest('hex');

const planFrames = [
  {headline: 'Fotografe com luz de janela', role: 'abertura', layout: 'typo_breather', alt: 'Uma manchete sobre luz de janela.'},
  {headline: 'Afaste a mesa da janela', role: 'orientação', layout: 'svg_diagram', alt: 'Um diagrama explica a distância da janela.'},
  {headline: 'Salve para a próxima foto', role: 'fechamento', layout: 'cta_closing', alt: 'Um pedido para salvar a orientação.'},
].map(({headline, role, layout, alt}, index) => ({
  id: id(20 + index), position: index + 1, role, headline, body: '', visualCue: '',
  composition: {layout, alt, ...(layout === 'svg_diagram' && {diagram: {type: 'flow', labels: ['Janela', 'Mesa']}})},
}));

async function mockComposition(plan) {
  const slides = await Promise.all(plan.slides.map(async ({id, headline}, index) => {
    const color = '#' + sha256(headline).slice(0, 6);
    const data = await sharp({create: {width: 1080, height: 1350, channels: 3, background: color}})
      .withIccProfile('srgb').jpeg({quality: 92, chromaSubsampling: '4:4:4'}).toBuffer();
    return {id, index: index + 1, file: `slide-0${index + 1}.jpg`, data, bytes: data.length, sha256: sha256(data)};
  }));
  const planSha256 = sha256(carouselPlanJson(plan));
  const manifest = {
    profile: 'compor-carousel-jpeg-4x5.v1', assessment: 'physical_only', planSha256,
    final: {slides: slides.map(({data: _data, ...slide}) => slide)},
  };
  const form = new FormData();
  for (const slide of slides) form.append(slide.file,new Blob([slide.data],{type:'image/jpeg'}),slide.file);
  form.append('qa-manifest.json',new Blob([JSON.stringify(manifest)]),'qa-manifest.json');
  const response=new Response(form);
  return {planSha256, slides, contentType:response.headers.get('content-type'), body:Buffer.from(await response.arrayBuffer())};
}

function readStoredZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const central = bytes.readUInt32LE(end + 16);
  let offset = 0;
  const entries = new Map();
  while (offset < central) {
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'o ZIP guarda os JPEGs originais');
    const nameStart = offset + 30;
    const nameEnd = nameStart + bytes.readUInt16LE(offset + 26);
    const data = nameEnd + bytes.readUInt16LE(offset + 28);
    offset = data + bytes.readUInt32LE(offset + 18);
    entries.set(bytes.toString('utf8', nameStart, nameEnd), bytes.subarray(data, offset));
  }
  assert.equal(entries.size, bytes.readUInt16LE(end + 10));
  return entries;
}

async function applyStudioPlan(page) {
  const context = await page.waitForFunction(async ({userId, projectId}) => {
    if (typeof window.carouselTools?.compor_definir_plano_laminas?.execute !== 'function') return null;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('compor-studio-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('states').objectStore('states').get(JSON.stringify([userId, projectId]));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const state = request.result?.state;
          resolve(state?.selection?.pieceId ? {revision: state.revision, ...state.selection} : null);
        };
      });
    } finally { database.close(); }
  }, {userId: alice, projectId: project});
  const {revision, pieceId, baseVersion} = await context.jsonValue();
  await context.dispose();
  const result = await page.evaluate(args => window.carouselTools.compor_definir_plano_laminas.execute(args), {
    projectId: project, requestId: id(5), revision, pieceId, baseVersion,
    visualInvariants: 'Uma família tipográfica com azul profundo.', compositionMode: 'native_serial',
    compositionTokens: {accent: '#123456'}, frames: planFrames,
  });
  assert.equal(result.status, 'completed');
  return pieceId;
}

async function readDownload(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return [download.suggestedFilename(), readStoredZip(await readFile(await download.path()))];
}

test('carrossel composto invalida prévia editada, salva os JPEGs exatos e reabre em outro navegador', {timeout: 90000}, async t => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let logs = '';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      APP_ORIGIN: origin, COMPOR_CAROUSEL_RENDER_ENABLED: 'true', COMPOR_PRIVATE_IMAGES_ENABLED: 'true'},
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-6000); });
  let browser;
  t.after(async () => {try {await browser?.close();} finally {await stopApp(child);}});
  await waitForApp({url: origin, child, signal: t.signal, diagnostics: () => logs, timeoutMs: 60000});
  browser = await chromium.launch({executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 950}});
  await page.addInitScript(() => {
    const tools = Object.create(null);
    window.carouselTools = tools;
    Object.defineProperty(document, 'modelContext', {configurable: true, value: {registerTool: async (definition, {signal}) => {
      tools[definition.name] = definition;
      signal?.addEventListener('abort', () => {if (tools[definition.name] === definition) delete tools[definition.name];}, {once: true});
    }}});
  });

  const versions = [], renders = [], uploads = [], reads = [], errors = [];
  const privateImages = new Map();
  let projects = [], catalog, interrupted = false;
  async function mockApi(route) {
    const request = route.request();
    const {pathname, searchParams} = new URL(request.url());
    if (pathname === '/api/projects') {
      if (request.method() === 'GET') return route.fulfill({json: {projects}});
      projects = [{id: project, title: request.postDataJSON().title, revision: 1}];
      return route.fulfill({json: {project: projects[0]}});
    }
    if (pathname === '/api/ai/credential-status') return route.fulfill({json: {defaultAvailable: false}});
    if (pathname === '/api/studio/carousel/render') {
      assert.equal(request.headers().accept,'multipart/form-data');
      const {projectId, plan} = request.postDataJSON();
      assert.equal(projectId, project);
      assert.deepEqual(plan.slides.map(slide => slide.id), planFrames.map(frame => frame.id));
      const render = await mockComposition(plan);
      renders.push({plan, ...render});
      return route.fulfill({contentType:render.contentType,body:render.body});
    }
    if (pathname === '/api/pieces') {
      if (request.method() === 'GET') return route.fulfill({json: {versions, posts: [...catalog.records.values()]}});
      const body = request.postDataJSON();
      const latest = versions.at(-1)?.version ?? 0;
      if (latest !== body.expectedVersion) return route.fulfill({status: 409, json: {status: 'conflict', currentVersion: latest}});
      const version = {project_id: project, piece_id: body.pieceId, version: latest + 1, content: body.content,
        metadata: {revision: 1, baseVersion: body.baseVersion || null, approval: {status: 'unapproved'}}};
      versions.push(version);
      return route.fulfill({json: {status: 'saved', version}});
    }
    if (pathname === '/api/piece-version-images') {
      assert.equal(request.method(), 'GET', 'o JPEG não entra no vínculo legado de capa PNG');
      return route.fulfill({json: {assetId: null}});
    }
    if (pathname === '/api/images') {
      const {projectId, pieceId, version, assetId, format} = Object.fromEntries(searchParams);
      const saved = versions.find(item => item.piece_id === pieceId && String(item.version) === version);
      assert.equal(projectId, project);
      assert.equal(format, 'jpeg');
      const frame = saved?.content.frames.find(item => item.assetId === assetId);
      assert.ok(frame, 'o objeto pertence à versão salva e à lâmina');
      if (request.method() === 'GET') {
        reads.push(assetId);
        const image = privateImages.get(assetId);
        return image ? route.fulfill({contentType: 'image/jpeg', body: image})
          : route.fulfill({status: 404, json: {error: 'not_found'}});
      }
      uploads.push(assetId);
      const bytes = request.postDataBuffer();
      assert.equal(request.headers()['content-type'], 'image/jpeg');
      assert.equal(sha256(bytes), saved.content.carouselRender.frames.find(item => item.frameId === frame.id).sha256);
      if (privateImages.has(assetId)) return route.fulfill({status: 409, json: {error: 'asset_exists'}});
      if (!interrupted && privateImages.size === 1) {
        interrupted = true;
        return route.fulfill({status: 502, json: {error: 'result_unknown', retryAutomatically: false}});
      }
      privateImages.set(assetId, bytes);
      return route.fulfill({status: 201, json: {status: 'stored', assetId}});
    }
    if (['/api/studio/chat', '/api/agent/image'].includes(pathname)) {
      assert.fail('compôr ou editar não deve disparar chamadas de geração por IA');
    }
    return route.fulfill({status: 503, json: {error: 'unexpected'}});
  }
  async function installRoutes(target) {
    target.on('pageerror', error => errors.push(error.message));
    await target.context().addCookies([sessionCookie(origin)]);
    await target.route('**/auth/session', route => route.fulfill({json: {state: 'connected', userId: alice}}));
    await target.route('**/api/**', mockApi);
  }
  await installRoutes(page);
  catalog = await mockPostCatalog(page);

  const button = name => page.getByRole('button', {name, exact: true});
  await page.goto(origin);
  await page.getByLabel('Nome do projeto', {exact: true}).fill('Estúdio Editorial');
  await button('Criar projeto e continuar').click();
  await page.getByRole('textbox', {name: 'O que vamos divulgar?', exact: true}).fill('Curso de fotografia');
  await finishPreparation(page, {preparePost: false});
  await page.getByLabel('Nome do post', {exact: true}).fill(title);
  await page.locator('.studio-format-option[data-format="carousel"]').click();
  await page.getByLabel('Quantas lâminas no carrossel?', {exact: true}).fill('3');
  await button('Continuar para criação').click();
  await openConversation(page);
  await button('Começar sem IA, no editor').click();
  const pieceId = await applyStudioPlan(page);
  await button('Textos').click();
  await page.getByLabel('Legenda', {exact: true}).fill(caption);
  await button('Revisar post').click();
  const compose = button('Compor lâminas'), exportZip = button('Baixar carrossel em ZIP'), save = button('Salvar versão');
  assert.equal(await exportZip.isDisabled(), true);
  assert.equal(await save.isDisabled(), true);
  await compose.click();
  await exportZip.and(page.locator(':enabled')).waitFor();
  assert.equal(renders.length, 1);

  await button('Pedir ajuste no estúdio').click();
  if (!await page.getByLabel('Manchete na imagem (gancho)', {exact: true}).isVisible()) await button('Textos').click();
  await page.getByLabel('Manchete na imagem (gancho)', {exact: true}).fill('Faça a foto junto à janela');
  await button('Revisar post').click();
  assert.equal(await exportZip.isDisabled(), true, 'uma edição invalida o ZIP anterior');
  assert.equal(await save.isDisabled(), true, 'uma edição invalida o salvamento sem recompor');
  assert.equal(renders.length, 1, 'editar um título não dispara render automaticamente');
  await compose.click();
  await exportZip.and(page.locator(':enabled')).waitFor();
  assert.equal(renders.length, 2);
  assert.notEqual(renders[0].planSha256, renders[1].planSha256);
  const render = renders[1];
  assert.equal(render.plan.slides[0].headline, 'Faça a foto junto à janela');
  await page.getByRole('img', {name: planFrames[0].composition.alt, exact: true}).waitFor();
  const [draftName, draftZip] = await readDownload(page, exportZip);
  assert.equal(draftName, title + '-v0.zip');
  assert.deepEqual([...draftZip.keys()], [...render.slides.map(slide => `${title}-v0-0${slide.index}.jpg`), 'legenda.txt', 'alt-text.json']);
  render.slides.forEach(slide => assert.deepEqual(draftZip.get(`${title}-v0-0${slide.index}.jpg`), slide.data));
  assert.equal(draftZip.get('legenda.txt').toString('utf8'), caption);
  assert.deepEqual(JSON.parse(draftZip.get('alt-text.json').toString('utf8')),
    planFrames.map(frame => ({index: frame.position, alt: frame.composition.alt})));
  assert.equal(privateImages.size, 0);

  await save.click();
  await page.getByRole('status').filter({hasText: 'O resultado do salvamento é desconhecido.'}).waitFor();
  assert.equal(versions.length, 1);
  assert.equal(privateImages.size, 1);
  assert.equal(uploads.length, 2, 'a falha interrompe a terceira publicação');
  await save.click();
  await page.getByRole('status').filter({hasText: 'Nova versão salva.'}).waitFor();
  assert.equal(versions.length, 1, 'a retomada reutiliza a versão reservada');
  assert.equal(privateImages.size, 3);
  const saved = versions[0];
  assert.equal(saved.piece_id, pieceId);
  assert.equal(saved.content.carouselRender.planSha256, render.planSha256);
  for (const frame of saved.content.frames) {
    assert.match(frame.assetId, /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.deepEqual(privateImages.get(frame.assetId), render.slides[frame.position - 1].data);
  }

  const fresh = await browser.newPage({viewport: {width: 390, height: 844}});
  await installRoutes(fresh);
  const writesBeforeReopen = uploads.length, readsBeforeReopen = reads.length;
  await fresh.goto(`${origin}/projetos/${project}/posts/${pieceId}`);
  const open = fresh.getByRole('button', {name: 'Revisar post', exact: true});
  await open.waitFor();
  const minimize = fresh.getByRole('button', {name: 'Minimizar conversa', exact: true});
  if (await minimize.isVisible()) await minimize.click();
  await open.click();
  const download = fresh.getByRole('button', {name: 'Baixar carrossel em ZIP', exact: true});
  await download.and(fresh.locator(':enabled')).waitFor();
  const [savedName, savedZip] = await readDownload(fresh, download);
  assert.equal(savedName, title + '-v1.zip');
  assert.deepEqual([...savedZip.values()], [...draftZip.values()]);
  assert.ok(reads.length >= readsBeforeReopen + 3, 'um navegador sem cache recupera cada JPEG pela versão');
  assert.equal(uploads.length, writesBeforeReopen, 'reabrir e baixar não republicam objetos');
  assert.equal(renders.length, 2, 'reabrir não recompõe carrosséis salvos');
  assert.deepEqual(errors, []);
});
