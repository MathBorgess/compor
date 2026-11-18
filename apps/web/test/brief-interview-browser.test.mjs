import {openPostEditor,openSettings,closeSettings,openConversation} from './guided-navigation.mjs';
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

const activeChat=page=>page.locator('.studio-chat-panel:visible');

async function openProject(page,origin){
 await page.goto(origin);await page.getByRole('button',{name:/Direção opcional/}).click();
 await openPostEditor(page);await openSettings(page,'Referências');
}
async function openEditorConversation(page){await closeSettings(page);await openPostEditor(page);await openConversation(page);}
async function connectKey(page,{references=false}={}){
 await connectOwnOpenAiKey(page,`sk-synthetic-${'x'.repeat(30)}`);await closeSettings(page);
 if(references){await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');}else await openConversation(page);
}

test('briefing acontece na conversa e resumo acompanha o que foi registrado', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, external} = await app(t);
  await openProject(page, origin);
  await page.getByRole('region', {name: 'Buscar referências visuais', exact: true}).waitFor();
  await openSettings(page,'Contexto');
  const summary = page.getByRole('region', {name: 'Contexto do projeto', exact: true});
  await summary.getByText('O que vamos divulgar?', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Entrevista do brief', {exact: true}).count(), 0);
  assert.equal(await page.getByText('exploração · esboço ilustrativo', {exact: true}).count(), 0);
  assert.ok(calls.every(call => call.path === '/api/studio/explorations' && !call.body), 'abrir o projeto somente consulta explorações anteriores');
  await connectKey(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Quero divulgar uma aula de cerâmica.');
  await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
  await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?', {exact: true}).waitFor();
  await page.getByRole('button',{name:'Configurações do Post',exact:true}).click();
  try{assert.equal(await page.getByLabel('O que este post deve comunicar?',{exact:true}).inputValue(),'Aula de cerâmica');}catch(error){throw Error(JSON.stringify({dialogs:await page.locator('dialog[open]').allTextContents(),errors}),{cause:error});}
  await page.keyboard.press('Escape');
  await closeSettings(page);assert.equal(await page.getByText('Quero divulgar uma aula de cerâmica.', {exact: true}).count(), 1);
  assert.deepEqual(calls.filter(call => call.path !== '/api/studio/explorations').map(call => call.path), ['/api/studio/chat', '/api/studio/action']);
  await page.reload();
  await page.getByRole('button',{name:'Configurações do projeto',exact:true}).waitFor();
  await openPostEditor(page);await openConversation(page);await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?', {exact: true}).waitFor();
  await page.getByRole('button',{name:'Configurações do Post',exact:true}).click();
  try{assert.equal(await page.getByLabel('O que este post deve comunicar?',{exact:true}).inputValue(),'Aula de cerâmica');}catch(error){throw Error(JSON.stringify({dialogs:await page.locator('dialog[open]').allTextContents(),errors}),{cause:error});}
  await page.keyboard.press('Escape');
  await closeSettings(page);assert.equal(await page.getByRole('button', {name: 'Enviar →', exact: true}).isDisabled(), true, 'a chave não é guardada após recarregar');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

test('conexão e envio ficam acessíveis no celular', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, errors} = await app(t);
  await page.setViewportSize({width: 390, height: 844});
  await openProject(page, origin);
  await openSettings(page,'IA');await page.getByRole('button',{name:/^Usar minha chave Conectar/}).click();
  const input = page.getByLabel('Chave OpenAI', {exact: true});
  assert.equal(await input.isVisible(), true);
  await connectKey(page);
  await closeSettings(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Uma ideia para criar.');
  const send = page.getByRole('button', {name: 'Enviar →', exact: true});
  await send.scrollIntoViewIfNeeded();
  const bounds = await send.boundingBox();
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('form.studio-chat-composer button')).find(element=>element.getClientRects().length>0);
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
  await connectKey(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Mostre a direção.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  const status = page.getByRole('status').filter({hasText:'Compor está trabalhando…'});
  await status.waitFor();
  assert.equal(await status.locator('i').first().evaluate(element=>getComputedStyle(element).animationName),'none');
  release();
  const message=activeChat(page).locator('article[data-role="assistant"]').last();
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
  await connectKey(page,{references:true});await openConversation(page);
  await page.getByText(/Mostrei duas rodadas de propostas/).waitFor();
  await page.getByRole('button',{name:'Gerar mais propostas'}).waitFor();
  assert.equal(calls.filter(call=>call.path==='/api/studio/explorations' && call.body).length,0);
});

test('no editor, histórico rola e o compositor continua acessível com a conversa e a arte em painéis', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors}=await app(t);await page.setViewportSize({width:742,height:720});
 await openProject(page,origin);await openEditorConversation(page);
 const field=await openConversation(page);await field.fill('Rascunho preservado na conexão');
 assert.equal(await activeChat(page).locator('.studio-chat-messages').evaluate(el=>getComputedStyle(el).overflowY),'auto');
 await openSettings(page,'IA');await page.getByRole('button',{name:/^Usar minha chave Conectar/}).click();
 assert.equal(await page.getByLabel('Chave OpenAI',{exact:true}).evaluate(el=>getComputedStyle(el).borderRadius),'10px');
 await page.getByRole('button',{name:'Escolher depois',exact:true}).click();
 assert.equal(await field.inputValue(),'Rascunho preservado na conexão');
 for(const size of [{width:742,height:720},{width:390,height:400}]){
  await page.setViewportSize(size);await field.scrollIntoViewIfNeeded();
  const send=page.getByRole('button',{name:'Enviar →',exact:true});await send.scrollIntoViewIfNeeded();
  const bounds=await send.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=size.height,'envio alcançável sem ficar sob outros painéis');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert.deepEqual(errors,[]);
});

test('no editor, divisão e chat minimizável preservam a área completa em desktop e celular', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors}=await app(t);await openProject(page,origin);await openEditorConversation(page);
 const field=await openConversation(page);await field.fill('Rascunho preservado ao minimizar');
 const separator=page.getByRole('separator',{name:'Divisão entre conversa e post'});
 const desktop=await page.locator('.guided-workspace').boundingBox();
 const desktopMain=await page.locator('.studio-canvas-column').boundingBox();
 assert.ok(Math.abs(desktop.x-desktopMain.x)<=1&&Math.abs(desktop.width-desktopMain.width)<=1&&Math.abs(desktop.height-desktopMain.height)<=1&&desktop.y+desktop.height<=1000,'workspace ocupa a largura e altura úteis do desktop');
 const start=Number(await separator.getAttribute('aria-valuenow'));await separator.focus();await page.keyboard.press('ArrowRight');
 assert.equal(Number(await separator.getAttribute('aria-valuenow')),start+3);
 const grip=await separator.boundingBox();await page.mouse.move(grip.x+6,grip.y+100);await page.mouse.down();await page.mouse.move(grip.x+90,grip.y+100,{steps:4});await page.mouse.up();
 assert.ok(Number(await separator.getAttribute('aria-valuenow'))>start+3);
 await page.getByRole('button',{name:'Minimizar conversa',exact:true}).click();
 assert.equal(await page.getByRole('region',{name:'Conversa do post',exact:true}).isVisible(),false);
 assert.equal(await page.getByRole('region',{name:'Criação do post',exact:true}).isVisible(),true);
 assert.equal(await separator.isVisible(),false);
 await page.waitForFunction(()=>document.activeElement?.classList.contains('guided-chat-launcher'));
 await page.keyboard.press('Enter');assert.equal(await separator.isVisible(),true);
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Conversa do post');
 assert.equal(await field.inputValue(),'Rascunho preservado ao minimizar');
 await page.setViewportSize({width:390,height:844});await openConversation(page);
 assert.equal(await page.getByRole('region',{name:'Conversa do post',exact:true}).isVisible(),true);
 const overlap=await page.evaluate(()=>{const a=document.querySelector('.guided-chat-minimize')?.getBoundingClientRect(),b=document.querySelector('.guided-conversation:not([hidden]) .studio-chat-header h2')?.getBoundingClientRect();return a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
 assert.equal(overlap,false,'controle de minimizar não cobre o título da conversa');
 await page.getByRole('button',{name:'Minimizar conversa',exact:true}).focus();await page.keyboard.press('Enter');
 assert.equal(await page.getByRole('region',{name:'Criação do post',exact:true}).isVisible(),true);
 const bounds=await page.locator('.guided-workspace').boundingBox();
 const mobileMain=await page.locator('.studio-canvas-column').boundingBox();
 assert.ok(Math.abs(bounds.x-mobileMain.x)<=1&&bounds.x+bounds.width<=390&&Math.abs(bounds.width-mobileMain.width)<=1&&Math.abs(bounds.height-mobileMain.height)<=1&&bounds.height>0&&bounds.y+bounds.height<=844,'workspace ocupa a largura e altura úteis do celular sem ultrapassar o viewport: '+JSON.stringify({bounds,mobileMain}));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await openConversation(page);assert.equal(await page.getByRole('region',{name:'Conversa do post',exact:true}).isVisible(),true);
 assert.equal(await field.inputValue(),'Rascunho preservado ao minimizar');
 assert.deepEqual(errors,[]);
});

test('referências usam documento com rolagem natural e conversa sob demanda em viewport baixo', {skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors}=await app(t);await openProject(page,origin);
 for(const height of [500,400]){
  await page.setViewportSize({width:390,height});
  assert.equal(await page.getByRole('dialog',{name:'Configurações do projeto',exact:true}).count(),1,'ADR 0059: referências da aba ficam na janela de configurações');
  assert.equal(await page.locator('.reference-step .studio-chat-panel:visible').count(),0,'a galeria não reserva área para chat');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();
  const composer=page.locator('.reference-workbench-conversation .studio-chat-composer');await composer.scrollIntoViewIfNeeded();
  const bounds=await composer.boundingBox();assert.ok(bounds.width<=390&&bounds.height>=44,'compositor tem dimensão legível e alcançável pela rolagem');
  await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();
 }
 await openSettings(page,'Materiais e versões');const dialog=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});await dialog.waitFor();
 await closeSettings(page);await openPostEditor(page);await page.getByRole('button',{name:'Configurações do Post',exact:true}).click();
 assert.ok((await page.getByRole('dialog',{name:'Configurações do Post',exact:true}).boundingBox()).width<390,'diálogo de post mantém dimensão própria');
 assert.deepEqual(errors,[]);
});

test('consultar explorações mostra resultados confirmados, recusados e incertos sem gerar imagens', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, images} = await app(t);
  images.unshift({id:'00000000-0000-4000-8000-000000000094',project_id:projectId,state:'rejected',created_at:'2026-11-06T12:02:00Z',ordinal:3,batch_id:'00000000-0000-4000-8000-000000000093',batch_position:3});
  await openProject(page, origin);
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  await page.getByRole('button', {name: 'Consultar explorações', exact: true}).click();
  const gallery = page.getByRole('region', {name: 'Explorações de imagem', exact: true});
  await gallery.getByText('Resultado não confirmado.', {exact: true}).waitFor();
  await gallery.getByText('Chave recusada; nenhuma imagem foi gerada.', {exact: true}).waitFor();
  const image = gallery.getByRole('checkbox',{name:'Escolher imagem 1', exact: true});
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
  await connectKey(page);
  const field = activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true});
  for (let index = 0; index < 3; index++) {
    await field.fill(`Outra ideia ${index}`);
    await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
    await page.getByText(`Resposta Outra ideia ${index}`, {exact: false}).waitFor();
  }
  const history = activeChat(page).locator('.studio-chat-messages');
  assert.ok(await history.evaluate(element => element.scrollTop > 0), 'a resposta mais recente entra em vista');
  await history.evaluate(element => { element.scrollTop = 0; });
  await page.waitForFunction(element=>element.scrollTop===0,await history.elementHandle());
  await field.fill('Outra ideia 3');
  await page.getByRole('button', {name: 'Enviar →', exact: true}).click();
  await page.getByRole('status').filter({hasText:'Compor está trabalhando…'}).waitFor();
  assert.ok(await history.evaluate(element => element.scrollTop > 0), 'o processamento mostra a conversa recente');
  await history.hover();
  await page.mouse.wheel(0,-100000);
  await page.waitForFunction(element=>element.scrollTop===0,await history.elementHandle());
  await history.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  release();
  await page.getByText('Resposta Outra ideia 3', {exact: false}).waitFor();
  assert.equal(await history.evaluate(element => element.scrollTop), 0, 'ler o começo não é interrompido');
  assert.deepEqual(errors, []);
});


test('referência escolhida preserva origem e acompanha o próximo turno da conversa', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors} = await app(t, {withReferences:true});
  await openProject(page, origin);
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('search');
  const panel=page.getByRole('region',{name:'Buscar referências visuais'});
  await panel.getByLabel('O que você quer explorar?').fill('tipografia para aula');
  await panel.getByRole('button',{name:'Permitir nesta sessão'}).click();
  await panel.getByRole('button',{name:'Buscar referências',exact:true}).click();
  await panel.getByRole('link',{name:'Ver origem'}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Me interessa'}).count(),0);
  assert.equal(await panel.getByRole('button',{name:'Não combina'}).count(),0);
  await panel.getByRole('checkbox',{name:'Escolher referência: Tipografia'}).click();
  await panel.getByRole('status').waitFor();
  assert.equal(await panel.getByRole('status').textContent(), 'Referência adicionada à conversa e à Direção neste navegador.');
  await connectKey(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Outra ideia: compare essa referência.');
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
  const {page, origin, errors,images} = await app(t, {withReferences:true});
  await page.clock.install();
  const selections=[],generations=[];
  await page.route(url=>url.pathname==='/api/studio/chat',route=>{const body=route.request().postDataJSON();if(body.op!=='reference_selection')return route.fallback();selections.push(body);return route.fulfill({status:202,json:{status:'completed',text:'As referências pedem uma tipografia editorial.\n\n**Recomendação:** Siga pela serifada, porque conversa com quem faz cerâmica.\n\nPosso seguir pela serifada?'}});});
  await page.route(url=>url.pathname==='/api/studio/explorations',route=>{if(route.request().method()!=='POST')return route.fallback();const body=route.request().postDataJSON();generations.push(body);images.unshift({id:body.requestId,project_id:body.projectId,state:'completed',created_at:'2026-11-15T12:00:00.000Z',ordinal:Math.max(0,...images.map(item=>item.ordinal))+1,batch_id:body.batch.id,batch_position:body.batch.position});return route.fulfill({json:{status:'completed',requestId:body.requestId}});});
  await openProject(page, origin);
  await connectKey(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Quero divulgar uma aula de cerâmica.');
  await page.getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?',{exact:true}).waitFor();
  await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('search');
  const panel=page.getByRole('region',{name:'Buscar referências visuais'});
  await panel.getByLabel('O que você quer explorar?').fill('tipografia para aula');
  await panel.getByRole('button',{name:'Permitir nesta sessão'}).click();
  await panel.getByRole('button',{name:'Buscar referências',exact:true}).click();
  await panel.getByRole('checkbox',{name:'Escolher referência: Tipografia'}).click();
  await openConversation(page);const recovery=page.locator('.studio-exploration-recovery');
  try{await recovery.getByText('A exploração aguarda sua resposta no chat.').waitFor({timeout:15000});}catch(error){throw Error(`${error.message}\nFluxo: ${JSON.stringify({generations,selections,errors,text:await page.locator('body').innerText()})}`,{cause:error});}
  await page.getByText('Posso seguir pela serifada?',{exact:true}).waitFor();
  assert.equal(selections.length,1);
  const held=generations.length;assert.ok(held>0,'a exploração já gerava antes da pergunta');
  await page.clock.runFor(17000);
  await recovery.getByText('A exploração aguarda sua resposta no chat.').waitFor();
  assert.equal(generations.length,held,'nenhum lote começa enquanto a pergunta aguarda resposta');
  await recovery.getByRole('button',{name:'Gerar mais propostas'}).click();
  await recovery.waitFor({state:'detached'});await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  await page.getByRole('timer',{name:/Próximo lote em/}).waitFor({timeout:15000});
  assert.deepEqual(errors,[]);
});

test('imagem gerada escolhida mantém origem e segue ao próximo turno', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, calls, errors, selectionSignals} = await app(t);
  await openProject(page, origin);
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  assert.equal(await gallery.getByText('Avaliar esta imagem').count(),0);
  await gallery.getByRole('checkbox',{name:'Escolher imagem 1'}).click();
  await gallery.getByText('Imagem adicionada à conversa e à Direção neste navegador.',{exact:true}).waitFor();
  assert.equal(selectionSignals.length,1);
  assert.match(selectionSignals[0].id,/^[0-9a-f-]{36}$/);
  assert.deepEqual({...selectionSignals[0],id:'id-validado'},{id:'id-validado',projectId,imageId:'00000000-0000-4000-8000-000000000091',action:'selected',comment:'',supersedes:null});
  assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 1'}).isChecked(),true);
  await connectKey(page);
  await activeChat(page).getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Outra ideia: compare esta exploração.');
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
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 3'}).waitFor();
  assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 2'}).count(),0);
  await gallery.getByText('Ver imagens anteriores (2)').click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 2'}).waitFor();
  images.unshift(item(4,second));
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 4'}).waitFor();
  const stable=gallery.locator('figure').filter({has:page.getByRole('checkbox',{name:'Escolher imagem 3'})});
  assert.match(await stable.locator('img').getAttribute('src'),/00000000-0000-4000-8000-000000000103/);
  assert.deepEqual(errors,[]);
});


test('carregar páginas antigas preserva seleção e não altera os ordinais após atualização', {skip: !existsSync(browserPath), timeout: 90000}, async t => {
  const {page, origin, images, paging, errors} = await app(t);
  const item=n=>({id:`00000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,project_id:projectId,state:'completed',created_at:'2026-11-06T12:00:00Z',ordinal:n,batch_id:'00000000-0000-4000-8000-000000000202',batch_position:1});
  images.splice(0,images.length,item(103),item(102),item(101));
  paging.nextBeforeOrdinal=101;paging.older=[{...item(100),batch_id:'00000000-0000-4000-8000-000000000201'},{...item(99),batch_id:'00000000-0000-4000-8000-000000000201'}];
  await openProject(page, origin);
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  const gallery=page.getByRole('region',{name:'Explorações de imagem'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 103'}).waitFor();
  await gallery.getByText('Ver imagens anteriores (0)').click();
  await gallery.getByRole('button',{name:'Carregar anteriores'}).click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 100'}).click();
  await gallery.getByText('Imagem adicionada à conversa e à Direção neste navegador.').waitFor();
  assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 100'}).isChecked(),true);
  images.unshift({...item(104),batch_id:'00000000-0000-4000-8000-000000000203'});
  await gallery.getByRole('button',{name:'Consultar explorações'}).click();
  await gallery.getByRole('checkbox',{name:'Escolher imagem 104'}).waitFor();
  assert.equal(await gallery.getByRole('checkbox',{name:'Escolher imagem 100'}).isChecked(),true);
  assert.equal(await gallery.getByRole('button',{name:'Carregar anteriores'}).count(),0);
  assert.deepEqual(errors,[]);
});

test('recuperação incerta e reconexão preservam compositor em viewport baixo',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const {page,origin,errors}=await app(t);await page.setViewportSize({width:390,height:400});await openProject(page,origin);await connectKey(page);
 const field=await openConversation(page);await field.fill('Quero divulgar uma aula de cerâmica.');await page.getByRole('button',{name:'Enviar →',exact:true}).click();await page.getByText('Uma aula de cerâmica. Para quem você quer divulgá-la?',{exact:true}).waitFor();await field.fill('Meu rascunho continua aqui');
 await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();await openConversation(page);await page.locator('.studio-exploration-recovery').getByRole('status').waitFor();
 await openSettings(page,'IA');await page.getByRole('button',{name:/^Usar minha chave Conectar/}).click();await page.getByRole('button',{name:'Remover chave'}).click();await page.getByRole('button',{name:'Escolher depois',exact:true}).click();
 assert.equal(await field.inputValue(),'Meu rascunho continua aqui');await field.scrollIntoViewIfNeeded();
 const send=page.getByRole('button',{name:'Enviar →',exact:true});await send.scrollIntoViewIfNeeded();const bounds=await send.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=400);assert.deepEqual(errors,[]);
});
