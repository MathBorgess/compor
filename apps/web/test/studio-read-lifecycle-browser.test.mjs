import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie} from './session-cookie.mjs';
import {openSettings,closeSettings} from './guided-navigation.mjs';

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
async function until(read,predicate){const deadline=Date.now()+8000;for(;;){const value=read();if(predicate(value))return value;if(Date.now()>deadline)throw Error('Leitura esperada não observada');await new Promise(resolve=>setTimeout(resolve,20));}}
async function setup(t){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});t.after(()=>context.close());await context.addCookies([sessionCookie(origin)]);
 await context.addInitScript(({alice,bob})=>{
  sessionStorage.setItem(`compor-objective:user:${alice}`,'Rascunho de Alice');sessionStorage.setItem(`compor-objective:user:${bob}`,'Rascunho de Bob');
  window.readLifecycle={aborts:[],resolved:[],rejections:[]};
  window.addEventListener('unhandledrejection',event=>window.readLifecycle.rejections.push(String(event.reason)));
  const original=window.fetch.bind(window);
  window.fetch=(input,options)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href).pathname;
   if(path!=='/auth/session'&&path!=='/api/studio/explorations')return original(input,options);
   options?.signal?.addEventListener('abort',()=>window.readLifecycle.aborts.push(path),{once:true});
   return original(input,options).then(response=>{window.readLifecycle.resolved.push(path);return response;});
  };
 },{alice,bob});
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Leituras de teste',revision:1}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64')});
  return route.fulfill({status:503,json:{error:'unexpected_test_operation'}});
 });
 return{page,errors};
}
function deferredRead(route){let release;const done=new Promise(resolve=>{release=resolve;}).then(async json=>{try{await route.fulfill({json});}catch{}});return{release,done};}
async function flushBrowser(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('sessão descarta resposta antiga após troca de conta e mantém falha real visível, sem abortar leituras',{timeout:90000},async t=>{
 const {page,errors}=await setup(t);await page.goto(origin);const idea=page.getByLabel('Sua ideia',{exact:true});await idea.waitFor();assert.equal(await idea.inputValue(),'Rascunho de Alice');
 const pending=[];await page.route('**/auth/session',route=>{const read=deferredRead(route);pending.push(read);return read.done;});
 t.after(()=>{for(const read of pending)read.release({state:'signed-out'});});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(()=>pending.length,n=>n===1);await page.getByText('Verificando sua conta…',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('studio-auth-boundary').isVisible(),false);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await until(()=>pending.length,n=>n===2);
 pending[1].release({state:'connected',userId:bob});await page.waitForFunction(()=>document.querySelector('#studio-project-name')?.value==='Rascunho de Bob');
 assert.deepEqual(await page.evaluate(()=>window.readLifecycle.aborts),[]);
 pending[0].release({state:'connected',userId:alice});await pending[0].done;await flushBrowser(page);
 assert.equal(await idea.inputValue(),'Rascunho de Bob','a conta antiga não reaparece quando a resposta atrasada chega');
 await page.route('**/auth/session',route=>route.fulfill({status:503,json:{state:'unavailable'}}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('Login temporariamente indisponível.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Entrar com Google',exact:true}).isDisabled(),true);
 assert.deepEqual(await page.evaluate(()=>window.readLifecycle.rejections),[]);assert.deepEqual(errors,[]);
});

test('fechar e reabrir galeria descarta resultados antigos e conserva mensagem de falha real, sem AbortError',{timeout:90000},async t=>{
 const {page,errors}=await setup(t),reads=[];await page.route('**/api/studio/explorations?*',route=>{const read=deferredRead(route);reads.push(read);return read.done;});
 t.after(()=>{for(const read of reads)read.release({images:[]});});
 await page.goto(origin);await page.getByRole('button',{name:'Leituras de teste Abrir projeto',exact:true}).click();await openSettings(page,'Referências');await page.getByRole('button',{name:'Propostas do Compor',exact:true}).click();await until(()=>reads.length,n=>n>=1);
 await closeSettings(page);const obsolete=[...reads];
 const image=(n)=>({id:id(n),project_id:project,state:'completed',ordinal:n,created_at:'2026-11-15T12:00:00.000Z'});
 await page.route('**/api/studio/explorations?*',route=>route.fulfill({json:{images:[image(20)]}}));await openSettings(page,'Referências');await page.getByRole('button',{name:'Propostas do Compor',exact:true}).click();
 const fresh=page.getByRole('button',{name:'Usar imagem 20 na conversa e na Direção',exact:true});await fresh.waitFor();
 assert.deepEqual(await page.evaluate(()=>window.readLifecycle.aborts),[]);
 for(const read of obsolete)read.release({images:[image(10)]});await Promise.all(obsolete.map(read=>read.done));await flushBrowser(page);
 assert.equal(await page.getByRole('button',{name:'Usar imagem 10 na conversa e na Direção',exact:true}).count(),0,'a leitura da galeria fechada não substitui a seleção atual');assert.equal(await fresh.isVisible(),true);
 await page.route('**/api/studio/explorations?*',route=>route.fulfill({status:503,json:{error:'unavailable'}}));await page.getByRole('button',{name:'Consultar explorações',exact:true}).click();await page.getByText('Não foi possível consultar as explorações agora.',{exact:true}).waitFor();assert.equal(await fresh.isVisible(),true);
 await closeSettings(page);await flushBrowser(page);assert.deepEqual(await page.evaluate(()=>window.readLifecycle.aborts),[]);assert.deepEqual(await page.evaluate(()=>window.readLifecycle.rejections),[]);assert.deepEqual(errors,[]);
});
