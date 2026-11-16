import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie} from './session-cookie.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice=id(1),bob=id(2),project=id(3);
let origin,child,browser;const stopping=new AbortController();
before(async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));origin=`http://127.0.0.1:${port}`;
 let logs='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});
 for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{logs=(logs+value).slice(-6000);});
 await waitForApp({url:origin,child,signal:stopping.signal,diagnostics:()=>logs,timeoutMs:60000});
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true});
});
after(async()=>{stopping.abort();try{await browser?.close();}finally{await stopApp(child);}});


import {finishPreparation,openConversation,closeSettings} from './guided-navigation.mjs';

for(const [width,withReferences] of [[1440,false],[390,false],[1440,true]])test(`preparação por post e menu lateral em ${width}px${withReferences?" com referências globais":""}`,{timeout:90000},async()=>{
 const page=await browser.newPage({viewport:{width,height:950}});
 await page.context().addCookies([sessionCookie(origin)]);const errors=[],calls=[];
 page.on('pageerror',error=>errors.push(error.message));let projects=[];
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;calls.push(path);
  if(path==='/api/projects'){
   if(request.method()==='POST'){projects=[{id:project,title:request.postDataJSON().title,revision:1}];return route.fulfill({json:{project:projects[0]}});}
   return route.fulfill({json:{projects}});
  }
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 const stored=()=>page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result[0]?.state);};};}));
 const button=name=>page.getByRole('button',{name,exact:true});
 const objective=page.getByLabel('Objetivo deste post',{exact:true}),message=page.getByLabel('O que este post deve comunicar?',{exact:true}),action=page.getByLabel('Chamada para ação (opcional)',{exact:true});
 try{
  await page.goto(origin);await page.getByLabel('Nome do projeto',{exact:true}).fill('Mentoria Veloz — Campanha 1');await button('Criar projeto e continuar').click();
  await page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true}).fill('Mentoria de matemática para o ENEM');
  if(withReferences){
   await button('Continuar').click();await button('Continuar para a IA').click();await button('Escolher depois').click();
   await button('Enviar imagem').click();
   const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;return canvas.toDataURL('image/png').split(',')[1];});
   await page.locator('input[type="file"]').setInputFiles({name:'Referencia global.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.getByText('Referencia global.png',{exact:true}).waitFor();
  }
  await finishPreparation(page,{preparePost:false});await button('Criar novo post').waitFor();
  assert.equal(await page.locator('.studio-project-card').count(),0);
  await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const r=q.result.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{q.result.close();resolve(r.result[0]?.state.workflow.view==='posts');};};}));
  const initial=await stored();
  assert.ok(initial.workflow.referencePieceId);assert.equal(initial.drafts.length,1);assert.equal(initial.drafts[0].pieceId,initial.workflow.referencePieceId);assert.equal(initial.projectReferenceIds.length,withReferences?1:0);
  assert.equal(Object.keys(initial.posts).length,0,'a identidade técnica do chat não registra um post da pessoa');
  assert.deepEqual(initial.messages,[]);
  assert.equal(await page.locator('.studio-topbar').getByRole('button',{name:'Posts do projeto',exact:true}).count(),0);
  const nav=page.getByRole('navigation',{name:'Menu do projeto',exact:true});
  assert.equal(await nav.locator('button svg').count(),3);assert.equal(await button('Expandir menu').getAttribute('aria-expanded'),'false');
  await button('Expandir menu').focus();await page.keyboard.press('Enter');assert.equal(await button('Recolher menu').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await button('Expandir menu').getAttribute('aria-expanded'),'false');
  await button('Configurações do projeto').click();await page.getByRole('dialog',{name:'Configurações do projeto',exact:true}).waitFor();await closeSettings(page);if(await button('Recolher menu').isVisible())await button('Recolher menu').click();
  await button('Criar novo post').click();await objective.waitFor();assert.equal(await objective.inputValue(),'');assert.equal(await message.inputValue(),'');
  await page.getByLabel('Nome do post',{exact:true}).fill('Post de autoridade');await objective.fill('Construir autoridade');await message.fill('Ensinar uma estratégia de porcentagem');assert.equal(await action.inputValue(),'');
  if(width===390){await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));const menu=await button('Expandir menu').boundingBox(),header=await page.locator('.studio-topbar').boundingBox();assert.ok(menu.y>=header.y+header.height-1,'menu permanece abaixo do cabeçalho durante a rolagem');await button('Expandir menu').click();await page.keyboard.press('Escape');}
  await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const r=q.result.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{q.result.close();resolve(r.result[0]?.state.workflow.pendingPost?.message==='Ensinar uma estratégia de porcentagem');};};}));
  assert.equal(Object.keys((await stored()).posts).length,0);
  await page.reload();await button('Mentoria Veloz — Campanha 1 Abrir projeto').click();await objective.waitFor();assert.equal(await objective.inputValue(),'Construir autoridade');assert.equal(await action.inputValue(),'');
  await button('Continuar para criação').click();const chat=await openConversation(page);assert.equal(await chat.inputValue(),'');
  await button('Configurações deste post').click();assert.equal(await objective.inputValue(),'Construir autoridade');assert.equal(await message.inputValue(),'Ensinar uma estratégia de porcentagem');await page.keyboard.press('Escape');
  await button('Expandir menu').click();
  if(width===390){await page.locator('#studio-main').click({position:{x:310,y:12}});assert.equal(await button('Expandir menu').getAttribute('aria-expanded'),'false');}
  else await button('Recolher menu').click();
  await button('Posts do projeto').click();await button('Criar novo post').click();await objective.waitFor();assert.equal(await objective.inputValue(),'');assert.equal(await message.inputValue(),'');assert.equal(await action.inputValue(),'');
  await page.getByLabel('Nome do post',{exact:true}).fill('Convite para live');await objective.fill('Inscrições para live gratuita');await action.fill('Inscreva-se pelo link da bio');await button('Continuar para criação').click();await openConversation(page);
  await button('Começar sem IA, no editor').click();
  assert.ok(await page.getByRole('button',{name:'Salvar versão',exact:true}).isEnabled());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal');
  assert.equal(calls.some(path=>path==='/api/studio/chat'||path==='/api/images/generate'),false,'configurar e navegar não gera conteúdo');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
