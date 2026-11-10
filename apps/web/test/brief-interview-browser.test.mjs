import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {connectOwnOpenAiKey} from './openai-credentials.mjs';
import {stopApp, waitForApp} from './wait-for-app.mjs';
import {sessionCookie,sessionCookieHeaders} from './session-cookie.mjs';

const browserPath = process.env.BROWSER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000003';

async function app(t, {withReferences = false} = {}) {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let startup = '';
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', APP_ORIGIN: origin},
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', value => { startup = (startup + value.toString()).slice(-6000); });
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await stopApp(child); } });
  await waitForApp({url: origin, child, signal: t.signal,headers:sessionCookieHeaders(origin),nextApp:true, diagnostics: () => startup});
  browser = await chromium.launch({executablePath: browserPath, headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.setDefaultTimeout(6000);
  await page.context().addCookies([sessionCookie(origin)]);
  const errors = [], calls = [], external = [], selectionSignals = [], referenceSelectionSignals=[];
  const paging = {nextBeforeOrdinal:null, older:[]};
  const images = [
    {id: '00000000-0000-4000-8000-000000000091', project_id: projectId, state: 'completed', created_at: '2026-11-06T12:00:00Z', ordinal: 1, batch_id: '00000000-0000-4000-8000-000000000093', batch_position: 1},
    {id: '00000000-0000-4000-8000-000000000092', project_id: projectId, state: 'unknown', created_at: '2026-11-06T12:01:00Z', ordinal: 2, batch_id: '00000000-0000-4000-8000-000000000093', batch_position: 2},
  ];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      if (withReferences && url.hostname === 'i.pinimg.com') return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')});
      external.push(url.origin); return route.abort();
    }
    if (url.pathname === '/auth/session') return route.fulfill({json: {state: 'connected', userId}});
    if (url.pathname === '/api/ai/credential-status') return route.fulfill({json:{defaultAvailable:false}});
    if (url.pathname === '/api/projects') return route.fulfill({json: {projects: [{id: projectId, title: 'Direção opcional'}]}});
    if (url.pathname === '/api/pieces' && request.method() === 'GET') return route.fulfill({json: {versions: []}});
    if (url.pathname === '/api/studio/references/history')return route.fulfill({json:{references:[]}});
    if (url.pathname === '/api/studio/references/signals' && request.postDataJSON().action === 'selected') {
      const body=request.postDataJSON();referenceSelectionSignals.push(body);
      return route.fulfill({status:201,json:{signal:{...body,createdAt:'2026-11-09T12:00:00.000Z'}}});
    }
    if (withReferences && url.pathname === '/api/studio/references/search') {
      calls.push({path:url.pathname,body:request.postDataJSON()});
      return route.fulfill({json:{status:'ok',references:[{id:'e1_example',title:'Tipografia',board:'behance/typography',originUrl:'https://www.pinterest.com/pin/e1_example/',previewUrl:'https://i.pinimg.com/236x/image.png'}]}});
    }
    if (withReferences && url.pathname === '/api/studio/references/preview') {
      calls.push({path:url.pathname,body:request.postDataJSON()});
      return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')});
    }
    if (url.pathname === '/api/studio/chat') {
      const body = request.postDataJSON(); calls.push({path: url.pathname, body});
      if (body.message.startsWith('Outra ideia')) return route.fulfill({status: 202, json: {status: 'completed', text: `Resposta ${body.message} ${'detalhe '.repeat(300)}`}});
      return route.fulfill({status: 202, json: {status: 'action_required', action: {name: 'compor_editar_briefing', args: {projectId, requestId: '00000000-0000-4000-8000-000000000099', revision: body.context.revision, field: 'offer', value: 'Aula de cerâmica'}}, actionBinding: 'brief-action'}});
    }
    if (url.pathname === '/api/studio/action') {
      const body = request.postDataJSON(); calls.push({path: url.pathname, body});
      return route.fulfill({status: 202, json: {status: 'completed', text: 'Uma aula de cerâmica. Para quem você quer divulgá-la?'}});
    }
    if (url.pathname === '/api/studio/explorations/signals') {
      const body=request.postDataJSON();if(body.action==='selected')selectionSignals.push(body);
      return route.fulfill({json:{signals:[]}});
    }
    if (url.pathname === '/api/studio/explorations/status') return route.fulfill({json:{status:'active'}});
    if (url.pathname === '/api/studio/explorations/resume') return route.fulfill({json:{status:'resumed'}});
    if (url.pathname === '/api/studio/references/signals' && request.postDataJSON().scope === 'account') return route.fulfill({json:{signals:[]}});
    if (url.pathname === '/api/studio/explorations' && request.method() === 'POST') {
      const body=request.postDataJSON(); calls.push({path:url.pathname,body});
      return route.fulfill({status:202,json:{status:'unknown',requestId:body.requestId}});
    }
    if (url.pathname === '/api/studio/explorations' && request.method() === 'GET') {
      calls.push({path: url.pathname});
      return route.fulfill({json: url.searchParams.has('beforeOrdinal') ? {images:paging.older,nextBeforeOrdinal:null} : {images,nextBeforeOrdinal:paging.nextBeforeOrdinal}});
    }
    if (url.pathname === '/api/studio/explorations/image') return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')});
    if (url.pathname.startsWith('/api/')) {
      calls.push({path: url.pathname});
      return route.fulfill({status: 500, json: {error: 'unexpected_test_operation'}});
    }
    return route.continue();
  });
  return {page, origin, calls, errors, external, images, paging, selectionSignals, referenceSelectionSignals};
}

async function openProject(page, origin) {
  await page.goto(origin);
  await page.getByRole('button', {name: /Direção opcional/}).click();
  await page.getByLabel('Sua mensagem', {exact: true}).waitFor({state:'attached'});
  if (!await page.getByLabel('Sua mensagem', {exact: true}).isVisible()) await page.getByRole('button', {name: 'Abrir conversa', exact: true}).click();
  await page.getByLabel('Sua mensagem', {exact: true}).waitFor();
}

async function openEditorConversation(page) {
  const references=page.getByRole('button',{name:'Referências',exact:true});
  if(await references.isVisible())await references.click();
  await page.getByRole('button',{name:'Definir textos da arte',exact:true}).click();
  const message=page.getByLabel('Sua mensagem',{exact:true});
  if(!await message.isVisible())await page.getByRole('button',{name:'Abrir conversa',exact:true}).click();
  await message.waitFor();
}

test('briefing acontece na conversa e resumo acompanha o que foi registrado', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, external} = await app(t);
  await openProject(page, origin);
  const summary = page.getByRole('region', {name: 'Contexto do projeto', exact: true});
  await page.getByRole('region', {name: 'Buscar referências visuais', exact: true}).waitFor();
  await summary.getByText('O que vamos divulgar?', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Entrevista do brief', {exact: true}).count(), 0);
  assert.equal(await page.getByText('exploração · esboço ilustrativo', {exact: true}).count(), 0);
  assert.ok(calls.every(call => call.path === '/api/studio/explorations' && !call.body), 'abrir o projeto somente consulta explorações anteriores');
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem', {exact: true}).fill('Quero divulgar uma aula de cerâmica.');
  await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
  await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?', {exact: true}).waitFor();
  await summary.getByText('Aula de cerâmica', {exact: true}).waitFor();
  assert.equal(await page.getByText('Quero divulgar uma aula de cerâmica.', {exact: true}).count(), 1);
  assert.deepEqual(calls.filter(call => call.path !== '/api/studio/explorations').map(call => call.path), ['/api/studio/chat', '/api/studio/action']);
  await page.reload();
  await page.getByRole('button', {name: /Direção opcional/}).click();
  await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?', {exact: true}).waitFor();
  await page.getByRole('region', {name: 'Contexto do projeto', exact: true}).getByText('Aula de cerâmica', {exact: true}).waitFor();
  assert.equal(await page.getByRole('button', {name: 'Enviar →', exact: true}).isDisabled(), true, 'a chave não é guardada após recarregar');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

test('conexão e envio ficam acessíveis no celular', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t);
  await page.setViewportSize({width: 390, height: 844});
  await openProject(page, origin);
  await page.getByRole('button', {name:'Usar minha chave',exact:true}).click();
  const input = page.getByLabel('Chave OpenAI', {exact: true});
  assert.equal(await input.isVisible(), true);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByRole('button', {name:'Continuar',exact:true}).click();
  await page.getByLabel('Sua mensagem', {exact: true}).fill('Uma ideia para criar.');
  const send = page.getByRole('button', {name: 'Enviar →', exact: true});
  await send.scrollIntoViewIfNeeded();
  const bounds = await send.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
  await page.waitForFunction(() => {
    const button = document.querySelector('form.studio-chat-composer button');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  assert.equal(await send.isEnabled(), true);
  assert.deepEqual(errors, []);
});

test('respostas exibem Markdown seguro e indicam processamento acessível', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors, external} = await app(t);
  await page.emulateMedia({reducedMotion:'reduce'});
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/studio/chat', async route => {
    await gate;
    await route.fulfill({status:202,json:{status:'completed',text:'**Direção visual**\n\n- Azul\n- Amarelo\n\n[Link seguro](https://example.com/) [Contato](mailto:contato@example.com) [Link perigoso](javascript:alert(1)) [Link relativo](/privado) [Link em arquivo](file:///etc/passwd)\n\n![imagem externa](https://tracking.example/pixel.png)\n\n<script>alert(1)</script>\n\n<img src="https://tracking.example/raw.png" onerror="alert(1)">\n\n<a href="javascript:alert(1)">HTML bruto</a>'}});
  });
  await openProject(page, origin);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem',{exact:true}).fill('Mostre a direção.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  const status = page.getByRole('status').filter({hasText:'Compor está trabalhando…'});
  await status.waitFor();
  assert.equal(await status.locator('i').first().evaluate(element=>getComputedStyle(element).animationName),'none');
  release();
  const message=page.locator('article[data-role="assistant"]').last();
  await message.locator('strong').getByText('Direção visual').waitFor();
  assert.deepEqual(await message.locator('li').allTextContents(),['Azul','Amarelo']);
  assert.equal(await message.getByRole('link',{name:'Link seguro'}).getAttribute('href'),'https://example.com/');
  assert.equal(await message.getByRole('link',{name:'Link seguro'}).getAttribute('rel'),'noopener noreferrer');
  assert.equal(await message.getByRole('link',{name:'Contato'}).getAttribute('href'),'mailto:contato@example.com');
  assert.equal(await message.getByRole('link',{name:'Link perigoso'}).count(),0);
  assert.equal(await message.getByRole('link',{name:'Link relativo'}).count(),0);
  assert.equal(await message.getByRole('link',{name:'Link em arquivo'}).count(),0);
  assert.equal(await message.getByRole('link',{name:'HTML bruto'}).count(),0);
  assert.equal(await message.locator('script, img').count(),0);
  assert.equal(await status.count(),0);
  assert.deepEqual(external,[]);
  assert.deepEqual(errors,[]);
});

test('duas rodadas sem resposta pedem decisão no chat e retomam somente por ação explícita', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page,origin,calls} = await app(t);
  await page.addInitScript(({userId,projectId}) => {
    const batchId='00000000-0000-4000-8000-000000000055';
    localStorage.setItem(`compor-exploration-batch:${userId}:${projectId}`,JSON.stringify({sequence:6,batchId,completed:3,nextAt:0,remainingMs:null,reviewBatches:[],reviewedBatchId:null,awaitingFeedback:true}));
  },{userId,projectId});
  await openProject(page,origin);
  await page.getByText(/Mostrei duas rodadas de propostas/).waitFor();
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByRole('button',{name:'Gerar mais propostas'}).waitFor();
  assert.equal(calls.filter(call=>call.path==='/api/studio/explorations' && call.body).length,0);
});

test('no editor, somente histórico rola e o envio permanece visível no painel compacto', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t);
  await page.setViewportSize({width: 742, height: 720});
  await openProject(page, origin);
  await openEditorConversation(page);
  await page.locator('.studio-conversation').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.studio-conversation').getBoundingClientRect();
    const input = document.querySelector('#studio-chat-message').getBoundingClientRect();
    const send = document.querySelector('form.studio-chat-composer button').getBoundingClientRect();
    const meta = document.querySelector('.studio-chat-meta');
    const composer = document.querySelector('form.studio-chat-composer');
    const history = document.querySelector('.studio-chat-messages');
    return {panel: panel.toJSON(), input: input.toJSON(), send: send.toJSON(), metaOverflow: getComputedStyle(meta).overflowY, composerOverflow: getComputedStyle(composer).overflowY, historyOverflow: getComputedStyle(history).overflowY};
  });
  t.diagnostic(JSON.stringify({viewport:"742x720",geometry}));
  if(process.env.COMPOR_LAYOUT_CAPTURE_PREFIX)await page.screenshot({path:`${process.env.COMPOR_LAYOUT_CAPTURE_PREFIX}-742x720.png`});
  assert.ok(geometry.input.top >= geometry.panel.top && geometry.input.bottom <= geometry.panel.bottom);
  assert.ok(geometry.send.top >= geometry.panel.top && geometry.send.bottom <= geometry.panel.bottom);
  assert.equal(geometry.metaOverflow, 'visible');
  assert.equal(geometry.composerOverflow, 'visible');
  assert.equal(geometry.historyOverflow, 'auto');
  await page.getByLabel('Sua mensagem', {exact:true}).fill('Rascunho preservado na conexão');
  await page.getByRole('button', {name:'Usar minha chave',exact:true}).click();
  await page.getByLabel('Chave OpenAI', {exact:true}).waitFor();
  assert.equal(await page.getByLabel('Chave OpenAI', {exact:true}).evaluate(element => getComputedStyle(element).borderRadius), '10px');
  await page.getByRole('button', {name:'Continuar sem IA por enquanto',exact:true}).click();
  await page.locator('.studio-conversation').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  assert.equal(await page.getByLabel('Sua mensagem', {exact:true}).inputValue(),'Rascunho preservado na conexão');
  await page.setViewportSize({width: 390, height: 400});
  await page.waitForFunction(()=>Number(document.querySelector('[role="slider"]').getAttribute('aria-valuemax'))===Math.floor(window.innerHeight-32));
  const shortViewport = await page.evaluate(() => {
    const panel = document.querySelector('.studio-conversation').getBoundingClientRect();
    const input = document.querySelector('#studio-chat-message').getBoundingClientRect();
    const send = document.querySelector('form.studio-chat-composer button').getBoundingClientRect();
    const slider=document.querySelector('[role="slider"]');
    return {panel: panel.toJSON(), input: input.toJSON(), send: send.toJSON(),aria:{min:Number(slider.getAttribute('aria-valuemin')),max:Number(slider.getAttribute('aria-valuemax')),now:Number(slider.getAttribute('aria-valuenow'))}};
  });
  t.diagnostic(JSON.stringify({viewport:"390x400",geometry:shortViewport}));
  if(process.env.COMPOR_LAYOUT_CAPTURE_PREFIX)await page.screenshot({path:`${process.env.COMPOR_LAYOUT_CAPTURE_PREFIX}-390x400.png`});
  assert.ok(shortViewport.input.top >= shortViewport.panel.top && shortViewport.input.bottom <= shortViewport.panel.bottom, 'o campo permanece acessível com viewport baixo');
  assert.ok(shortViewport.send.top >= shortViewport.panel.top && shortViewport.send.bottom <= shortViewport.panel.bottom, 'o envio permanece acessível com viewport baixo');
  const slider=page.getByRole('slider',{name:'Altura da conversa'});
  assert.equal(shortViewport.aria.min,260);
  assert.equal(shortViewport.aria.max,368);
  assert.equal(shortViewport.aria.now,Math.round(shortViewport.panel.height));
  await page.getByRole('button',{name:'Ocultar detalhes da conversa'}).click();
  await page.waitForFunction(()=>document.querySelector('[role="slider"]').getAttribute('aria-valuemin')==='180');
  const hidden=await page.locator('.studio-conversation').boundingBox();
  assert.equal(hidden.height,shortViewport.panel.height,'ocultar detalhes não encolhe a altura escolhida');
  await slider.focus();await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('[role="slider"]').getAttribute('aria-valuenow')==='180');
  const compact=await page.evaluate(()=>({panel:document.querySelector('.studio-conversation').getBoundingClientRect().toJSON(),composer:document.querySelector('.studio-chat-composer').getBoundingClientRect().toJSON()}));
  assert.equal(compact.panel.height,180);
  assert.ok(compact.composer.top>=compact.panel.top&&compact.composer.bottom<=compact.panel.bottom);
  t.diagnostic(JSON.stringify({viewport:'390x400-details-hidden',geometry:compact}));
  if(process.env.COMPOR_LAYOUT_CAPTURE_PREFIX)await page.screenshot({path:`${process.env.COMPOR_LAYOUT_CAPTURE_PREFIX}-390x400-hidden.png`});

  assert.deepEqual(errors, []);
});

test('no editor, detalhes podem ser recolhidos e a conversa ampliada por teclado ou ponteiro', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page,origin,errors}=await app(t);
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:742,height:720});
  await openProject(page,origin);
  await openEditorConversation(page);
  const details=page.locator('#studio-chat-details');
  const toggle=page.getByRole('button',{name:'Ocultar detalhes da conversa'});
  assert.equal(await details.isVisible(),true);await toggle.click();
  assert.equal(await details.isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Mostrar detalhes da conversa'}).getAttribute('aria-expanded'),'false');
  const panel=page.locator('.studio-conversation'),slider=page.getByRole('slider',{name:'Altura da conversa'});
  const before=await panel.boundingBox();await slider.focus();await page.keyboard.press('ArrowUp');
  await page.waitForFunction(previous=>document.querySelector('.studio-conversation').getBoundingClientRect().height>previous,before.height);
  const keyboard=await panel.boundingBox();assert.ok(Math.abs((keyboard.y+keyboard.height)-(before.y+before.height))<1,'borda inferior permanece fixa');
  const grip=await slider.boundingBox();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2-80,{steps:4});await page.mouse.up();
  await page.waitForFunction(previous=>document.querySelector('.studio-conversation').getBoundingClientRect().height>previous,keyboard.height);
  const after=await panel.boundingBox();assert.ok(Math.abs((after.y+after.height)-(before.y+before.height))<1);
  await page.getByRole('button',{name:'Mostrar detalhes da conversa'}).click();assert.equal(await details.isVisible(),true);
  await page.setViewportSize({width:390,height:400});
  await page.getByRole('button',{name:'Ocultar detalhes da conversa'}).click();
  await slider.focus();await page.keyboard.press('End');
  const short=await panel.boundingBox(),composer=await page.locator('form.studio-chat-composer').boundingBox();
  assert.ok(short.y>=0&&short.y+short.height<=400);assert.ok(composer.y+composer.height<=short.y+short.height);
  assert.deepEqual(errors,[]);
});

test('consultar explorações mostra resultados confirmados, recusados e incertos sem gerar imagens', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, images} = await app(t);
  images.unshift({id:'00000000-0000-4000-8000-000000000094',project_id:projectId,state:'rejected',created_at:'2026-11-06T12:02:00Z',ordinal:3,batch_id:'00000000-0000-4000-8000-000000000093',batch_position:3});
  await openProject(page, origin);
  await page.getByRole('button', {name: 'Consultar explorações', exact: true}).click();
  const gallery = page.getByRole('region', {name: 'Explorações de imagem', exact: true});
  await gallery.getByText('Resultado não confirmado.', {exact: true}).waitFor();
  await gallery.getByText('Chave recusada; nenhuma imagem foi gerada.', {exact: true}).waitFor();
  const image = gallery.getByRole('button', {name: 'Usar imagem 1 na conversa e na Direção', exact: true});
  await image.waitFor();
  assert.equal(await image.count(), 1);
  assert.ok(calls.length >= 1 && calls.every(call => call.path === '/api/studio/explorations' && !call.body), 'a galeria apenas consulta imagens');
  assert.deepEqual(errors, []);
});

test('chat mostra trabalho recente e respeita leitura anterior durante processamento', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/studio/chat', async route => {
    if (route.request().postDataJSON().message !== 'Outra ideia 3') return route.fallback();
    await gate;
    return route.fulfill({status:202,json:{status:'completed',text:`Resposta Outra ideia 3 ${'detalhe '.repeat(300)}`}});
  });
  await openProject(page, origin);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  const field = page.getByLabel('Sua mensagem', {exact: true});
  for (let index = 0; index < 3; index++) {
    await field.fill(`Outra ideia ${index}`);
    await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
    await page.getByText(`Resposta Outra ideia ${index}`, {exact: false}).waitFor();
  }
  const history = page.locator('.studio-chat-messages');
  assert.ok(await history.evaluate(element => element.scrollTop > 0), 'a resposta mais recente entra em vista');
  await history.evaluate(element => { element.scrollTop = 0; });
  await page.waitForFunction(() => document.querySelector('.studio-chat-messages').scrollTop === 0);
  await field.fill('Outra ideia 3');
  await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
  await page.getByRole('status').filter({hasText:'Compor está trabalhando…'}).waitFor();
  assert.ok(await history.evaluate(element => element.scrollTop > 0), 'o processamento mostra a conversa recente');
  await history.hover();
  await page.mouse.wheel(0,-100000);
  await page.waitForFunction(() => document.querySelector('.studio-chat-messages').scrollTop === 0);
  await history.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  release();
  await page.getByText('Resposta Outra ideia 3', {exact: false}).waitFor();
  assert.equal(await history.evaluate(element => element.scrollTop), 0, 'ler o começo não é interrompido');
  assert.deepEqual(errors, []);
});


test('referência escolhida preserva origem e acompanha o próximo turno da conversa', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors} = await app(t, {withReferences:true});
  await openProject(page, origin);
  const panel=page.getByRole('region',{name:'Buscar referências visuais'});
  await panel.getByLabel('O que você quer explorar?').fill('tipografia para aula');
  await panel.getByRole('button',{name:'Permitir nesta sessão'}).click();
  await panel.getByRole('button',{name:'Buscar referências',exact:true}).click();
  await panel.getByRole('link',{name:'Ver origem no Pinterest'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Me interessa'}).count(),0);
  assert.equal(await panel.getByRole('button',{name:'Não combina'}).count(),0);
  await panel.getByRole('button',{name:'Usar como referência: Tipografia'}).click();
  await panel.getByRole('status').waitFor();
  assert.equal(await panel.getByRole('status').textContent(), 'Referência adicionada à conversa e à Direção neste navegador.');
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem',{exact:true}).fill('Outra ideia: compare essa referência.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.getByText('Resposta Outra ideia: compare essa referência.',{exact:false}).waitFor();
  const call=calls.find(call=>call.path==='/api/studio/chat');
  assert.equal(call.body.referenceImages.length,1);
  assert.equal(call.body.context.references[0].source.originUrl,'https://www.pinterest.com/pin/e1_example/');
  assert.equal(call.body.context.references[0].source.board,'behance/typography');
  assert.equal(call.body.context.references[0].source.title,'Tipografia');
  assert.deepEqual(errors,[]);
});

test('pergunta do turno de seleção pausa a exploração até a pessoa responder ou pedir mais', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t, {withReferences:true});
  const selections=[],generations=[];
  await page.route(url=>url.pathname==='/api/studio/chat',route=>{const body=route.request().postDataJSON();if(body.op!=='reference_selection')return route.fallback();selections.push(body);return route.fulfill({status:202,json:{status:'completed',text:'As referências pedem uma tipografia editorial.\n\n**Recomendação:** Siga pela serifada, porque conversa com quem faz cerâmica.\n\nPosso seguir pela serifada?'}});});
  await page.route(url=>url.pathname==='/api/studio/explorations',route=>{if(route.request().method()!=='POST')return route.fallback();const body=route.request().postDataJSON();generations.push(body);return route.fulfill({json:{status:'completed',requestId:body.requestId}});});
  await openProject(page, origin);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem',{exact:true}).fill('Quero divulgar uma aula de cerâmica.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?',{exact:true}).waitFor();
  const panel=page.getByRole('region',{name:'Buscar referências visuais'});
  await panel.getByLabel('O que você quer explorar?').fill('tipografia para aula');
  await panel.getByRole('button',{name:'Permitir nesta sessão'}).click();
  await panel.getByRole('button',{name:'Buscar referências',exact:true}).click();
  await panel.getByRole('button',{name:'Usar como referência: Tipografia'}).click();
  const recovery=page.locator('.studio-exploration-recovery');
  await recovery.getByText('A exploração aguarda sua resposta no chat.').waitFor({timeout:15000});
  await page.getByText('Posso seguir pela serifada?',{exact:true}).waitFor();
  assert.equal(selections.length,1);
  const held=generations.length;assert.ok(held>0,'a exploração já gerava antes da pergunta');
  await page.waitForTimeout(17000);
  assert.equal(generations.length,held,'nenhum lote começa enquanto a pergunta aguarda resposta');
  await recovery.getByRole('button',{name:'Gerar mais propostas'}).click();
  await recovery.waitFor({state:'detached'});
  await page.getByRole('timer',{name:/Próximo lote em/}).waitFor({timeout:15000});
  assert.deepEqual(errors,[]);
});

test('imagem gerada escolhida mantém origem e segue ao próximo turno', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, selectionSignals} = await app(t);
  await openProject(page, origin);
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  assert.equal(await gallery.getByText('Avaliar esta imagem').count(),0);
  await gallery.getByRole('button',{name:'Usar imagem 1 na conversa e na Direção'}).click();
  await gallery.getByText('Imagem adicionada à conversa e à Direção neste navegador.',{exact:true}).waitFor();
  assert.equal(selectionSignals.length,1);
  assert.match(selectionSignals[0].id,/^[0-9a-f-]{36}$/);
  assert.deepEqual({...selectionSignals[0],id:'id-validado'},{id:'id-validado',projectId,imageId:'00000000-0000-4000-8000-000000000091',action:'selected',comment:'',supersedes:null});
  assert.equal(await gallery.getByRole('button',{name:'Imagem usada 1 na conversa e na Direção'}).isDisabled(),true);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem',{exact:true}).fill('Outra ideia: compare esta exploração.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.getByText('Resposta Outra ideia: compare esta exploração.',{exact:false}).waitFor();
  const call=calls.find(call=>call.path==='/api/studio/chat');
  assert.equal(call.body.referenceImages.length,1);
  assert.deepEqual(call.body.context.references[0].source,{kind:'generated',projectId,imageId:'00000000-0000-4000-8000-000000000091',ordinal:1});
  assert.equal(call.body.referenceImages[0].id,call.body.context.references[0].id);
  assert.deepEqual(errors,[]);
});


test('último lote aparece primeiro e ordinal não muda quando chegam imagens novas', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, images, errors} = await app(t);
  const item=(n,batch)=>({id:`00000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,project_id:projectId,state:'completed',created_at:'2026-11-06T12:00:00Z',ordinal:n,batch_id:batch,batch_position:n===3?1:n===4?2:n});
  const first='00000000-0000-4000-8000-000000000201',second='00000000-0000-4000-8000-000000000202';
  images.splice(0,images.length,item(3,second),item(2,first),item(1,first));
  await openProject(page, origin);
  await page.getByRole('button',{name:'Recolher conversa',exact:true}).click();
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('button',{name:'Usar imagem 3 na conversa e na Direção'}).waitFor();
  assert.equal(await gallery.getByRole('button',{name:'Usar imagem 2 na conversa e na Direção'}).count(),0);
  await gallery.getByText('Ver imagens anteriores (2)').click();
  await gallery.getByRole('button',{name:'Usar imagem 2 na conversa e na Direção'}).waitFor();
  images.unshift(item(4,second));
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('button',{name:'Usar imagem 4 na conversa e na Direção'}).waitFor();
  const stable=gallery.getByRole('button',{name:'Usar imagem 3 na conversa e na Direção'});
  assert.match(await stable.locator('img').getAttribute('src'),/00000000-0000-4000-8000-000000000103/);
  assert.deepEqual(errors,[]);
});


test('carregar páginas antigas preserva seleção e não altera os ordinais após atualização', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, images, paging, errors} = await app(t);
  const item=n=>({id:`00000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,project_id:projectId,state:'completed',created_at:'2026-11-06T12:00:00Z',ordinal:n,batch_id:'00000000-0000-4000-8000-000000000202',batch_position:1});
  images.splice(0,images.length,item(103),item(102),item(101));
  paging.nextBeforeOrdinal=101;paging.older=[{...item(100),batch_id:'00000000-0000-4000-8000-000000000201'},{...item(99),batch_id:'00000000-0000-4000-8000-000000000201'}];
  await openProject(page, origin);
  await page.getByRole('button',{name:'Recolher conversa',exact:true}).click();
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('button',{name:'Usar imagem 103 na conversa e na Direção'}).waitFor();
  await gallery.getByText('Ver imagens anteriores (0)').click();
  await gallery.getByRole('button',{name:'Carregar anteriores'}).click();
  await gallery.getByRole('button',{name:'Usar imagem 100 na conversa e na Direção'}).click();
  await gallery.getByText('Imagem adicionada à conversa e à Direção neste navegador.').waitFor();
  assert.equal(await gallery.getByRole('button',{name:'Imagem usada 100 na conversa e na Direção'}).isDisabled(),true);
  images.unshift({...item(104),batch_id:'00000000-0000-4000-8000-000000000203'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('button',{name:'Usar imagem 104 na conversa e na Direção'}).waitFor();
  assert.equal(await gallery.getByRole('button',{name:'Imagem usada 100 na conversa e na Direção'}).isDisabled(),true);
  assert.equal(await gallery.getByRole('button',{name:'Carregar anteriores'}).count(),0);
  assert.deepEqual(errors,[]);
});

test('recuperação incerta e reconexão não encobrem o compositor em viewport baixo', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t);
  await page.setViewportSize({width: 390, height: 400});
  await openProject(page, origin);
  await connectOwnOpenAiKey(page, `sk-synthetic-${'x'.repeat(30)}`);
  await page.getByLabel('Sua mensagem', {exact:true}).fill('Quero divulgar uma aula de cerâmica.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.locator('.studio-exploration-recovery').getByRole('status').waitFor();
  await page.getByRole('button',{name:'Gerenciar IA',exact:true}).click();
  await page.getByRole('button',{name:'Remover chave'}).click();
  await page.getByLabel('Chave OpenAI', {exact:true}).waitFor();
  await page.getByRole('button',{name:'Continuar sem IA por enquanto',exact:true}).click();
  await page.locator('.studio-conversation').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  await page.locator('.studio-exploration-recovery').getByRole('status').waitFor();
  const bounds=await page.evaluate(() => {
    const panel=document.querySelector('.studio-conversation').getBoundingClientRect();
    const input=document.querySelector('#studio-chat-message').getBoundingClientRect();
    const send=document.querySelector('form.studio-chat-composer button').getBoundingClientRect();
    return {panel:panel.toJSON(),input:input.toJSON(),send:send.toJSON()};
  });
  assert.ok(bounds.input.top>=bounds.panel.top&&bounds.input.bottom<=bounds.panel.bottom);
  assert.ok(bounds.send.top>=bounds.panel.top&&bounds.send.bottom<=bounds.panel.bottom);
  assert.deepEqual(errors,[]);
});
