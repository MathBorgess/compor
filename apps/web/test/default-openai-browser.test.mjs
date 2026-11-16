import {openSettings,openPostEditor,closeSettings} from './guided-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {sessionCookie,sessionCookieHeaders} from './session-cookie.mjs';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {prepareAdjustment,settleAdjustment} from '../lib/studio-state.ts';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000003';

test('IA do Compor exige intenção nova após disponibilidade e recarga, sem enviar chave ao navegador',{skip:!existsSync(browserPath),timeout:90000},async t=>{
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
  let startup='';const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',APP_ORIGIN:origin}});
  for(const stream of[child.stdout,child.stderr])stream.on('data',value=>{startup=(startup+value).slice(-6000);});
  let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
  await waitForApp({url:origin,child,signal:t.signal,headers:sessionCookieHeaders(origin),nextApp:true,diagnostics:()=>startup});
  browser=await chromium.launch({executablePath:browserPath,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);
  await page.context().addCookies([sessionCookie(origin)]);
  const errors=[],creative=[],statusRequests=[];let available=true;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId}}));
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/api/ai/credential-status'){statusRequests.push({headers:request.headers(),body:request.postData()});return route.fulfill({json:{defaultAvailable:available}});}
    if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto preservado',revision:1}]}});
    if(url.pathname==='/api/pieces')return route.fulfill({json:{versions:[]}});
    if(url.pathname==='/api/studio/references/history')return route.fulfill({json:{references:[]}});
    if(url.pathname.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
    if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
    if(url.pathname==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[],nextBeforeOrdinal:null}});
    if(url.pathname==='/api/studio/explorations'&&request.method()==='POST'){
      const body=request.postDataJSON();creative.push({path:url.pathname,body,headers:request.headers()});
      return route.fulfill({status:503,json:{status:'not_started',requestId:body.requestId,retryAutomatically:false}});
    }
    if(url.pathname==='/api/studio/chat'){creative.push({path:url.pathname,body:request.postDataJSON(),headers:request.headers()});return route.fulfill({status:202,json:{status:'completed',text:'Resposta sintética'}});}
    return route.fulfill({status:503,json:{error:'unavailable'}});
  });
  async function openProject(){await page.getByRole('button',{name:'Projeto preservado Abrir projeto',exact:true}).click();await openSettings(page,'Contexto');}
  await page.goto(origin);await openProject();
  const context=page.getByRole('region',{name:'Contexto do projeto',exact:true});
  await context.locator('summary').filter({hasText:'O que vamos divulgar?'}).click();
  await context.getByLabel('Oferta',{exact:true}).fill('Uma aula de cerâmica');
  await page.waitForFunction(()=>new Promise(resolve=>{
    const request=indexedDB.open('compor-studio-v1');
    request.onsuccess=()=>{const db=request.result,q=db.transaction('states').objectStore('states').getAll();q.onsuccess=()=>{const saved=q.result.some(row=>row.state?.brief?.offer==='Uma aula de cerâmica');db.close();resolve(saved);};q.onerror=()=>{db.close();resolve(false);};};request.onerror=()=>resolve(false);
  }));
  await page.waitForTimeout(1800);assert.equal(creative.length,0,'disponibilidade e edição do contexto não autorizam gastos');
  await page.goto(new URL('/',page.url()).href);await openProject();
  await page.getByRole('region',{name:'Contexto do projeto',exact:true}).getByText('Uma aula de cerâmica',{exact:true}).waitFor();
  await page.waitForTimeout(1800);assert.equal(creative.length,0,'abrir projeto recuperado com contexto pronto não ativa geração');
  await openSettings(page,'IA');
  assert.equal(await page.getByRole('button',{name:/^Usar a IA do Compor/}).getAttribute('aria-pressed'),'true','IA do Compor é a escolha inicial sem ativar geração');
  await page.getByRole('button',{name:/^Usar a IA do Compor/}).click();await openSettings(page,'Referências');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await page.waitForFunction(()=>Boolean(localStorage.getItem('compor-exploration-not-started:00000000-0000-4000-8000-000000000001')));
  assert.equal(creative.length,1,'a ação explícita ativa o fluxo real de exploração');
  assert.equal(Object.hasOwn(creative[0].body,'apiKey'),false);
  assert.equal(Object.hasOwn(creative[0].headers,'x-compor-openai-key'),false);
  assert.ok(statusRequests.length>=2);assert.ok(statusRequests.every(item=>item.body===null&&!Object.hasOwn(item.headers,'x-compor-openai-key')));
  await closeSettings(page);await openPostEditor(page);
  const stored=await page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,read=db.transaction('states').objectStore('states').getAll();read.onsuccess=()=>{db.close();resolve(read.result[0]);};};}));
  const pendingId=crypto.randomUUID(),at=new Date().toISOString();
  const unknown=settleAdjustment(prepareAdjustment(stored.state,{requestId:pendingId,messageId:crypto.randomUUID(),instruction:'Pedido anterior ainda não confirmado',createdAt:at,eventId:crypto.randomUUID()}),{requestId:pendingId,status:'unknown',eventId:crypto.randomUUID()});
  async function replaceSaved(state){await page.evaluate(({scope,state})=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('states','readwrite');tx.objectStore('states').put({scope,state});tx.oncomplete=()=>{db.close();localStorage.removeItem('compor-exploration-not-started:00000000-0000-4000-8000-000000000001');resolve();};};}),{scope:stored.scope,state});}
  await replaceSaved(unknown);await page.goto(new URL('/',page.url()).href);await openProject();
  await openSettings(page,'IA');await page.getByRole('button',{name:/^Usar a IA do Compor/}).click();await openSettings(page,'Referências');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await page.waitForTimeout(1800);assert.equal(creative.length,1,'a intenção na fonte nova não inicia imagens enquanto o chat anterior permanece unknown');
  const completed=settleAdjustment(unknown,{requestId:pendingId,status:'completed',eventId:crypto.randomUUID()});
  await replaceSaved(completed);await page.goto(new URL('/',page.url()).href);await openProject();
  await openSettings(page,'IA');await page.getByRole('button',{name:/^Usar a IA do Compor/}).click();await openSettings(page,'Referências');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await page.waitForFunction(()=>Boolean(localStorage.getItem('compor-exploration-not-started:00000000-0000-4000-8000-000000000001')));
  assert.equal(creative.length,2,'o término confirmado do chat libera apenas uma nova ação explícita');
  available=false;await page.goto(new URL('/',page.url()).href);await openProject();await openSettings(page,'IA');
  await page.getByText('Indisponível no momento',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Escolher depois',exact:true}).isEnabled(),true);
  assert.equal(creative.length,2);assert.deepEqual(errors,[]);
});
