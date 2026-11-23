import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {carouselPlanJson} from '../lib/carousel-plan-json.ts';
import {carouselArtId,carouselCopyForChat} from '../lib/studio-carousel-client.ts';
import {finishPreparation, openConversation} from './guided-navigation.mjs';
import {mockPostCatalog} from './mock-post-catalog.mjs';
import {sessionCookie} from './session-cookie.mjs';
import {stopApp, waitForApp} from './wait-for-app.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const alice = id(1), project = id(3);
const title = 'Carrossel de luz natural';
const caption = 'À luz da manhã.\nSalve para testar.';
const sha256 = input => createHash('sha256').update(input).digest('hex');
const lightDiagram = {type: 'category_split', labels: ['Luz direta', 'Luz difusa'], items: ['Sol', 'Cortina']};

const planFrames = [
  {headline: 'Fotografe com luz de janela', role: 'abertura', layout: 'framed_plate', alt: 'Uma manchete sobre luz de janela.'},
  {headline: 'Diferencie luz direta e difusa', role: 'orientação', layout: 'comparison_dual', alt: 'A luz direta vem do sol e a difusa atravessa a cortina.'},
  {headline: 'Salve para a próxima foto', role: 'fechamento', layout: 'cta_closing', alt: 'Um pedido para salvar a orientação.'},
].map(({headline, role, layout, alt}, index) => ({
  id: id(20 + index), position: index + 1, role, headline, body: '', visualCue: '',
  composition: {layout, alt, ...(layout === 'comparison_dual' && {diagram: lightDiagram})},
}));

async function mockComposition(plan) {
  const slides = await Promise.all(plan.slides.map(async ({id, headline,artSha256}, index) => {
    const color = '#' + sha256(headline + (artSha256??'')).slice(0, 6);
    const data = await sharp({create: {width: 1080, height: 1350, channels: 3, background: color}})
      .withIccProfile('srgb').jpeg({quality: 92, chromaSubsampling: '4:4:4'}).toBuffer();
    return {id, index: index + 1, file: `slide-0${index + 1}.jpg`, data, bytes: data.length, sha256: sha256(data),
      ...(artSha256 ? {artSource:{sha256:artSha256}} : {})};
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
    visualInvariants: 'Uma família tipográfica com azul profundo.', compositionMode: 'editorial_art',
    compositionTokens: {accent: '#123456'}, frames: planFrames,
  });
  assert.equal(result.status, 'completed');
  return pieceId;
}

async function readDownload(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return [download.suggestedFilename(), readStoredZip(await readFile(await download.path()))];
}

async function attachArt(page, {pieceId,frameId,bytes}) {
  const input=page.getByLabel('Arquivo PNG ou JPEG da lâmina',{exact:true});
  if (!await input.isVisible()) await page.getByRole('button',{name:'Arte da lâmina',exact:true}).click();
  await input.setInputFiles({name:'fotografia.png',mimeType:'image/png',buffer:bytes});
  const digest=sha256(bytes);
  const assetKey=JSON.stringify([JSON.stringify([alice,project]),pieceId,0,'art-layer',await carouselArtId(frameId,digest)]);
  await page.waitForFunction(async ({assetKey,expectedSize})=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('compor-studio-v1');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try {
      return await new Promise((resolve,reject)=>{
        const request=db.transaction('draftAssets').objectStore('draftAssets').get(assetKey);
        request.onsuccess=()=>resolve(request.result?.file?.size===expectedSize);
        request.onerror=()=>reject(request.error);
      });
    }finally{db.close();}
  },{assetKey,expectedSize:bytes.length});
  return digest;
}

async function localCarouselSnapshot(page, pieceId) {
  const scope=JSON.stringify([alice,project]);
  return page.evaluate(async ({scope,pieceId})=>{
    const read = request => new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const db=await read(indexedDB.open('compor-studio-v1'));
    try {
      const tx=db.transaction(['states','draftAssets']);
      const [row,assets]=await Promise.all([
        read(tx.objectStore('states').get(scope)),
        read(tx.objectStore('draftAssets').getAll()),
      ]);
      const selection=row?.state?.selection;
      const draft=row?.state?.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===selection?.baseVersion);
      return {
        headline:draft?.content.frames?.find(frame=>frame.position===1)?.headline,
        receipt:draft?.content.carouselRender?.planSha256??null,
        previews:assets.filter(asset=>asset.scope===scope&&asset.metadata.pieceId===pieceId&&asset.metadata.kind==='preview')
          .map(asset=>asset.key).sort(),
      };
    } finally {db.close();}
  },{scope,pieceId});
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
  const art = await sharp({create:{width:384,height:256,channels:3,background:'#123456'}}).png().toBuffer();
  let projects = [], catalog, interrupted = false, delayRender;
  const compositionRejections = [
    {error: 'invalid_plan', checks: [{id: 'HEADLINE_BUDGET', index: 2, status: 'fail', detail: 'Diagnóstico interno do render'}]},
    {error: 'archive_too_large'},
  ];
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
      const contentType=request.headers()['content-type'];
      const form=contentType.startsWith('multipart/form-data;')
        ? await new Response(request.postDataBuffer(),{headers:{'content-type':contentType}}).formData()
        : null;
      const {projectId, plan} = form ? JSON.parse(form.get('request')) : request.postDataJSON();
      assert.equal(projectId, project);
      assert.deepEqual(plan.slides.map(slide => slide.id), planFrames.map(frame => frame.id));
      assert.deepEqual(plan.slides[1].diagram, lightDiagram);
      if (form) {
        const [{id,artSha256}]=plan.slides;
        assert.deepEqual([...form.keys()],['request','art:'+id]);
        const file=form.get('art:'+id);
        assert.equal(file.name,'art');
        assert.equal(file.type,'image/png');
        assert.deepEqual(Buffer.from(await file.arrayBuffer()),art);
        assert.equal(artSha256,sha256(art));
      }else{
        assert.ok(plan.slides.every(slide=>slide.artSha256===undefined));
      }
      if (compositionRejections.length) return route.fulfill({status: 422, json: compositionRejections.shift()});
      const render = await mockComposition(plan);
      renders.push({plan, ...render});
      await delayRender?.();
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
  await page.getByRole('status').filter({hasText:'Na lâmina 2, encurte a manchete para até 12 palavras.'}).waitFor();
  assert.equal(renders.length, 0);
  assert.equal(await exportZip.isDisabled(), true);
  await compose.click();
  await page.getByRole('status').filter({hasText:'O carrossel composto ultrapassou o limite do ZIP.'}).waitFor();
  assert.equal(await exportZip.isDisabled(), true);
  await compose.click();
  await exportZip.and(page.locator(':enabled')).waitFor();
  assert.equal(renders.length, 1);

  await button('Pedir ajuste no estúdio').click();
  const artSha256=await attachArt(page,{pieceId,frameId:planFrames[0].id,bytes:art});
  await button('Remover arte da lâmina').waitFor();
  await button('Revisar post').click();
  assert.equal(await exportZip.isDisabled(),true,'anexar arte invalida a composição anterior');
  let entered, release;
  const enteredRender=new Promise(resolve=>{entered=resolve;});
  const holdResponse=new Promise(resolve=>{release=resolve;});
  delayRender=()=>{entered();return holdResponse;};
  try{
    await compose.click();
    await enteredRender;
    await button('Pedir ajuste no estúdio').click();
    const headline=page.getByLabel('Manchete na imagem (gancho)',{exact:true});
    if (!await headline.isVisible()) await button('Textos').click();
    await headline.fill('Faça a foto junto à janela');
    await button('Revisar post').click();
  }finally{delayRender=undefined;release();}
  await compose.and(page.locator(':enabled')).waitFor();
  assert.equal(await exportZip.isDisabled(), true, 'uma edição invalida o ZIP anterior');
  assert.equal(await save.isDisabled(), true, 'uma edição invalida o salvamento sem recompor');
  assert.equal(renders.length, 2, 'editar um título não dispara render automaticamente');
  await compose.click();
  await exportZip.and(page.locator(':enabled')).waitFor();
  assert.equal(renders.length,3);
  assert.notEqual(renders[1].planSha256,renders[2].planSha256);
  const render=renders[2];
  assert.equal(render.plan.slides[0].headline, 'Faça a foto junto à janela');
  assert.equal(render.plan.slides[0].artSha256,artSha256);
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
  assert.equal(saved.content.carouselPlan.slides[0].artSha256,artSha256);
  assert.deepEqual(saved.content.carouselPlan.slides[1].diagram, lightDiagram);
  const chatCopy=carouselCopyForChat(saved.content);
  assert.equal(chatCopy.carouselPlan.slides[0].artSha256,undefined);
  assert.equal(saved.content.carouselPlan.slides[0].artSha256,artSha256);
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
  assert.equal(renders.length,3,'reabrir não recompõe carrosséis salvos');
  const freshButton=name=>fresh.getByRole('button',{name,exact:true});
  await freshButton('Pedir ajuste no estúdio').click();
  const versionsPanel=freshButton('Versões');
  const readsBeforeHistory=reads.length;
  if(await versionsPanel.getAttribute('aria-expanded')!=='true')await versionsPanel.click();
  const history=fresh.getByRole('region',{name:'Variantes deste post',exact:true});
  await history.getByRole('article',{name:'Variante 1',exact:true}).scrollIntoViewIfNeeded();
  const historyCover=history.getByRole('img',{name:'Arte da versão 1',exact:true});
  await historyCover.waitFor();
  const coverDigest=await historyCover.evaluate(async image=>{
    const response=await fetch(image.src);
    const bytes=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
    return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  });
  assert.equal(coverDigest,render.slides[0].sha256,'o histórico exibe os mesmos bytes do JPEG canônico da capa');
  assert.ok(reads.slice(readsBeforeHistory).includes(saved.content.frames.find(frame=>frame.position===1).assetId));
  assert.equal(await history.getByRole('button',{name:/Recuperar imagem da versão/}).count(),0);
  const freshHeadline=fresh.getByLabel('Manchete na imagem (gancho)',{exact:true});
  if (!await freshHeadline.isVisible()) await freshButton('Textos').click();
  await freshHeadline.fill('Fotografe com a janela ao lado');
  await open.click();
  await freshButton('Compor lâminas').click();
  const missingArt=fresh.getByText('Anexe novamente a arte da lâmina no estúdio para compor neste navegador.',{exact:true});
  await missingArt.waitFor();
  assert.equal(renders.length,3,'o render não recebe pedido sem o original local');
  assert.equal(await download.isDisabled(),true);
  await freshButton('Pedir ajuste no estúdio').click();
  await attachArt(fresh,{pieceId,frameId:planFrames[0].id,bytes:art});
  await missingArt.waitFor({state:'hidden'});
  await open.click();
  await Promise.all([
    fresh.waitForResponse(response=>new URL(response.url()).pathname==='/api/studio/carousel/render'&&response.ok()),
    freshButton('Compor lâminas').click(),
  ]);
  await download.and(fresh.locator(':enabled')).waitFor();
  assert.equal(renders.length,4,'a recomposição fica disponível após anexar a fonte');

  await t.test('saída pendente descarta o render recebido sem gravar prévias ou recibo', async () => {
    await freshButton('Pedir ajuste no estúdio').click();
    if (!await freshHeadline.isVisible()) await freshButton('Textos').click();
    const headlineDepoisDaEdicao='Compare a luz em dois horários';
    await freshHeadline.fill(headlineDepoisDaEdicao);
    await open.click();
    assert.equal(await download.isDisabled(), true);

    const renderEntered=Promise.withResolvers();
    const renderReleased=Promise.withResolvers();
    const signOutReleased=Promise.withResolvers();
    delayRender=()=>{renderEntered.resolve();return renderReleased.promise;};
    await fresh.route('**/auth/sign-out',async route=>{
      await signOutReleased.promise;
      return route.fulfill({json:{state:'signed-out'}});
    });
    try {
      await freshButton('Compor lâminas').click();
      await renderEntered.promise;
      assert.equal(renders.length,5);
      assert.equal(renders[4].plan.slides[0].headline,headlineDepoisDaEdicao);
      await fresh.getByLabel(/Conta:/).click();
      await Promise.all([
        fresh.waitForRequest(request=>new URL(request.url()).pathname==='/auth/sign-out'&&request.method()==='POST'),
        freshButton('Sair').click(),
      ]);
      const boundary=fresh.getByTestId('studio-auth-boundary');
      await boundary.and(fresh.locator('[hidden]')).waitFor({state:'attached'});
      // The logout request waits for the edited draft to flush first. Keep the
      // workspace mounted and inert until the competing render has settled.
      const before=await localCarouselSnapshot(fresh,pieceId);
      assert.equal(before.headline,headlineDepoisDaEdicao);
      assert.equal(before.receipt,null);
      const composeLabel=boundary.locator('button').filter({hasText:/^Compor lâminas$/});
      assert.equal(await composeLabel.count(),0,'o render ainda está em andamento');
      renderReleased.resolve();
      await composeLabel.waitFor({state:'attached'});
      assert.deepEqual(await localCarouselSnapshot(fresh,pieceId),before);
    } finally {
      delayRender=undefined;
      renderReleased.resolve();
      signOutReleased.resolve();
    }
  });
  assert.deepEqual(errors, []);
});
