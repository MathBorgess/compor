import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chromium } from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const projectId='11111111-1111-4111-8111-111111111111',pieceId='22222222-2222-4222-8222-222222222222',attemptId='33333333-3333-4333-8333-333333333333';
const secret='sk-test-session-only-123456789012345', assetId='44444444-4444-4444-8444-444444444444', assetId2='55555555-5555-4555-8555-555555555555';

test('pessoa revisa e confirma a imagem para uma versão salva', {skip:!existsSync(browserPath)}, async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_publictest',APP_ORIGIN:origin}});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;while(true){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>deadline)throw Error('app indisponível');await new Promise(r=>setTimeout(r,200));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(2500);let requests=[];
 await page.route('**/auth/session',r=>r.fulfill({json:{state:'connected',userId:'alice'}}));
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:projectId,title:'Oficina'}]}}));
 await page.route('**/api/pieces*',r=>r.fulfill({json:{versions:[{project_id:projectId,piece_id:pieceId,version:1,content:{headline:'Convite',price:'',date:'',caption:'Legenda',captionOrigin:'user'}}]}}));
 await page.route('**/api/agent',async r=>{requests.push({url:'/api/agent',body:r.request().postDataJSON(),headers:r.request().headers()});await r.fulfill({status:202,json:{status:'consent_required',prompt:'Um jardim ao sol',attemptId,actionBinding:'signed-proof'}});});
 await page.route('**/api/images**',async r=>{
  if(r.request().method()==='GET') { const url=new URL(r.request().url()); assert.equal(url.searchParams.get('projectId'),projectId);assert.equal(url.searchParams.get('pieceId'),pieceId);assert.equal(url.searchParams.get('version'),'1');assert.ok([assetId,assetId2].includes(url.searchParams.get('assetId')));return r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64')}); }
 });
 await page.route('**/api/agent/image',async r=>{requests.push({url:'/api/agent/image',body:r.request().postDataJSON()});await r.fulfill({status:202,json:{status:'accepted',assetId:requests.filter(item=>item.url==='/api/agent/image').length===1 ? assetId : assetId2}});});
 await page.goto(origin);await page.getByLabel('O que você quer divulgar?').fill('Aula aberta');await page.getByLabel('Chave OpenAI').fill(secret);await page.getByRole('button',{name:'Abrir Oficina'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();
 await page.getByRole('button',{name:'Iniciar direção criativa'}).click();await page.getByText('Um jardim ao sol').waitFor();assert.equal(requests.length,1);
 assert.equal(requests[0].body.apiKey,secret);assert.equal(requests[0].body.objective,'Aula aberta');assert.equal(requests[0].headers['x-compor-project-id'],projectId);assert.match(requests[0].headers['x-compor-attempt-id'],/^[0-9a-f-]{36}$/);
 await page.getByRole('button',{name:'Confirmar geração de imagem'}).click();await page.getByText(/evento foi aceito/i).waitFor();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();
 assert.deepEqual(requests[1].body,{apiKey:secret,projectId,pieceId,version:1,attemptId,actionBinding:'signed-proof',explicitApproval:true});
 const stored=await page.evaluate(()=>JSON.stringify({session:sessionStorage,local:localStorage,cookies:document.cookie,html:document.documentElement.outerHTML}));assert.ok(!stored.includes(secret));assert.ok(!stored.includes('signed-proof'));assert.ok(!stored.includes('Um jardim ao sol'));
 await page.reload();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByText(/evento foi aceito/i).waitFor();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();assert.equal(requests.length,2);
 await page.getByRole('button',{name:'Iniciar nova tentativa'}).click();await page.getByRole('button',{name:'Ver imagem anterior 1'}).click();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByRole('button',{name:'Ver imagem anterior 1'}).click();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();assert.equal(requests.length,2);
 await page.getByLabel('Chave OpenAI').fill(secret);await page.getByRole('button',{name:'Iniciar direção criativa'}).click();
 await page.evaluate(()=>{window.savedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('compor-agent-attempt:')&&key.endsWith(':assets'))throw Error('storage indisponível');return window.savedSetItem.call(this,key,value);};});
 await page.getByRole('button',{name:'Confirmar geração de imagem'}).click();await page.getByText(/não foi possível preservar a referência da imagem/i).waitFor();
 await page.getByRole('button',{name:'Iniciar nova tentativa'}).click();await page.getByText(/evento foi aceito/i).waitFor();assert.equal(await page.getByRole('button',{name:'Ver imagem anterior 1'}).count(),1);
 await page.evaluate(()=>{Storage.prototype.setItem=window.savedSetItem;});await page.getByRole('button',{name:'Iniciar nova tentativa'}).click();
 await page.reload();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByRole('button',{name:'Ver imagem anterior 1'}).waitFor();await page.getByRole('button',{name:'Ver imagem anterior 2'}).click();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();assert.equal(requests.length,4);

});

test('resultado incerto é preservado ao revalidar sessão e não repete chamadas', {skip:!existsSync(browserPath)}, async t=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_publictest',APP_ORIGIN:origin}});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const deadline=Date.now()+30000;while(true){try{if((await fetch(origin)).ok)break;}catch{}if(Date.now()>deadline)throw Error('app indisponível');await new Promise(r=>setTimeout(r,200));}
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(3000);let starts=0,images=0,reads=0,currentUser='alice';
 await page.route('**/auth/session',r=>r.fulfill({json:{state:'connected',userId:currentUser}}));
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:projectId,title:'Oficina'}]}}));
 await page.route('**/api/pieces*',r=>r.fulfill({json:{versions:[{project_id:projectId,piece_id:pieceId,version:1,content:{headline:'Convite',price:'',date:'',caption:'Legenda',captionOrigin:'user'}}]}}));
 await page.route('**/api/agent',async r=>{starts++;await r.fulfill({status:202,json:{status:'consent_required',prompt:'Uma paisagem',attemptId,actionBinding:'signed-proof'}});});
 await page.route('**/api/agent/image',async r=>{images++;await r.fulfill({status:502,json:{error:'result_unknown',retryAutomatically:false,assetId}});});
 await page.route('**/api/images**',async r=>{reads++;assert.equal(currentUser,'alice');return r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64')});});
 await page.goto(origin);await page.getByLabel('O que você quer divulgar?').fill('Aula');await page.getByLabel('Chave OpenAI').fill(secret);await page.getByRole('button',{name:'Abrir Oficina'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();
 await page.getByLabel('Legenda').fill('Mudança ainda não salva');assert.equal(await page.getByRole('button',{name:'Iniciar direção criativa'}).isDisabled(),true);await page.getByLabel('Legenda').fill('Legenda');
 // Reopening after clearing the dirty draft makes the saved version explicit.
 await page.reload();await page.getByLabel('Chave OpenAI').fill(secret);await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).waitFor();
 await page.evaluate(()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith('compor-piece-draft:'))sessionStorage.removeItem(key);});
 await page.reload();await page.getByLabel('Chave OpenAI').fill(secret);await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();
 await page.getByRole('button',{name:'Iniciar direção criativa'}).click();await page.getByRole('button',{name:'Confirmar geração de imagem'}).click();await page.getByText(/resultado da tentativa é desconhecido/i).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText(/resultado da tentativa é desconhecido/i).waitFor();assert.equal(starts,1);assert.equal(images,1);
 await page.reload();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();await page.getByText(/resultado da tentativa é desconhecido/i).waitFor();await page.getByRole('img',{name:'Imagem gerada para revisão'}).waitFor();assert.equal(starts,1);assert.equal(images,1);
 const aliceReads=reads;currentUser='bob';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByLabel('Chave OpenAI').waitFor();await page.waitForFunction(()=>document.querySelector('#openai-key')?.value==='');await page.getByRole('button',{name:'Abrir Oficina'}).click();await page.getByRole('button',{name:'Abrir peça 1, versão 1'}).click();assert.equal(await page.getByText(/resultado da tentativa é desconhecido/i).count(),0);assert.equal(await page.getByRole('button',{name:'Ver imagem anterior 1'}).count(),0);assert.equal(starts,1);assert.equal(images,1);assert.equal(reads,aliceReads);
});
