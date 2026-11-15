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



import {openSettings,closeSettings,openPostEditor,openConversation} from './guided-navigation.mjs';
for(const width of [1440,390])test(`configurações usam modal amplo com abas em ${width}px`,{timeout:90000},async()=>{
 const page=await browser.newPage({viewport:{width,height:950}});await page.context().addCookies([sessionCookie(origin)]);
 const errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{const request=route.request(),path=new URL(request.url()).pathname;calls.push({path,method:request.method()});
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Mentoria Veloz — Campanha 1',revision:1}]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 const panel=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
 const sections=()=>panel.getByRole('navigation',{name:'Configurações',exact:true});
 try{
  await page.goto(origin);await button('Mentoria Veloz — Campanha 1 Abrir projeto').click();await openSettings(page);
  assert.equal(await sections().getByRole('button').count(),6);assert.equal(await sections().getByRole('button',{name:'Contexto',exact:true}).getAttribute('aria-pressed'),'true');
  const bounds=await panel.boundingBox();assert.ok(Math.abs(bounds.width-width)<=1&&Math.abs(bounds.height-950)<=1,'modal ocupa o viewport');
  await panel.locator('summary').first().click();await panel.getByLabel('Oferta',{exact:true}).fill('Mentoria de matemática para o ENEM');
  await sections().getByRole('button',{name:'IA',exact:true}).click();await panel.getByRole('heading',{name:'Escolha sua IA',exact:true}).waitFor();
  assert.equal(await panel.getByRole('region',{name:'Contexto do projeto',exact:true}).count(),0);
  await sections().getByRole('button',{name:'Marca e direção',exact:true}).click();await panel.getByRole('heading',{name:'Uma direção com significado',exact:true}).waitFor();
  await sections().getByRole('button',{name:'Referências',exact:true}).click();await panel.getByRole('heading',{name:'Referências do projeto',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Enviar imagem',exact:true}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;return canvas.toDataURL('image/png').split(',')[1];});
  await panel.locator('input[type="file"]').setInputFiles({name:'Referencia da mentoria.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await panel.getByText('Referencia da mentoria.png',{exact:true}).waitFor();
  await sections().getByRole('button',{name:'Materiais e versões',exact:true}).click();await panel.getByRole('heading',{name:'Materiais e versões',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Abrir posts do projeto',exact:true}).waitFor();assert.equal(await panel.getByText('Rascunhos neste navegador',{exact:true}).count(),0);
  await sections().getByRole('button',{name:'Referências',exact:true}).click();await panel.getByText('Referencia da mentoria.png',{exact:true}).waitFor();
  await sections().getByRole('button',{name:'Histórico anterior',exact:true}).click();assert.equal(await panel.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true);
  await sections().getByRole('button',{name:'Contexto',exact:true}).click();await panel.locator('summary').first().click();assert.equal(await panel.getByLabel('Oferta',{exact:true}).inputValue(),'Mentoria de matemática para o ENEM');
  await closeSettings(page);await button('Criar novo post').waitFor();assert.equal(await page.locator('.studio-project-card').count(),0);
  await openPostEditor(page);const chat=await openConversation(page);await chat.fill('Rascunho não enviado do meu post');await openSettings(page,'IA');assert.ok(await panel.isVisible());
  await closeSettings(page);assert.equal(await chat.inputValue(),'Rascunho não enviado do meu post');
  await button('Minimizar conversa').click();assert.equal(await button('Abrir conversa').getAttribute('aria-expanded'),'false');await button('Abrir conversa').click();assert.equal(await chat.inputValue(),'Rascunho não enviado do meu post');
  await openPostEditor(page);await page.getByLabel('Título',{exact:true}).fill('Uma estratégia de porcentagem');await button('Revisar post').click();await page.getByRole('heading',{name:'Revise seu post',exact:true}).waitFor();
  await openSettings(page,'Contexto');await closeSettings(page);await page.getByRole('heading',{name:'Revise seu post',exact:true}).waitFor();
  await button('Pedir ajuste no estúdio').click();await openPostEditor(page);assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Uma estratégia de porcentagem');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(calls.some(call=>call.method==='POST'&&call.path!=='/api/projects'),false);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
