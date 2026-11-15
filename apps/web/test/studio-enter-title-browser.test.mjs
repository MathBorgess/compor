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

async function studio(t,{touch=false,projects=[],createDelay=0,completeExplorations=false,landingIdea=''}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:touch});t.after(()=>context.close());
 await context.addCookies([sessionCookie(origin)]);
 const page=await context.newPage();page.setDefaultTimeout(15000);
 if(landingIdea)await page.addInitScript(({userId,idea})=>sessionStorage.setItem(`compor-objective:user:${userId}`,idea),{userId,idea:landingIdea});
 const posts=[],chats=[],actions=[],renames=[],errors=[],external=[],explorations=[],flow={chat:()=>({status:'completed',text:'Resposta sintética.'})};
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
  if(url.pathname==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(url.pathname==='/api/studio/explorations'&&request.method()==='POST'){
   const body=request.postDataJSON();explorations.push(body);return route.fulfill({status:completeExplorations?200:202,json:{status:completeExplorations?'completed':'unknown',requestId:body.requestId}});
  }
  if(url.pathname==='/api/studio/explorations/signals'||url.pathname==='/api/studio/references/signals')return route.fulfill({json:{signals:[]}});
  if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(url.pathname==='/api/image-assets')return route.fulfill({json:{assets:[],nextCursor:null}});
  if(url.pathname.startsWith('/api/'))throw Error(`API inesperada ${url.pathname}`);
  return route.continue();
 });
 await page.goto(origin,{timeout:60000});
 const idea=page.getByLabel('Sua ideia',{exact:true});await idea.waitFor();
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

test('Enter envia a ideia e a mensagem uma única vez',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors,external}=await studio(t,{createDelay:1000});
 await idea.fill('Quero divulgar minha oficina de cerâmica para iniciantes aos sábados');await idea.press('Enter');
 await page.getByRole('button',{name:'Criando projeto…',exact:true}).waitFor();await idea.press('Enter');
 const message=await connectKey(page);
 assert.deepEqual(posts,[{title:'Quero divulgar minha oficina de cerâmica para'}],'o Enter repetido durante a criação não cria outro projeto, e o título é o começo da ideia');
 await message.fill('Quero um post para iniciantes');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await message.press('Enter');
 assert.deepEqual(chats.map(chat=>chat.message),['Quero um post para iniciantes'],'o Enter envia a mensagem pelo mesmo caminho do botão, sem repetir com a caixa vazia');
 assert.equal(await message.inputValue(),'');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('Shift+Enter quebra linha sem enviar',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors}=await studio(t);
 await idea.fill('Oficina de cerâmica');await idea.press('Shift+Enter');await idea.pressSequentially('aos sábados');
 assert.equal(await idea.inputValue(),'Oficina de cerâmica\naos sábados');assert.equal(posts.length,0);
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
 await idea.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:13});const message=await connectKey(page);assert.equal(posts.length,1,'o mesmo evento fora da composição envia');
 await message.fill('Café');
 for(const init of composing){await message.dispatchEvent('keydown',init);assert.equal(await message.isEnabled(),true,JSON.stringify(init));assert.equal(await message.inputValue(),'Café');}
 await message.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:13});await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.message),['Café']);assert.deepEqual(errors,[]);
});

test('em tela de toque o Enter quebra linha e o botão envia',{skip,timeout:90000},async t=>{
 const {page,idea,posts,chats,errors}=await studio(t,{touch:true});
 assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);
 await idea.fill('Oficina');await idea.press('Enter');await idea.pressSequentially('de cerâmica');
 assert.equal(await idea.inputValue(),'Oficina\nde cerâmica');assert.equal(posts.length,0);
 await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();const message=await connectKey(page);assert.equal(posts.length,1);
 await message.fill('Primeira linha');await message.press('Enter');await message.pressSequentially('Segunda linha');
 assert.equal(await message.inputValue(),'Primeira linha\nSegunda linha');assert.equal(chats.length,0);
 await page.getByRole('button',{name:/^(Criar post|Enviar →)$/,exact:true}).click();await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.message),['Primeira linha\nSegunda linha']);assert.deepEqual(errors,[]);
});

const longIdea='Quero divulgar minha oficina de cerâmica para iniciantes aos sábados';
const projectTrigger=(page,name)=>page.getByRole('heading',{level:1}).getByRole('button',name?{name,exact:true}:{});

test('o agente sabe que o título é provisório até a pessoa renomear o projeto',{skip,timeout:90000},async t=>{
 const {page,idea,chats,renames,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');
 const message=await connectKey(page);assert.equal(await message.inputValue(),'');
 await message.fill('Meu primeiro post sobre a oficina');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await projectTrigger(page).click();await page.getByLabel('Renomear',{exact:true}).fill('Cerâmica aos sábados');await page.getByRole('button',{name:'Salvar nome',exact:true}).click();
 await projectTrigger(page,'Cerâmica aos sábados').waitFor();
 await message.fill('Quero um tom acolhedor');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).nth(1).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[true,false],'depois da renomeação pela pessoa o agente não propõe outro título');
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
 await projectTrigger(page,'Cerâmica aos sábados').waitFor();
 assert.deepEqual(renames.map(rename=>rename.title),['Cerâmica aos sábados']);assert.deepEqual(actions.map(action=>[action.actionBinding,action.result.status]),[['rename-binding','completed']]);
 flow.chat=()=>({status:'completed',text:'Seguimos.'});
 await message.fill('Agora a legenda');await message.press('Enter');await page.getByText('Seguimos.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[true,true,false]);assert.deepEqual(errors,[]);
});

test('editar a primeira mensagem preserva a proposta e recusá-la persiste depois de recarregar',{skip,timeout:90000},async t=>{
 const {page,idea,chats,renames,actions,projects,flow,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');
 let message=await connectKey(page);await message.fill('Reescrevi a ideia: uma oficina para iniciantes.');await message.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.equal(chats[0].context.projectTitleProvisional,true,'editar a ideia não transforma o título inicial em escolha manual');
 flow.chat=body=>({status:'action_required',action:{name:'compor_renomear_projeto',args:{projectId:projects[0].id,requestId:id(92),revision:body.context.revision,title:'Cerâmica aos sábados'}},actionBinding:'declined-rename-binding'});
 flow.action=()=>({status:'completed',text:'Nome mantido.'});
 await message.fill('Vamos continuar');await message.press('Enter');
 await page.getByRole('dialog',{name:'Confirmar alteração no projeto?',exact:true}).getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByText('Nome mantido.',{exact:true}).waitFor();
 assert.deepEqual(actions.map(action=>action.result.status),['declined']);assert.equal(renames.length,0);
 flow.chat=()=>({status:'completed',text:'Continuamos sem sugerir outro nome.'});
 await page.reload();await page.locator('.studio-project-card').filter({hasText:projects[0].title}).click();
 message=await connectKey(page);await message.fill('Agora a legenda');await message.press('Enter');
 await page.getByText('Continuamos sem sugerir outro nome.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[true,true,false]);assert.deepEqual(errors,[]);
});

test('confirmar no menu o mesmo texto provisório torna o nome uma escolha da pessoa',{skip,timeout:90000},async t=>{
 const {page,idea,chats,projects,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');const message=await connectKey(page);
 await projectTrigger(page).click();await page.getByLabel('Renomear',{exact:true}).fill(projects[0].title);
 await page.getByRole('button',{name:'Salvar nome',exact:true}).click();await page.getByRole('dialog',{name:'Projetos',exact:true}).waitFor({state:'hidden'});
 await message.fill('Seguimos com este nome');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[false]);assert.deepEqual(errors,[]);
});

test('uma revisão remota de nome impede outra proposta mesmo com texto igual',{skip,timeout:90000},async t=>{
 const {page,idea,chats,projects,errors}=await studio(t);
 await idea.fill(longIdea);await idea.press('Enter');let message=await connectKey(page);
 await message.fill('Descreva o primeiro post');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 projects[0]={...projects[0],revision:2};
 await page.reload();await page.locator('.studio-project-card').filter({hasText:projects[0].title}).click();
 message=await connectKey(page);await message.fill('Continue a campanha');await message.press('Enter');
 await page.getByText('Resposta sintética.',{exact:true}).nth(1).waitFor();
 assert.deepEqual(chats.map(chat=>chat.context.projectTitleProvisional),[true,false]);assert.deepEqual(errors,[]);
});

test('barra, cards e menu cortam o título com reticências e mantêm o nome completo acessível',{skip,timeout:90000},async t=>{
 const title='Oficina de cerâmica para iniciantes aos sábados de manhã no ateliê do bairro, com vagas limitadas, material incluso e café no intervalo';
 const {page,errors}=await studio(t,{projects:[{id:id(70),title,revision:1},{id:id(71),title:'Café',revision:1}]});
 const cut=locator=>locator.evaluate(element=>{const style=getComputedStyle(element);return {ellipsis:style.textOverflow,wrap:style.whiteSpace,clipped:element.scrollWidth>element.clientWidth,text:element.textContent};});
 const shown={ellipsis:'ellipsis',wrap:'nowrap',clipped:true,text:title};
 const card=page.getByRole('button',{name:title});
 assert.equal(await card.getAttribute('title'),title);assert.deepEqual(await cut(card.locator('strong')),shown,'card');
 await card.click();
 const trigger=page.getByRole('heading',{level:1}).getByRole('button',{name:title,exact:true});
 assert.equal(await trigger.getAttribute('title'),title);assert.deepEqual(await cut(trigger.locator('.studio-truncate')),shown,'barra superior');
 assert.ok((await trigger.boundingBox()).width<=1440*0.42+1,'o título não empurra as ações da barra');
 await trigger.click();
 const entry=page.getByRole('dialog',{name:'Projetos',exact:true}).getByRole('button',{name:title,exact:true});
 assert.equal(await entry.getAttribute('title'),title);assert.deepEqual(await cut(entry),shown,'menu de projetos');
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});
 assert.deepEqual(await cut(trigger.locator('.studio-truncate')),shown,'barra superior no celular');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'o título longo não cria rolagem horizontal');
 assert.deepEqual(errors,[]);
});

test('ideias de dois projetos da mesma conta sobrevivem reload e orientam chat e primeiros lotes separados',{skip,timeout:90000},async t=>{
 const firstIdea='Oficina de cerâmica',secondIdea='Aula de gravura';
 const {page,idea,projects,chats,explorations,errors}=await studio(t,{completeExplorations:true,landingIdea:'Uma ideia antiga da entrada'});
 await idea.fill(firstIdea);await idea.press('Enter');await projectTrigger(page,firstIdea).waitFor();
 await projectTrigger(page).click();await page.getByRole('dialog',{name:'Projetos',exact:true}).getByRole('button',{name:'Novo projeto',exact:true}).click();
 await page.getByLabel('Sua ideia',{exact:true}).fill(secondIdea);await page.getByRole('button',{name:'Criar projeto e continuar',exact:true}).click();await projectTrigger(page,secondIdea).waitFor();
 await page.reload();await page.locator('.studio-project-card').filter({hasText:secondIdea}).click();
 let message=await connectKey(page);assert.equal(await message.inputValue(),'');
 assert.equal(explorations.length,0,'conectar a chave não inicia exploração');
 await openSettings(page,'Referências');await page.getByRole('button',{name:'Pedir propostas visuais',exact:true}).click();
 await page.getByRole('timer',{name:/Próximo lote em/}).waitFor();
 assert.equal(explorations.length,3);assert.ok(explorations.every(call=>call.projectId===projects[1].id&&call.prompt.includes(secondIdea)&&!call.prompt.includes(firstIdea)&&!call.prompt.includes('Uma ideia antiga da entrada')));
 await closeSettings(page);await message.fill('Post sobre gravura');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 await projectTrigger(page).click();await page.getByRole('dialog',{name:'Projetos',exact:true}).getByRole('button',{name:firstIdea,exact:true}).click();
 message=await connectKey(page);assert.equal(await message.inputValue(),'');
 await openSettings(page,'Referências');await page.getByRole('button',{name:'Pedir propostas visuais',exact:true}).click();
 await page.getByRole('timer',{name:/Próximo lote em/}).waitFor();
 const firstBatch=explorations.filter(call=>call.projectId===projects[0].id);assert.equal(firstBatch.length,3);assert.ok(firstBatch.every(call=>call.prompt.includes(firstIdea)&&!call.prompt.includes(secondIdea)));
 await closeSettings(page);await message.fill('Post sobre cerâmica');await message.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.deepEqual(chats.map(call=>[call.projectId,call.message]),[[projects[1].id,'Post sobre gravura'],[projects[0].id,'Post sobre cerâmica']]);
 assert.deepEqual(errors,[]);
});


test('posts isolam conversa e compositor, preservam contexto compartilhado e retomam após reload',{skip,timeout:90000},async t=>{
 const {page,idea,chats,errors,explorations,projects}=await studio(t);
 await idea.fill('Um projeto de cerâmica');await idea.press('Enter');
 let field=await connectKey(page);assert.equal(await field.inputValue(),'');assert.equal(chats.length,0);assert.equal(explorations.length,0);
 await field.fill('Primeiro post, sobre a oficina');await field.press('Enter');await page.getByText('Resposta sintética.',{exact:true}).waitFor();
 const first=chats[0].conversationId;assert.equal(first,chats[0].context.pieceId);
 await field.fill('Rascunho privado do post um');
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:'Novo post',exact:true}).click();
 field=await openConversation(page);assert.equal(await field.inputValue(),'');assert.equal(await page.locator('.guided-conversation:not([hidden])').getByText('Primeiro post, sobre a oficina',{exact:true}).count(),0);
 await field.fill('Segundo post, sobre materiais');await field.press('Enter');await page.locator('.guided-conversation:not([hidden])').getByText('Resposta sintética.',{exact:true}).waitFor();
 assert.notEqual(chats[1].conversationId,first);assert.equal(chats[1].context.brief.offer,chats[0].context.brief.offer);
 assert.ok(chats[1].history.every(message=>!message.text.includes('Primeiro post')));
 await field.fill('Rascunho privado do post dois');
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:/^Post 1 /}).click();
 field=await openConversation(page);assert.equal(await field.inputValue(),'Rascunho privado do post um');
 await page.reload();await page.getByRole('button',{name:projects[0].title+' Abrir projeto',exact:true}).click();await finishPreparation(page);
 field=await openConversation(page);assert.equal(await field.inputValue(),'Rascunho privado do post um');
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:/^Post 2 /}).click();
 field=await openConversation(page);assert.equal(await field.inputValue(),'Rascunho privado do post dois');
 assert.equal(await page.locator('.guided-conversation:not([hidden])').getByText('Primeiro post, sobre a oficina',{exact:true}).count(),0);assert.deepEqual(errors,[]);
});


test('recarregar retoma a pergunta e preserva inclusive uma resposta apagada',{skip,timeout:90000},async t=>{
 const {page,idea,projects,posts,chats,explorations,errors}=await studio(t);
 await idea.fill('Contexto de uma oficina');await idea.press('Enter');
 const offer=page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true});await offer.fill('Uma oferta em edição');
 async function reopen(){await page.reload();await page.getByRole('button',{name:projects[0].title+' Abrir projeto',exact:true}).click();}
 await page.getByRole('button',{name:'Continuar',exact:true}).click();const audience=page.getByRole('textbox',{name:'Quem você quer alcançar?',exact:true});await audience.fill('Pessoas iniciantes');
 await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result.some(row=>row.state.workflow.contextStep===1&&row.state.brief.audience==='Pessoas iniciantes'));};};}));
 await reopen();await audience.waitFor();assert.equal(await audience.inputValue(),'Pessoas iniciantes');
 await page.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await offer.inputValue(),'Uma oferta em edição');await offer.fill('');
 await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result.some(row=>row.state.workflow.contextStarted&&row.state.workflow.contextStep===0&&row.state.brief.offer===''));};};}));
 await reopen();await offer.waitFor();assert.equal(await offer.inputValue(),'');assert.equal(posts.length,1);assert.equal(chats.length,0);assert.equal(explorations.length,0);assert.deepEqual(errors,[]);
});
