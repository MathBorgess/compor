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



import {mockPostCatalog} from './mock-post-catalog.mjs';
import {openPostEditor,openSettings,closeSettings} from './guided-navigation.mjs';
async function harness(t,width,{records,versions=[]}={}){
 const page=await browser.newPage({viewport:{width,height:950}});t.after(()=>page.context().close());await page.context().addCookies([sessionCookie(origin)]);
 const catalog=await mockPostCatalog(page);if(records)catalog.records=records;const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;
  if(path==='/api/posts')return route.fallback();
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:project,title:'Mentoria ENEM',revision:1}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions,posts:[...catalog.records.values()]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin);await button('Mentoria ENEM Abrir projeto').click();await button('Criar novo post').waitFor();
 const stored=()=>page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{db.close();resolve(r.result[0]?.state);};};}));
 return {page,catalog,errors,button,stored};
}
for(const width of [1440,390])test(`nome, confirmação e exclusão de posts em ${width}px`,{timeout:90000},async t=>{
 const {page,catalog,errors,button,stored}=await harness(t,width);
 const name=page.getByRole('textbox',{name:'Nome do post',exact:true});
 await button('Criar novo post').click();assert.ok(await button('Continuar para criação').isDisabled());await name.fill('   ');assert.ok(await button('Continuar para criação').isDisabled());
 await name.fill('Rascunho cancelado');await button('Cancelar').click();assert.equal(await page.locator('.studio-project-entry').count(),0);assert.equal(catalog.calls.length,0);
 await button('Criar novo post').click();assert.equal(await name.inputValue(),'');await name.fill('Live gratuita — Matemática no ENEM');await page.getByLabel('Objetivo deste post',{exact:true}).fill('Inscrições para live');
 await page.waitForFunction(()=>new Promise(resolve=>{const q=indexedDB.open('compor-studio-v1');q.onsuccess=()=>{const r=q.result.transaction('states').objectStore('states').getAll();r.onsuccess=()=>{q.result.close();resolve(r.result[0]?.state.workflow.pendingPost?.name==='Live gratuita — Matemática no ENEM');};};}));
 assert.equal((await stored()).drafts.length,0);assert.equal(catalog.calls.length,0);
 await page.goto(new URL('/',page.url()).href);await button('Mentoria ENEM Abrir projeto').click();await name.waitFor();assert.equal(await name.inputValue(),'Live gratuita — Matemática no ENEM');
 let release;catalog.createGate=new Promise(resolve=>{release=resolve;});const posted=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/posts');
 await button('Continuar para criação').click();await posted;assert.ok(await button('Criando post…').isDisabled());assert.equal((await stored()).drafts.length,0);release();catalog.createGate=null;
 await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).waitFor();assert.equal(catalog.calls.filter(call=>call.method==='POST').length,1);
 assert.equal(await page.locator('.studio-post-identity h2').textContent(),'Live gratuita — Matemática no ENEM');
 await openPostEditor(page);await page.getByLabel('Título',{exact:true}).fill('Texto que vai na arte');assert.equal(await page.locator('.studio-post-identity h2').textContent(),'Live gratuita — Matemática no ENEM');
 await button('Posts do projeto').click();await page.getByRole('button',{name:/^Live gratuita — Matemática no ENEM .*Abrir post e conversa$/}).waitFor();
 await button('Criar novo post').click();await name.fill('Post descartado');await button('Cancelar').click();assert.equal(await page.locator('.studio-project-entry').count(),1);assert.equal(catalog.calls.length,1);
 await button('Criar novo post').click();await name.fill('Dica de porcentagem');await button('Continuar para criação').click();await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).waitFor();
 await button('Posts do projeto').click();const card=page.locator('.studio-project-entry').filter({hasText:'Live gratuita — Matemática no ENEM'});
 await card.getByRole('button',{name:'Excluir post',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Excluir post?',exact:true});await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(catalog.calls.filter(call=>call.method==='DELETE').length,0);
 await card.getByRole('button',{name:'Excluir post',exact:true}).click();await dialog.getByRole('button',{name:'Excluir post',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('.studio-project-entry').count(),1);
 const saved=await stored();assert.equal(saved.drafts.length,2,'histórico local preservado');assert.ok(Object.values(saved.posts).some(post=>post.deleted));
 await page.goto(new URL('/',page.url()).href);await button('Mentoria ENEM Abrir projeto').click();await button('Criar novo post').waitFor();assert.equal(await page.locator('.studio-project-entry').count(),1);assert.equal(await page.getByText('Live gratuita — Matemática no ENEM',{exact:true}).count(),0);
 const other=await harness(t,width,{records:catalog.records});assert.equal(await other.page.locator('.studio-project-entry').count(),1);await other.page.getByRole('button',{name:/^Dica de porcentagem .*Abrir post e conversa$/}).click();await other.page.getByRole('textbox',{name:'Sua mensagem',exact:true}).waitFor();assert.equal(await other.page.locator('.studio-post-identity h2').textContent(),'Dica de porcentagem');
 const remaining=[...catalog.records.values()].find(post=>!post.deleted);remaining.deleted=true;await other.page.goto(new URL('/',other.page.url()).href);await other.page.getByRole('button',{name:'Mentoria ENEM Abrir projeto',exact:true}).click();await other.page.getByRole('button',{name:'Criar novo post',exact:true}).waitFor();assert.equal(await other.page.locator('.guided-workspace:visible').count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(other.errors,[]);
});
test('falhas não criam ou removem posts e a repetição usa a mesma identidade',{timeout:90000},async t=>{
 const {page,catalog,button,stored,errors}=await harness(t,1440);await button('Criar novo post').click();await page.getByLabel('Nome do post',{exact:true}).fill('Convite para a live');catalog.failCreate=true;
 await button('Continuar para criação').click();await page.getByText(/^Não foi possível confirmar a criação/).waitFor();assert.equal((await stored()).drafts.length,0);assert.equal(catalog.calls.length,1);
 catalog.failCreate=false;await button('Continuar para criação').click();await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).waitFor();assert.equal(catalog.calls[0].body.pieceId,catalog.calls[1].body.pieceId);
 await button('Posts do projeto').click();catalog.failDelete=true;await button('Excluir post').click();const dialog=page.getByRole('dialog',{name:'Excluir post?',exact:true});await dialog.getByRole('button',{name:'Excluir post',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.locator('.studio-project-entry').count(),1);assert.equal(catalog.calls.length,3);
 catalog.failDelete=false;await dialog.getByRole('button',{name:'Excluir post',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('.studio-project-entry').count(),0);assert.equal(catalog.calls[2].body.pieceId,catalog.calls[3].body.pieceId);assert.deepEqual(errors,[]);
});
test('post legado com versões salvas também pode ser excluído sem apagar a versão',{timeout:90000},async t=>{
 const versions=[{project_id:project,piece_id:id(8),version:1,content:{headline:'Arte anterior',price:'',date:'',caption:'Legenda',captionOrigin:'user'}}];
 const {page,catalog,button,errors}=await harness(t,1440,{versions});await page.getByRole('button',{name:/^Arte anterior .*Abrir post e conversa$/}).waitFor();await button('Excluir post').click();await page.getByRole('dialog',{name:'Excluir post?',exact:true}).getByRole('button',{name:'Excluir post',exact:true}).click();await page.getByRole('dialog',{name:'Excluir post?',exact:true}).waitFor({state:'hidden'});
 await page.goto(new URL('/',page.url()).href);await button('Mentoria ENEM Abrir projeto').click();await button('Criar novo post').waitFor();assert.equal(await page.locator('.studio-project-entry').count(),0);assert.equal(versions.length,1);
 await openSettings(page,'Materiais e versões');assert.equal(await page.getByRole('button',{name:/^Arte anterior/}).count(),0);await closeSettings(page);assert.equal([...catalog.records.values()][0].deleted,true);assert.deepEqual(errors,[]);
});
