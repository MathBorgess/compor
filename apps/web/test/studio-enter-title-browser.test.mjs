import {finishPreparation,openSettings,closeSettings,openConversation} from './guided-navigation.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {connectOwnOpenAiKey} from './openai-credentials.mjs';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie} from './session-cookie.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip=!existsSync(browserPath);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const userId=id(1);
const apiKey=`sk-synthetic-${'x'.repeat(30)}`;
let origin,server,browser;
const stopping=new AbortController();

before(async()=>{
 if(skip)return;
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));origin=`http://127.0.0.1:${port}`;
 let startup='';const record=chunk=>{startup=(startup+chunk).slice(-6000);};
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});
 server.stdout.on('data',record);server.stderr.on('data',record);
 await waitForApp({url:origin,child:server,signal:stopping.signal,diagnostics:()=>startup,timeoutMs:60000});
 browser=await chromium.launch({executablePath:browserPath,headless:true});
});
after(async()=>{stopping.abort();try{await browser?.close();}finally{await stopApp(server);}});

async function studio(t,{touch=false,projects=[],createDelay=0,completeExplorations=false,landingIdea='',zoom=1}={}){
 const context=await browser.newContext({viewport:{width:Math.round(1440/zoom),height:Math.round(1000/zoom)},...(zoom===1?{}:{deviceScaleFactor:zoom}),hasTouch:touch});t.after(()=>context.close());
 await context.addCookies([sessionCookie(origin)]);
 const page=await context.newPage();page.setDefaultTimeout(15000);
 if(landingIdea)await page.addInitScript(({userId,idea})=>sessionStorage.setItem(`compor-objective:user:${userId}`,idea),{userId,idea:landingIdea});
 const posts=[],chats=[],actions=[],renames=[],errors=[],external=[],explorations=[],generatedRows=[],flow={chat:()=>({status:'completed',text:'Resposta sintética.'})};
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(url.pathname==='/auth/session')return route.fulfill({json:{state:'connected',userId}});
  if(url.pathname==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(url.pathname==='/api/projects'){
   if(request.method()==='GET')return route.fulfill({json:{projects}});
   const body=request.postDataJSON();
   if(request.method()==='POST'){
    posts.push(body);await new Promise(resolve=>setTimeout(resolve,createDelay));
    const project={id:id(60+posts.length),title:body.title,revision:1};projects.push(project);return route.fulfill({status:201,json:{project}});
   }
   renames.push(body);const index=projects.findIndex(project=>project.id===body.projectId);
   const project={...projects[index],title:body.title,revision:projects[index].revision+1};projects[index]=project;return route.fulfill({json:{status:'renamed',project}});
  }
  if(url.pathname==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(url.pathname==='/api/studio/chat'){const body=request.postDataJSON();if(body.op!=='poll')chats.push(body);return route.fulfill({status:202,json:await flow.chat(body)});}
  if(url.pathname==='/api/studio/action'){const body=request.postDataJSON();actions.push(body);return route.fulfill({status:202,json:await flow.action(body)});}
  if(url.pathname==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:generatedRows.filter(row=>row.project_id===url.searchParams.get('projectId')&&(!url.searchParams.has('beforeOrdinal')||row.ordinal<Number(url.searchParams.get('beforeOrdinal')))),nextBeforeOrdinal:null}});
  if(url.pathname==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')});
  if(url.pathname==='/api/studio/explorations'&&request.method()==='POST'){
   const body=request.postDataJSON();explorations.push(body);
   if(completeExplorations)generatedRows.unshift({id:body.requestId,project_id:body.projectId,state:'completed',created_at:'2026-11-15T12:00:00.000Z',ordinal:generatedRows.filter(row=>row.project_id===body.projectId).length+1,batch_id:body.batch.id,batch_position:body.batch.position});
   return route.fulfill({status:completeExplorations?200:202,json:{status:completeExplorations?'completed':'unknown',requestId:body.requestId}});
  }
  if(url.pathname==='/api/studio/explorations/signals'||url.pathname==='/api/studio/references/signals')return route.fulfill({json:{signals:[]}});
  if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(url.pathname==='/api/image-assets')return route.fulfill({json:{assets:[],nextCursor:null}});
  if(url.pathname==='/api/piece-version-images')return route.fulfill({json:request.method()==='GET'?{assetId:null}:{status:'bound',assetId:request.postDataJSON()?.assetId??null}});
  if(url.pathname.startsWith('/api/'))throw Error(`API inesperada ${url.pathname}`);
  return route.continue();
 });
 await page.goto(origin,{timeout:60000});
 const idea=page.getByLabel('Nome do projeto',{exact:true});await idea.waitFor();
 return {page,idea,posts,chats,actions,renames,flow,errors,external,projects,explorations};
}
async function openChat(page){
 await finishPreparation(page);
 const first=page.getByRole('button',{name:/Abrir post e conversa$/}).first();if(await first.isVisible())await first.click();
 return openConversation(page);
}
async function connectKey(page){
 await finishPreparation(page);await connectOwnOpenAiKey(page,apiKey);await closeSettings(page);return openChat(page);
}

async function prepareFirstPost(page,idea){
 const button=name=>page.getByRole('button',{name,exact:true});
 await idea.fill('Oficina de cerâmica');await button('Criar projeto e continuar').click();
 await page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true}).fill('Oficina de cerâmica aos sábados');
 await button('Continuar').click();
 await page.getByRole('textbox',{name:'Quem você quer alcançar?',exact:true}).fill('Adultos iniciantes');
 await button('Continuar para a IA').click();
 await page.getByText(/o Compor envia o PNG gerado e o prompt à OpenAI com a chave de revisão do Compor/).waitFor();
 await connectOwnOpenAiKey(page,apiKey);await button('Continuar para referências').click();
 await finishPreparation(page,{preparePost:false});
 return button;
}

test('Gerar primeiro post usa o contexto revisado sem uma segunda mensagem',{skip,timeout:90000},async t=>{
 const {page,idea,chats,errors,external}=await studio(t);
 const button=await prepareFirstPost(page,idea);
 const generate=button('Gerar primeiro post');
 await generate.waitFor();assert.equal(await generate.isDisabled(),true);
 await page.getByRole('region',{name:'Vamos preparar o primeiro post'}).getByText(/A imagem pode ser retida antes da entrega/).waitFor();
 assert.equal(await page.getByLabel('Nome do post',{exact:true}).inputValue(),'Oficina de cerâmica');
 const message=page.getByLabel('O que este post deve comunicar?',{exact:true});
 assert.equal(await message.inputValue(),'Oficina de cerâmica aos sábados');
 await message.fill('A oficina de cerâmica aceita pessoas iniciantes');
 await page.getByLabel('Objetivo deste post',{exact:true}).fill('Apresentar a oficina');
 await page.getByLabel('Chamada para ação (opcional)',{exact:true}).fill('Conheça a oficina');
 assert.equal(chats.length,0);
 await generate.click();
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.equal(chats.length,1);
 assert.equal(chats[0].context.brief.audience,'Adultos iniciantes');
 assert.equal(chats[0].context.brief.offer,'Oficina de cerâmica aos sábados');
 assert.deepEqual(chats[0].context.postContext,{objective:'Apresentar a oficina',message:'A oficina de cerâmica aceita pessoas iniciantes',action:'Conheça a oficina'});
 assert.equal(await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).inputValue(),'');
 await page.reload();
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.equal(chats.length,1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('Gerar primeiro post interrompe o envio ao sair durante a gravação do pedido',{skip,timeout:90000},async t=>{
 const {page,idea,chats,errors}=await studio(t);
 const button=await prepareFirstPost(page,idea);
 await page.getByLabel('Objetivo deste post',{exact:true}).fill('Apresentar a oficina');
 await page.evaluate(()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){
   const result=put.apply(this,args);
   if(this.name==='states'&&args[0]?.state?.adjustments.some(turn=>turn.status==='pending')){
    IDBObjectStore.prototype.put=put;
    const deadline=Date.now()+12000;
    const holdTransaction=()=>{
     if(window.releaseFirstPostWrite||Date.now()>deadline)return;
     this.count().onsuccess=holdTransaction;
    };
    window.firstPostWriting=true;
    holdTransaction();
   }
   return result;
  };
 });
 await button('Gerar primeiro post').click();
 await page.waitForFunction(()=>window.firstPostWriting===true);
 await button('Posts do projeto').click();
 await page.evaluate(()=>{window.releaseFirstPostWrite=true;});
 await page.waitForFunction(async()=>{
  const db=await new Promise(resolve=>{const open=indexedDB.open('compor-studio-v1');open.onsuccess=()=>resolve(open.result);});
  const rows=await new Promise(resolve=>{const read=db.transaction('states').objectStore('states').getAll();read.onsuccess=()=>resolve(read.result);});
  db.close();
  return rows.some(row=>row.state.adjustments.some(turn=>turn.status==='failed'));
 });
 assert.equal(chats.length,0);
 await page.getByRole('button',{name:/^Oficina de cerâmica .*Abrir post e conversa$/}).click();
 const composer=await openConversation(page);
 await composer.fill('Gere a arte e a legenda.');
 await composer.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.equal(chats.length,1,'o pedido sem envio não bloqueia o próximo gesto explícito');
 assert.deepEqual(errors,[]);
});

test('Enter envia a ideia e a mensagem uma única vez',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors,external}=await studio(t,{createDelay:1000});
 await idea.fill('Quero divulgar minha oficina de cerâmica para iniciantes aos sábados');await idea.press('Enter');
 await page.getByRole('button',{name:'Criando projeto…',exact:true}).waitFor();await idea.press('Enter');
 const message=await connectKey(page);
 assert.deepEqual(posts,[{title:'Quero divulgar minha oficina de cerâmica para iniciantes aos sábados'}],'o Enter repetido durante a criação não cria outro projeto, e o nome escolhido é preservado integralmente');
 await message.fill('Quero um post para iniciantes');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await message.press('Enter');
 assert.deepEqual(chats.map(chat=>chat.message),['Quero um post para iniciantes'],'o Enter envia a mensagem pelo mesmo caminho do botão, sem repetir com a caixa vazia');
 assert.equal(await message.inputValue(),'');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('Shift+Enter quebra linha sem enviar',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors}=await studio(t);
 await idea.fill('Oficina de cerâmica aos sábados');assert.equal(await idea.getAttribute('type'),'text');assert.equal(posts.length,0);
 await idea.press('Enter');const message=await connectKey(page);assert.equal(posts.length,1);
 await message.fill('Primeira linha');await message.press('Shift+Enter');await message.pressSequentially('Segunda linha');
 assert.equal(await message.inputValue(),'Primeira linha\nSegunda linha');assert.equal(chats.length,0);
 await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.message),['Primeira linha\nSegunda linha']);assert.deepEqual(errors,[]);
});

test('Enter que confirma um acento ou candidato da composição não envia',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors}=await studio(t);
 const composing=[{key:'Enter',code:'Enter',isComposing:true},{key:'Enter',code:'Enter',keyCode:229}];
 await idea.fill('Oficina de cerâmica');
 for(const init of composing){await idea.dispatchEvent('keydown',init);assert.equal(await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).isEnabled(),true,JSON.stringify(init));}
 assert.equal(posts.length,0);
 await idea.press('Enter');const message=await connectKey(page);assert.equal(posts.length,1,'o mesmo evento fora da composição envia');
 await message.fill('Café');
 for(const init of composing){await message.dispatchEvent('keydown',init);assert.equal(await message.isEnabled(),true,JSON.stringify(init));assert.equal(await message.inputValue(),'Café');}
 await message.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:13});await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.message),['Café']);assert.deepEqual(errors,[]);
});

test('em tela de toque o Enter quebra linha e o botão envia',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors}=await studio(t,{touch:true});
 assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);
 await idea.fill('Oficina de cerâmica');assert.equal(await idea.getAttribute('type'),'text');assert.equal(posts.length,0);
 await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();const message=await connectKey(page);assert.equal(posts.length,1);
 await message.fill('Primeira linha');await message.press('Enter');await message.pressSequentially('Segunda linha');
 assert.equal(await message.inputValue(),'Primeira linha\nSegunda linha');assert.equal(chats.length,0);
 await page.getByRole('button',{name:/^(Criar post|Enviar →)$/,exact:true}).click();await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.message),['Primeira linha\nSegunda linha']);assert.deepEqual(errors,[]);
});

const longIdea='Quero divulgar minha oficina de cerâmica para iniciantes aos sábados';
const projectHeading=(page,name)=>page.getByRole('heading',{level:1,...(name?{name,exact:true}:{})});
const renameProject=page=>page.getByRole('navigation',{name:'Menu do projeto',exact:true}).getByRole('button',{name:/^Renomear projeto /});

test('o nome escolhido não é provisório e continua podendo ser renomeado',{skip,timeout:90000},async t=>{
 const {page,idea,chats,renames,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');
 const message=await connectKey(page);assert.equal(await message.inputValue(),'');
 await message.fill('Meu primeiro post sobre a oficina');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await renameProject(page).click();await page.getByLabel('Renomear',{exact:true}).fill('Cerâmica aos sábados');await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
 await projectHeading(page,'Cerâmica aos sábados').waitFor();
 await message.fill('Quero um tom acolhedor');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).nth(1).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false,false],'depois da renomeação pela pessoa o agente não propõe outro título');
 assert.deepEqual(renames.map(rename=>rename.title),['Cerâmica aos sábados']);assert.deepEqual(errors,[]);
});

test('o agente propõe um título curto e a pessoa vê o nome antes de confirmar',{skip,timeout:90000},async t=>{
 const {page,idea,chats,actions,renames,flow,errors,projects}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');
 const message=await connectKey(page);await message.fill('Descreva o primeiro post');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 flow.chat=body=>({status:'action_required',action:{name:'compor_renomear_projeto',args:{projectId:projects[0].id,requestId:id(91),revision:body.context.revision,title:'Cerâmica aos sábados'}},actionBinding:'rename-binding'});
 flow.action=()=>({status:'completed',text:'Título atualizado.'});
 await message.fill('Para iniciantes');await message.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Confirmar alteração no projeto?',exact:true});
 await dialog.getByText('O projeto passa a se chamar “Cerâmica aos sábados”.',{exact:true}).waitFor();assert.equal(renames.length,0);
 await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();await page.getByText('Título atualizado.',{exact:true}).waitFor();
 await projectHeading(page,'Cerâmica aos sábados').waitFor();
 assert.deepEqual(renames.map(rename=>rename.title),['Cerâmica aos sábados']);assert.deepEqual(actions.map(action=>[action.actionBinding,action.result.status]),[['rename-binding','completed']]);
 flow.chat=()=>({status:'completed',text:'Seguimos.'});
 await message.fill('Agora a legenda');await message.press('Enter');await page.getByText('Seguimos.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false,false,false]);assert.deepEqual(errors,[]);
});

test('editar a primeira mensagem preserva a proposta e recusá-la persiste depois de recarregar',{skip,timeout:90000},async t=>{
 const {page,idea,chats,renames,actions,projects,flow,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');
 let message=await connectKey(page);await message.fill('Reescrevi a ideia: uma oficina para iniciantes.');await message.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.equal(chats[0].context.projectTitleProvisional,false,'o nome explícito não se torna provisório ao escrever um post');
 flow.chat=body=>({status:'action_required',action:{name:'compor_renomear_projeto',args:{projectId:projects[0].id,requestId:id(92),revision:body.context.revision,title:'Cerâmica aos sábados'}},actionBinding:'declined-rename-binding'});
 flow.action=()=>({status:'completed',text:'Nome mantido.'});
 await message.fill('Vamos continuar');await message.press('Enter');
 await page.getByRole('dialog',{name:'Confirmar alteração no projeto?',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByText('Nome mantido.',{exact:true}).waitFor();
 assert.deepEqual(actions.map(action=>action.result.status),['declined']);assert.equal(renames.length,0);
 flow.chat=()=>({status:'completed',text:'Continuamos sem sugerir outro nome.'});
 await page.goto(new URL('/',page.url()).href);await page.locator('.studio-project-card').filter({hasText:projects[0].title}).click();
 message=await connectKey(page);await message.fill('Agora a legenda');await message.press('Enter');
 await page.getByText('Continuamos sem sugerir outro nome.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false,false,false]);assert.deepEqual(errors,[]);
});

test('confirmar o mesmo nome no menu preserva a escolha da pessoa',{skip,timeout:90000},async t=>{
 const {page,idea,chats,projects,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');const message=await connectKey(page);
 await renameProject(page).click();await page.getByLabel('Renomear',{exact:true}).fill(projects[0].title);
 await page.getByRole('button',{name:'Salvar nome',exact:true}).click();await page.getByLabel('Renomear',{exact:true}).waitFor({state:'hidden'});
 await message.fill('Seguimos com este nome');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false]);assert.deepEqual(errors,[]);
});

test('uma revisão remota de nome impede outra proposta mesmo com texto igual',{skip,timeout:90000},async t=>{
 const {page,idea,chats,projects,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');let message=await connectKey(page);
 await message.fill('Descreva o primeiro post');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 projects[0]={...projects[0],revision:2};
 await page.goto(new URL('/',page.url()).href);await page.locator('.studio-project-card').filter({hasText:projects[0].title}).click();
 message=await connectKey(page);await message.fill('Continue a campanha');await message.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).nth(1).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false,false]);assert.deepEqual(errors,[]);
});

test('cards e menu cortam o título com reticências e o trilho mantém o nome completo acessível',{skip,timeout:90000},async t=>{
 const title='Oficina de cerâmica para iniciantes aos sábados de manhã no ateliê do bairro, com vagas limitadas, material incluso e café no intervalo';
 const {page,errors}=await studio(t,{projects:[{id:id(70),title,revision:1},{id:id(71),title:'Café',revision:1}]});
 const cut=locator=>locator.evaluate(element=>{const style=getComputedStyle(element);return {ellipsis:style.textOverflow,wrap:style.whiteSpace,clipped:element.scrollWidth>element.clientWidth,text:element.textContent};});
 const shown={ellipsis:'ellipsis',wrap:'nowrap',clipped:true,text:title};
 const card=page.getByRole('button',{name:`${title} Abrir projeto`,exact:true});
 assert.equal(await card.getAttribute('title'),title);assert.deepEqual(await cut(card.locator('strong')),shown,'card');
 await card.click();
 await projectHeading(page,title).waitFor();
 assert.equal(await page.locator('.studio-topbar').getByRole('button',{name:title,exact:true}).count(),0,'o nome longo fica fora das ações do cabeçalho');
 const railEntry=page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:title,exact:true});
 assert.equal(await railEntry.getAttribute('title'),title);assert.equal(await railEntry.getAttribute('aria-current'),'page');assert.equal(await railEntry.innerText(),'OC');
 await page.getByRole('button',{name:'Expandir menu',exact:true}).click();
 const entry=renameProject(page);
 assert.equal(await entry.getAttribute('aria-label'),`Renomear projeto ${title}`);assert.deepEqual(await cut(entry.locator('strong')),shown,'menu do projeto');
 assert.ok((await page.locator('.studio-navigation-shell').boundingBox()).width<=296,'o menu mantém uma largura limitada com título longo');
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Expandir menu',exact:true}).click();
 assert.deepEqual(await cut(entry.locator('strong')),shown,'menu do projeto no celular');
 assert.equal(await railEntry.getAttribute('title'),title);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'o título longo não cria rolagem horizontal');
 assert.deepEqual(errors,[]);
});

test('ideias de dois projetos da mesma conta sobrevivem reload e orientam chat e primeiros lotes separados',{skip,timeout:90000},async t=>{
 const firstIdea='Oficina de cerâmica',secondIdea='Aula de gravura';
 const {page,idea,projects,chats,explorations,errors}=await studio(t,{completeExplorations:true,landingIdea:'Uma ideia antiga da entrada'});
 await idea.fill(firstIdea);await idea.press('Enter');await projectHeading(page,firstIdea).waitFor();await page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true}).fill(firstIdea);
 await page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:'Novo projeto',exact:true}).click();
 await page.getByLabel('Nome do projeto',{exact:true}).fill(secondIdea);await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();await projectHeading(page,secondIdea).waitFor();await page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true}).fill(secondIdea);
 await page.goto(new URL('/',page.url()).href);await page.locator('.studio-project-card').filter({hasText:secondIdea}).click();
 let message=await connectKey(page);assert.equal(await message.inputValue(),'');
 assert.equal(explorations.length,0,'conectar a chave não inicia exploração');
 await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await page.getByRole('timer',{name:/Próximo lote em/}).waitFor();
 assert.equal(explorations.length,3);assert.ok(explorations.every(call=>call.projectId===projects[1].id&&call.prompt.includes(secondIdea)&&!call.prompt.includes(firstIdea)&&!call.prompt.includes('Uma ideia antiga da entrada')));
 await closeSettings(page);await message.fill('Post sobre gravura');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:firstIdea,exact:true}).click();
 await projectHeading(page,firstIdea).waitFor();
 message=await connectKey(page);assert.equal(await message.inputValue(),'');
 await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await page.getByRole('timer',{name:/Próximo lote em/}).waitFor();
 const firstBatch=explorations.filter(call=>call.projectId===projects[0].id);assert.equal(firstBatch.length,3);assert.ok(firstBatch.every(call=>call.prompt.includes(firstIdea)&&!call.prompt.includes(secondIdea)));
 await closeSettings(page);await message.fill('Post sobre cerâmica');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(call=>[call.projectId,call.message]),[[projects[1].id,'Post sobre gravura'],[projects[0].id,'Post sobre cerâmica']]);
 assert.deepEqual(errors,[]);
});

async function readNameTooltip(control){
 return control.evaluate(element=>{
  const tip=element.parentElement?.querySelector(':scope > .studio-name-tooltip');
  if(!tip)return {missing:true};
  const style=getComputedStyle(tip),box=tip.getBoundingClientRect(),view=document.documentElement;
  return {
   text:tip.textContent,open:tip.matches(':popover-open'),role:tip.getAttribute('role'),fontSize:parseFloat(style.fontSize),
   clipped:tip.scrollWidth>tip.clientWidth+1||tip.scrollHeight>tip.clientHeight+1,
   visible:box.width>8&&box.height>8&&style.visibility!=='hidden'&&Number(style.opacity)!==0,
   inside:box.top>=-1&&box.left>=-1&&box.bottom<=view.clientHeight+1&&box.right<=view.clientWidth+1,
  };
 });
}
async function assertTooltipOpen(control,title,{focus=true}={}){
 const tip=await readNameTooltip(control);
 assert.equal(tip.text,title);
 assert.equal(tip.role,'tooltip');
 assert.equal(tip.open,true);
 assert.equal(tip.visible,true,'o nome completo precisa estar visível, não só no atributo title');
 assert.equal(tip.clipped,false,JSON.stringify(tip));
 assert.equal(tip.inside,true,JSON.stringify(tip));
 assert.ok(tip.fontSize>=14,JSON.stringify(tip));
 if(focus)assert.equal(await control.evaluate(element=>element===document.activeElement),true,'o foco permanece no controle do nome');
}
async function assertFullNameOnFocus(control,title){
 const closed=await readNameTooltip(control);
 assert.notEqual(closed.missing,true);
 assert.equal(closed.open,false);
 assert.equal(closed.visible,false,'antes do foco o nome não aparece só porque existe um title de hover');
 await control.scrollIntoViewIfNeeded();
 await control.focus();
 await assertTooltipOpen(control,title);
 await control.evaluate(element=>element.blur());
 const hidden=await readNameTooltip(control);
 assert.equal(hidden.open,false);
 assert.equal(hidden.visible,false);
}
async function assertZoomLayout(page){
 const problems=await page.evaluate(()=>{
  const view=document.documentElement,found=[];
  if(view.scrollWidth>view.clientWidth+1)found.push(`rolagem horizontal ${view.scrollWidth}>${view.clientWidth}`);
  const root=document.querySelector('.compor-studio');
  for(const el of root?.querySelectorAll('button, a, input, textarea, select')??[]){
   if(!(el instanceof HTMLElement)||el.closest('[hidden]')||el.closest('details:not([open])'))continue;
   const style=getComputedStyle(el);
   if(style.display==='none'||style.visibility==='hidden'||(el.checkVisibility&&!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})))continue;
   const box=el.getBoundingClientRect();
   if(box.width<8||box.height<8)continue;
   const labelled=el.getAttribute('aria-labelledby');
   const labelledText=labelled?labelled.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim():'';
   const named=el.getAttribute('aria-label')||labelledText||el.innerText.trim()||el.getAttribute('title')||(el.labels?[...el.labels].map(label=>label.textContent||'').join('').trim():'')||'';
   if(!named&&box.top<view.clientHeight&&box.bottom>0&&box.left<view.clientWidth&&box.right>0)found.push(`sem nome ${el.tagName}.${String(el.className).split(' ')[0]} ${el.outerHTML.slice(0,140)}`);
   if((box.left>=view.clientWidth||box.right<=0)&&style.position==='fixed')found.push(`fixo fora da largura ${el.tagName}.${String(el.className).split(' ')[0]}`);
  }
  return found;
 });
 assert.deepEqual(problems,[]);
}
async function longPress(locator){
 await locator.evaluate(element=>{
  const rect=element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:1,isPrimary:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,button:0,buttons:1}));
  element.focus();
 });
 await locator.page().waitForTimeout(560);
}
async function endPress(locator){
 await locator.evaluate(element=>{
  const rect=element.getBoundingClientRect();
  element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:1,isPrimary:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,button:0,buttons:0}));
  element.click();
 });
}
async function assertTopName(page,title){
 const name=page.locator('.studio-topbar h1');
 assert.equal(await name.textContent(),title);
 const shown=await name.evaluate(element=>{
  const style=getComputedStyle(element),box=element.getBoundingClientRect();
  return {ellipsis:style.textOverflow,wrap:style.whiteSpace,clipped:element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1,visible:box.width>8&&box.height>8&&style.visibility!=='hidden'&&Number(style.opacity)!==0};
 });
 assert.notEqual(shown.ellipsis,'ellipsis');
 assert.equal(shown.wrap,'normal');
 assert.equal(shown.clipped,false,JSON.stringify(shown));
 assert.equal(shown.visible,true,'o nome completo do projeto aberto fica visível na barra do topo');
}
async function assertOnScreen(locator,label){
 await locator.scrollIntoViewIfNeeded();
 const box=await locator.boundingBox();
 const view=await locator.page().evaluate(()=>({w:innerWidth,h:innerHeight}));
 assert.ok(box&&box.width>=24&&box.height>=24&&box.x<view.w&&box.x+box.width>0&&box.y<view.h&&box.y+box.height>0,`${label} ${JSON.stringify({box,view})}`);
}

test('zoom de 200% mantém o Enter, o título legível e o layout',{skip,timeout:90000},async t=>{
 const title=longIdea;
 const {page,idea,posts,chats,errors,external}=await studio(t,{zoom:2,createDelay:800});
 assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio]),[720,500,2]);
 await assertOnScreen(idea,'nome do projeto');
 await idea.fill(title);await idea.press('Enter');
 await page.getByRole('button',{name:'Criando projeto…',exact:true}).waitFor();await idea.press('Enter');
 await projectHeading(page,title).waitFor();
 assert.deepEqual(posts,[{title}],'o Enter no zoom cria o projeto uma vez e preserva o título inteiro');
 await assertZoomLayout(page);
 const rail=page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:title,exact:true});
 await assertOnScreen(rail,'projeto no trilho');
 await assertFullNameOnFocus(rail,title);
 const message=await connectKey(page);
 const projectName=renameProject(page);
 assert.equal(await projectName.locator('strong').textContent(),title,'o zoom não corta o título armazenado');
 await assertFullNameOnFocus(projectName,title);
 await assertOnScreen(message,'mensagem');
 await message.fill('Mensagem com zoom');await message.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await message.press('Enter');
 assert.deepEqual(chats.map(chat=>chat.message),['Mensagem com zoom'],'o Enter no zoom envia uma vez pelo mesmo caminho do botão');
 const send=page.getByRole('button',{name:'Enviar →',exact:true});
 await assertOnScreen(send,'enviar');
 await assertZoomLayout(page);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('zoom de 400% mantém o título inteiro, legível e sem quebra de layout',{skip,timeout:90000},async t=>{
 const title=longIdea;
 const {page,idea,posts,errors,external}=await studio(t,{zoom:4});
 assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio]),[360,250,4]);
 await assertOnScreen(idea,'nome do projeto');
 await idea.fill(title);await idea.press('Enter');
 await projectHeading(page,title).waitFor();
 assert.deepEqual(posts,[{title}]);
 await assertZoomLayout(page);
 const rail=page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:title,exact:true});
 await assertFullNameOnFocus(rail,title);
 assert.equal(await rail.getAttribute('aria-label'),title);
 const message=await connectKey(page);
 const projectName=renameProject(page);
 assert.equal(await projectName.locator('strong').textContent(),title,'o zoom de 400% não corta o título armazenado');
 await assertFullNameOnFocus(projectName,title);
 await assertOnScreen(message,'mensagem');
 const send=page.getByRole('button',{name:/^(Criar post|Enviar →)$/,exact:true});
 await assertOnScreen(send,'enviar');
 await assertZoomLayout(page);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('renomear o projeto não dispara geração de imagem nem nova versão',{skip,timeout:90000},async t=>{
 const {page,idea,renames,actions,explorations,chats,errors}=await studio(t);
 const mutations=[];
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.origin!==origin||request.method()==='GET'||request.method()==='HEAD')return;
  mutations.push(`${request.method()} ${url.pathname}`);
 });
 await idea.fill(longIdea);await idea.press('Enter');
 await connectKey(page);
 const before=mutations.length;
 assert.equal(explorations.length,0);assert.equal(actions.length,0);assert.equal(chats.length,0);
 await renameProject(page).click();
 await page.getByLabel('Renomear',{exact:true}).fill('Cerâmica aos sábados');
 await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
 await projectHeading(page,'Cerâmica aos sábados').waitFor();
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,300)));
 const added=mutations.slice(before);
 assert.deepEqual(added,['PATCH /api/projects'],'renomear só atualiza o projeto; /api/agent/image e /api/studio/chat ficam de fora');
 assert.deepEqual(renames.map(rename=>rename.title),['Cerâmica aos sábados']);
 assert.equal(actions.length,0);assert.equal(explorations.length,0);assert.equal(chats.length,0);
 assert.deepEqual(errors,[]);
});

test('o nome completo truncado fica acessível no foco do teclado e no toque',{skip,timeout:90000},async t=>{
 const title='Oficina de cerâmica para iniciantes aos sábados de manhã no ateliê do bairro, com vagas limitadas, material incluso e café no intervalo';
 const {page,errors}=await studio(t,{touch:true,projects:[{id:id(71),title:'Café',revision:1,created_at:'2026-11-01T00:00:00.000Z'},{id:id(70),title,revision:1,created_at:'2026-11-02T00:00:00.000Z'}]});
 const card=page.getByRole('button',{name:`${title} Abrir projeto`,exact:true});
 const resume=page.getByRole('heading',{level:2,name:title,exact:true});
 const cut=locator=>locator.evaluate((element,expected)=>{const style=getComputedStyle(element);return style.textOverflow==='ellipsis'&&style.whiteSpace==='nowrap'&&element.scrollWidth>element.clientWidth&&element.textContent===expected;},title);
 assert.equal(await card.getAttribute('title'),title);
 const cardTitle=card.locator('strong');
 assert.equal(await cardTitle.evaluate(element=>element.textContent),title);
 assert.equal(await cardTitle.evaluate(element=>{const style=getComputedStyle(element);return style.whiteSpace!=='nowrap'&&element.scrollWidth<=element.clientWidth+1&&element.scrollHeight<=element.clientHeight+1;}),true,'no toque o card mostra o nome inteiro antes de navegar');
 assert.equal(await resume.getAttribute('tabindex'),null);
 assert.equal(await resume.evaluate(element=>element.tabIndex),-1);
 await page.locator('.studio-brand').focus();
 for(let step=0;step<20;step++){
  assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'resume-title','Tab não para no título do resumo');
  await page.keyboard.press('Tab');
 }
 assert.notEqual(await page.evaluate(()=>document.activeElement?.id),'resume-title','Tab não para no título do resumo');
 await resume.tap();
 await assertTooltipOpen(resume,title,{focus:false});
 await page.locator('.studio-starter').tap();
 const afterOutside=await readNameTooltip(resume);
 assert.equal(afterOutside.open,false,'toque fora fecha o tooltip');
 assert.equal(afterOutside.visible,false,'toque fora fecha o tooltip');
 assert.equal(await page.getByRole('button',{name:'Continuar projeto',exact:true}).isVisible(),true,'o toque no nome truncado não troca de tela');
 await card.tap();
 await projectHeading(page,title).waitFor();
 const rail=page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:title,exact:true});
 await rail.tap();
 assert.equal((await readNameTooltip(rail)).open,false,'um toque curto no trilho não abre o tooltip');
 assert.equal(await rail.getAttribute('aria-current'),'page');
 assert.equal(await rail.innerText(),'OC');
 await longPress(rail);
 await assertTooltipOpen(rail,title);
 await endPress(rail);
 assert.equal(await rail.getAttribute('aria-current'),'page','o toque longo não troca o projeto aberto');
 await page.keyboard.press('Escape');
 assert.equal((await readNameTooltip(rail)).open,false,'Escape fecha o tooltip do trilho');
 await page.getByRole('button',{name:'Expandir menu',exact:true}).click();
 const entry=renameProject(page);
 assert.equal(await entry.getAttribute('aria-label'),`Renomear projeto ${title}`);
 assert.equal(await cut(entry.locator('strong')),true);
 await assertFullNameOnFocus(entry,title);
 await entry.focus();
 await entry.click();
 await page.getByLabel('Renomear',{exact:true}).waitFor();
 assert.equal(await page.locator('.studio-name-tooltip:popover-open').count(),0,'o tooltip fecha quando o botão do nome dá lugar ao formulário');
 await page.keyboard.press('Escape');
 await entry.waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Expandir menu',exact:true}).click();
 assert.equal(await cut(entry.locator('strong')),true,'o celular continua cortando só a apresentação');
 await assertFullNameOnFocus(entry,title);
 await page.getByRole('button',{name:'Recolher menu',exact:true}).click();
 await assertTopName(page,title);
 await longPress(rail);
 await assertTooltipOpen(rail,title);
 await page.keyboard.press('Escape');
 const railClosed=await readNameTooltip(rail);
 assert.equal(railClosed.open,false,'Escape fecha o tooltip do trilho');
 assert.equal(railClosed.visible,false,'Escape fecha o tooltip do trilho');
 assert.equal(await rail.evaluate(element=>element===document.activeElement),true,'Escape não move o foco do trilho');
 await endPress(rail);
 const other=page.getByRole('navigation',{name:'Projetos',exact:true}).getByRole('button',{name:'Café',exact:true});
 await longPress(other);
 await assertTooltipOpen(other,'Café');
 assert.equal(await rail.getAttribute('aria-current'),'page','toque longo num projeto que não está aberto só mostra o nome');
 assert.equal(await page.locator('.studio-topbar h1').textContent(),title);
 await endPress(other);
 assert.equal(await rail.getAttribute('aria-current'),'page','o clique depois do toque longo não troca de projeto');
 await page.keyboard.press('Escape');
 assert.equal((await readNameTooltip(other)).open,false,'Escape fecha o tooltip do outro projeto');
 await other.tap();
 await projectHeading(page,'Café').waitFor();
 assert.equal((await readNameTooltip(other)).open,false,'um toque troca de projeto sem abrir o tooltip');
 await assertTopName(page,'Café');
 await longPress(other);
 await assertTooltipOpen(other,'Café');
 await page.locator('#studio-main').tap();
 assert.equal((await readNameTooltip(other)).open,false,'toque fora fecha o tooltip do trilho');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
 assert.deepEqual(errors,[]);
});

test('no celular o botão de enviar tem alvo de toque de pelo menos 44 px',{skip,timeout:90000},async t=>{
 const {page,idea,errors}=await studio(t,{touch:true});
 await page.setViewportSize({width:390,height:844});
 await idea.fill('Oficina de cerâmica');
 await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();
 const message=await connectKey(page);
 await message.fill('Primeira mensagem no celular');
 await page.getByRole('button',{name:/^(Criar post|Enviar →)$/,exact:true}).click();
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await message.fill('Segunda mensagem');
 const send=page.locator('.guided-conversation:not([hidden])').getByRole('button',{name:'Enviar →',exact:true});
 await send.scrollIntoViewIfNeeded();
 const box=await send.boundingBox();
 assert.ok(box&&box.width>=44&&box.height>=44,`alvo de envio ${JSON.stringify(box)}`);
 assert.deepEqual(errors,[]);
});


test('posts isolam conversa e compositor, preservam contexto compartilhado e retomam após reload',{skip,timeout:90000},async t=>{
 const {page,idea,chats,errors,explorations,projects}=await studio(t);
 await idea.fill('Um projeto de cerâmica');await idea.press('Enter');
 let field=await connectKey(page);assert.equal(await field.inputValue(),'');assert.equal(chats.length,0);assert.equal(explorations.length,0);
 await field.fill('Primeiro post, sobre a oficina');await field.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 const first=chats[0].conversationId;assert.equal(first,chats[0].context.pieceId);
 await field.fill('Rascunho privado do post um');
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:'Criar novo post',exact:true}).click();
 await page.getByLabel('Nome do post',{exact:true}).fill('Materiais da oficina');
 field=await openConversation(page);assert.equal(await field.inputValue(),'');assert.equal(await page.locator('.guided-conversation:not([hidden])').getByText('Primeiro post, sobre a oficina',{exact:true}).count(),0);
 await field.fill('Segundo post, sobre materiais');await field.press('Enter');await page.locator('.guided-conversation:not([hidden])').getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.notEqual(chats[1].conversationId,first);assert.equal(chats[1].context.brief.offer,chats[0].context.brief.offer);
 assert.ok(chats[1].history.every(message=>!message.text.includes('Primeiro post')));
 const second=chats[1].conversationId;
 const draftKey=`compor-message-draft:v1:${userId}:${projects[0].id}:${second}`;
 const storedDraft=()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey);
 await field.fill('Rascunho privado do post dois');
 assert.equal(await storedDraft(),'Rascunho privado do post dois');
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:/^Um projeto de cerâmica .*Abrir post e conversa$/}).click();
 field=await openConversation(page);assert.equal(await field.getAttribute('id'),`studio-chat-message-${first}`);assert.equal(await field.inputValue(),'Rascunho privado do post um');
 await page.goto(new URL('/',page.url()).href);await page.getByRole('button',{name:projects[0].title+' Abrir projeto',exact:true}).click();await finishPreparation(page);
 field=await openConversation(page);assert.equal(await field.getAttribute('id'),`studio-chat-message-${first}`);assert.equal(await field.inputValue(),'Rascunho privado do post um');
 // Observe the first visible value in this conversation, before a subsequent effect could replace it.
 await page.evaluate(id=>{
  window.firstVisibleConversationDraft=new Promise(resolve=>{
   const observer=new MutationObserver(()=>{
    const field=document.getElementById(id);
    if(field?.getClientRects().length){observer.disconnect();resolve(field.value);}
   });
   observer.observe(document.body,{subtree:true,childList:true,attributes:true});
  });
 },`studio-chat-message-${second}`);
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:/^Materiais da oficina .*Abrir post e conversa$/}).click();
 assert.equal(await storedDraft(),'Rascunho privado do post dois');
 field=await openConversation(page);assert.equal(await field.getAttribute('id'),`studio-chat-message-${second}`);assert.equal(await page.evaluate(()=>window.firstVisibleConversationDraft),'Rascunho privado do post dois');assert.equal(await field.inputValue(),'Rascunho privado do post dois');
 assert.equal(await page.locator('.guided-conversation:not([hidden])').getByText('Primeiro post, sobre a oficina',{exact:true}).count(),0);assert.deepEqual(errors,[]);
});


test('recarregar retoma a pergunta e preserva inclusive uma resposta apagada',{skip,timeout:90000},async t=>{
 const {page,idea,projects,posts,chats,explorations,errors}=await studio(t);
 await idea.fill('Contexto de uma oficina');await idea.press('Enter');
 const offer=page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true});await offer.fill('Uma oferta em edição');
 async function reopen(){await page.goto(new URL('/',page.url()).href);await page.getByRole('button',{name:projects[0].title+' Abrir projeto',exact:true}).click();}
 await page.getByRole('button',{name:'Continuar',exact:true}).click();const audience=page.getByRole('textbox',{name:'Quem você quer alcançar?',exact:true});await audience.fill('Pessoas iniciantes');
 await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result.some(row=>row.state.workflow.contextStep===1&&row.state.brief.audience==='Pessoas iniciantes'));};};}));
 await reopen();await audience.waitFor();assert.equal(await audience.inputValue(),'Pessoas iniciantes');
 await page.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await offer.inputValue(),'Uma oferta em edição');await offer.fill('');
 await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result.some(row=>row.state.workflow.contextStarted&&row.state.workflow.contextStep===0&&row.state.brief.offer===''));};};}));
 await reopen();await offer.waitFor();assert.equal(await offer.inputValue(),'');assert.equal(posts.length,1);assert.equal(chats.length,0);assert.equal(explorations.length,0);assert.deepEqual(errors,[]);
});
