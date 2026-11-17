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
for(const width of [1440,390])test(`configurações usam janela modal com abas em ${width}px`,{timeout:90000},async()=>{
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
  const bounds=await panel.boundingBox(),margin=width>600?32:12;
  assert.ok(bounds.x>=margin-1&&bounds.y>=margin-1&&bounds.x+bounds.width<=width-margin+1&&bounds.y+bounds.height<=950-margin+1,'modal abre como janela, com o estúdio visível nas margens');
  assert.ok(Math.abs(bounds.x-(width-bounds.x-bounds.width))<=1&&Math.abs(bounds.y-(950-bounds.y-bounds.height))<=1,'janela centralizada');
  const close=await panel.getByRole('button',{name:'Fechar configurações',exact:true}).boundingBox();
  assert.ok(close.x+close.width>bounds.x+bounds.width-80&&close.y<bounds.y+80,'fechar fica no canto superior direito');
  assert.equal(await panel.getByRole('button',{name:/^Voltar ao/}).count(),0,'sem botão de retorno no rodapé');
  await panel.locator('summary').first().click();await panel.getByLabel('Oferta',{exact:true}).fill('Mentoria de matemática para o ENEM');
  await sections().getByRole('button',{name:'IA',exact:true}).click();await panel.getByRole('heading',{name:'Escolha sua IA',exact:true}).waitFor();
  const optionColors=await panel.locator('button.studio-project-card').evaluateAll(cards=>cards.map(card=>[getComputedStyle(card).backgroundColor,getComputedStyle(card.querySelector('strong')).color]));
  assert.ok(optionColors.length===2&&optionColors.every(([background,title])=>title!==background&&title!=='rgb(255, 255, 255)'),`opções de IA legíveis: ${JSON.stringify(optionColors)}`);
  assert.equal(await panel.getByRole('region',{name:'Contexto do projeto',exact:true}).count(),0);
  await sections().getByRole('button',{name:'Marca e direção',exact:true}).click();await panel.getByRole('heading',{name:'Uma direção com significado',exact:true}).waitFor();
  const tabsWidth=(await sections().boundingBox()).width;
  for(const selector of ['.persona-step','.studio-direction'])assert.ok(Math.abs((await panel.locator(selector).boundingBox()).width-tabsWidth)<=1,`${selector} ocupa a largura da janela`);
  await sections().getByRole('button',{name:'Referências',exact:true}).click();
  const references=panel.locator('.reference-step');await references.getByRole('heading',{name:'Escolha o que inspira este post',exact:true}).waitFor();
  assert.equal(await panel.isVisible(),true,'ADR 0059: referências abertas pela aba ficam dentro da janela de configurações');
  assert.ok(Math.abs((await references.boundingBox()).width-tabsWidth)<=1,'a bancada ocupa a largura da janela');
  await references.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('upload');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;return canvas.toDataURL('image/png').split(',')[1];});
  await references.locator('input[type="file"]').setInputFiles({name:'Referencia da mentoria.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await references.getByText('Revisar seleção e alcance',{exact:true}).click();await references.getByText('Referencia da mentoria.png',{exact:true}).waitFor();
  await openSettings(page,'Materiais e versões');await panel.getByRole('heading',{name:'Materiais e versões',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Abrir posts do projeto',exact:true}).waitFor();assert.equal(await panel.getByText('Rascunhos neste navegador',{exact:true}).count(),0);
  await openSettings(page,'Referências');await references.getByText('Revisar seleção e alcance',{exact:true}).click();await references.getByText('Referencia da mentoria.png',{exact:true}).waitFor();
  await openSettings(page,'Histórico anterior');
  await sections().getByRole('button',{name:'Histórico anterior',exact:true}).click();assert.equal(await panel.getByRole('button',{name:'Enviar →',exact:true}).isDisabled(),true);
  await sections().getByRole('button',{name:'Contexto',exact:true}).click();await panel.locator('summary').first().click();assert.equal(await panel.getByLabel('Oferta',{exact:true}).inputValue(),'Mentoria de matemática para o ENEM');
  await closeSettings(page);await button('Criar novo post').waitFor();assert.equal(await page.locator('.studio-project-card').count(),0);
  await openPostEditor(page);const chat=await openConversation(page);await chat.fill('Rascunho não enviado do meu post');await openSettings(page,'IA');assert.ok(await panel.isVisible());
  await closeSettings(page);assert.equal(await chat.inputValue(),'Rascunho não enviado do meu post');
  await button('Minimizar conversa').click();assert.equal(await button('Abrir conversa').getAttribute('aria-expanded'),'false');await button('Abrir conversa').click();assert.equal(await chat.inputValue(),'Rascunho não enviado do meu post');
  await openPostEditor(page);await page.getByLabel('Título',{exact:true}).fill('Uma estratégia de porcentagem');await button('Revisar post').click();await page.getByRole('heading',{name:'Revise seu post',exact:true}).waitFor();
  await openSettings(page,'Contexto');await closeSettings(page);await page.getByRole('heading',{name:'Revise seu post',exact:true}).waitFor();
  const postUrl=page.url();
  for(const stage of ['review','export']){
   if(stage==='export'){
    await page.evaluate(({alice,project})=>sessionStorage.setItem(`compor-studio-stage:${alice}:${project}`,'export'),{alice,project});
    await page.reload();await page.getByRole('heading',{name:'Pronto para levar sua ideia adiante',exact:true}).waitFor();
   }
   await openSettings(page,'Referências');
   await references.getByRole('heading',{name:'Escolha o que inspira este post',exact:true}).waitFor({timeout:5000});
   assert.equal(await panel.isVisible(),true,'ADR 0059: referências ficam na janela de configurações');assert.equal(page.url(),postUrl,'abrir referências preserva o post da URL');
   await references.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('upload');
   await references.getByText('Revisar seleção e alcance',{exact:true}).click();await references.getByText('Referencia da mentoria.png',{exact:true}).waitFor();
   await closeSettings(page);await openPostEditor(page);
   assert.equal(page.url(),postUrl,'voltar mantém o mesmo post');
   assert.equal(await page.getByLabel('Título',{exact:true}).inputValue(),'Uma estratégia de porcentagem');
   assert.equal(await (await openConversation(page)).inputValue(),'Rascunho não enviado do meu post');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(calls.some(call=>call.method==='POST'&&call.path!=='/api/projects'),false);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
