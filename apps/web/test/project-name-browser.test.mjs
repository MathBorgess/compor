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

test('nome explícito não preenche o contexto nem vira título provisório',{timeout:90000},async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.context().addCookies([sessionCookie(origin)]);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let projects=[],submissions=[];
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/projects'){
   if(request.method()==='POST'){const data=request.postDataJSON();submissions.push(data);projects=[{id:project,title:data.title,revision:1}];return route.fulfill({json:{project:projects[0]}});}
   return route.fulfill({json:{projects}});
  }
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 try{
  await page.addInitScript(({alice})=>sessionStorage.setItem(`compor-objective:user:${alice}`,'Uma ideia antiga que não é nome'),{alice});
  await page.goto(origin);const name=page.getByLabel('Nome do projeto',{exact:true});await name.waitFor();assert.equal(await name.inputValue(),'');assert.equal(await name.getAttribute('maxlength'),'200');
  const title='Mentoria Veloz — Campanha 1 com um nome explícito de mais de 48 caracteres';
  await name.fill(title);await name.press('Enter');
  const offer=page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true});await offer.waitFor();assert.deepEqual(submissions,[{title}]);assert.equal(await offer.inputValue(),'');
  const stored=()=>page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result[0]?.state);};};}));
  for(let i=0;i<50&&!(await stored());i++)await page.waitForTimeout(50);
  assert.equal((await stored()).projectTitleProvisional,false);assert.equal((await stored()).projectIdea,'');
  await page.goto(new URL('/',page.url()).href);await page.getByRole('button',{name:`${title} Abrir projeto`,exact:true}).click();await offer.waitFor();assert.equal(await offer.inputValue(),'');
  await offer.fill('Mentoria de matemática para estudantes do ENEM');await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await offer.inputValue(),'Mentoria de matemática para estudantes do ENEM');
  await offer.fill('');await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await offer.inputValue(),'');assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
