import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {sessionCookie} from './session-cookie.mjs';
import {stopApp,waitForApp} from './wait-for-app.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const project='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000001';
const syntheticKey='sk-compor-browser-synthetic-key';

test('referências no primeiro projeto recuperam seleção e intenção e aceitam imagem sem BYOK',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const socket=createServer();
 await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;
 await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{
  stdio:['ignore','pipe','pipe'],
  env:{
   ...process.env,APP_ORIGIN:origin,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
   COMPOR_AGENT_ENABLED:'true',COMPOR_AGENT_HMAC_SECRET:Buffer.alloc(32,1).toString('base64url'),
   COMPOR_STUDIO_CHAT_ENABLED:'true',COMPOR_PRIVATE_IMAGES_ENABLED:'true',COMPOR_SELECTED_LOCAL_VISUALS_ENABLED:'true',
   COMPOR_REFERENCE_AUTHORITY_ENABLED:'true',COMPOR_PARALLEL_EXPLORATION_ENABLED:'true',
  },
 });
 let browser,logs='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{logs=(logs+data.toString()).slice(-6000);});
 t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,diagnostics:()=>logs});
 browser=await chromium.launch({executablePath:browserPath,headless:true});
 const page=await browser.newPage({viewport:{width:390,height:820}});
 await page.context().addCookies([sessionCookie(origin)]);
 page.setDefaultTimeout(12000);

 let savedProject,selectionAvailable=false,epochAvailable=false,revision=0;
 let state={version:1,references:[],projectReferenceIds:[],posts:[]};
 let sessionCheck,sessionUser=user;
 const receipts=new Map(),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  const path=url.pathname;
  if(path==='/auth/session'){
   if(sessionCheck)await sessionCheck.promise;
   return route.fulfill({json:{state:'connected',userId:sessionUser}});
  }
  if(!path.startsWith('/api/'))return route.continue();
  const body=request.method()==='POST'?request.postDataJSON():null;
  requests.push({path,op:body?.op});
  if(path==='/api/projects'){
   if(body){savedProject={id:project,title:body.title,revision:1};return route.fulfill({json:{project:savedProject}});}
   return route.fulfill({json:{projects:savedProject&&sessionUser===user?[savedProject]:[]}});
  }
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/studio/explorations'&&request.method()==='GET')return route.fulfill({json:{images:[]}});
  if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path.endsWith('/intent/epoch')&&epochAvailable)return route.fulfill({json:{epoch:0}});
  if(path.endsWith('/intent'))return route.fulfill({json:{status:'created',epoch:1}});
  if(path.endsWith('/intent/revoke'))return route.fulfill({json:{status:'revoked',epoch:2,revocationEpoch:2}});
  if(path.endsWith('/reference-authority/selection')&&selectionAvailable){
   if(body.op==='read')return route.fulfill({json:{status:'ready',revision,state}});
   if(body.op==='receipt')return route.fulfill({json:receipts.get(body.commandId)??{status:'absent'}});
   if(body.op==='write'&&body.expectedRevision===revision){
    state={...body.state,references:body.state.references.map(({id,inputOrigin,source})=>{
     const sourceDigest=createHash('sha256').update('compor-reference-source-v1\0').update(JSON.stringify({inputOrigin,source})).digest('hex');
     return {id,inputOrigin,sourceDigest};
    })};
    const receipt={status:'applied',commandId:body.commandId,revision:++revision};
    receipts.set(body.commandId,receipt);
    return route.fulfill({json:receipt});
   }
  }
  if(path.endsWith('/reference-authority/snapshot')){
   const {requestId,projectId,conversationId,batchId,purpose,selectionRevision,visualInput}=body;
   return route.fulfill({json:{status:'created',snapshot:{requestId,projectId,conversationId,batchId,purpose,selectionRevision,manifestDigest:visualInputDigest(visualInput),consentId:null}}});
  }
  if(path.endsWith('/plan'))return route.fulfill({json:{status:'unknown',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId}});
  return route.fulfill({status:503,json:{error:'unavailable'}});
 });

 const button=name=>page.getByRole('button',{name,exact:true});
 await page.goto(origin);
 await page.getByLabel('Nome do projeto',{exact:true}).fill('Oficina do Bairro');
 await button('Criar projeto e continuar').click();
 await page.getByRole('textbox',{name:'O que vamos divulgar?',exact:true}).fill('Inscrições para uma oficina de cerâmica');
 await button('Continuar').click();
 await button('Continuar para a IA').click();
 await button('Escolher depois').click();
 const upload=button('Enviar imagem'),proposals=button('Pedir 3 propostas');
 await page.getByText(/Não foi possível verificar a seleção de referências/).waitFor();
 assert.equal(await upload.isDisabled(),true);
 assert.equal(await proposals.isDisabled(),true);
 selectionAvailable=true;
 await button('Consultar confirmação').click();
 await page.getByText('Escolha uma IA para pedir propostas.',{exact:true}).waitFor();
 assert.equal(await proposals.isDisabled(),true);
 assert.equal(requests.filter(({path,op})=>path.endsWith('/reference-authority/selection')&&op==='write').length,0,'consultar não publica uma seleção');

 const image=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=40;
  const context=canvas.getContext('2d');context.fillStyle='#123eab';context.fillRect(0,0,32,40);
  return canvas.toDataURL('image/png').split(',')[1];
 });
 async function chooseDuringSessionCheck(name){
  const picker=page.waitForEvent('filechooser');
  await upload.click();
  const chooser=await picker;
  // Native file pickers return focus before delivering the chosen file.
  sessionCheck=Promise.withResolvers();
  const checking=page.waitForRequest(req=>new URL(req.url()).pathname==='/auth/session');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await checking;
  await chooser.setFiles({name,mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 }
 await chooseDuringSessionCheck('referência sem chave.png');
 assert.equal(state.references.length,0,'o envio aguarda a confirmação da mesma conta');
 sessionCheck.resolve();
 assert.equal(await page.locator('.reference-upload-feedback').filter({hasNotText:'Adicionando imagens'}).innerText(),'Imagem adicionada à seleção.');
 assert.equal(state.references.length,1);
 assert.equal(state.references[0].inputOrigin,'local-upload');
 assert.equal(requests.filter(({path})=>path.endsWith('/intent')||path.endsWith('/plan')).length,0);

 await button('Escolher IA').click();
 await page.getByRole('button',{name:/^Usar minha chave Conectar/}).click();
 await page.getByLabel('Chave OpenAI',{exact:true}).fill(syntheticKey);
 await button('Usar minha chave').click();
 await button('Continuar para referências').click();
 await page.getByText('Não foi possível verificar a disponibilidade da exploração.',{exact:true}).waitFor();
 assert.equal(await proposals.isDisabled(),true);
 epochAvailable=true;
 await button('Verificar disponibilidade').click();
 assert.equal(await page.getByRole('combobox',{name:'Fonte',exact:true}).inputValue(),'search');
 await proposals.and(page.locator(':enabled')).waitFor();
 const epochReads=()=>requests.filter(({path})=>path.endsWith('/intent/epoch')).length;
 const beforeFocus=epochReads();
 await page.evaluate(()=>{
  Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});
  window.dispatchEvent(new Event('blur'));
 });
 await proposals.and(page.locator(':disabled')).waitFor();
 sessionCheck=Promise.withResolvers();
 const focusCheck=page.waitForRequest(req=>new URL(req.url()).pathname==='/auth/session');
 await page.evaluate(()=>{delete document.hasFocus;window.dispatchEvent(new Event('focus'));});
 await focusCheck;
 assert.equal(epochReads(),beforeFocus);
 sessionCheck.resolve();
 await proposals.and(page.locator(':enabled')).waitFor();
 assert.equal(epochReads(),beforeFocus+1,'a confirmação da mesma conta libera o botão com uma consulta');
 assert.equal(requests.filter(({path})=>path.endsWith('/intent')||path.endsWith('/plan')).length,0);
 const planning=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/plan'));
 await proposals.click();
 const plan=await planning,submission=plan.postDataJSON();
 assert.equal(plan.headers()['x-compor-openai-key']===syntheticKey,true);
 assert.equal(submission.op,'submit');
 assert.deepEqual(submission.visualInput.entries.map(item=>item.id),state.projectReferenceIds);
 assert.equal(submission.referenceImages.length,1);
 assert.equal(requests.filter(({path})=>path.endsWith('/intent')).length,1);
 const inspect=page.getByRole('region',{name:'Tentativa paralela anterior'}).getByRole('button',{name:'Consultar tentativa anterior',exact:true});
 await inspect.click();
 await page.getByText('O planejamento ainda não foi confirmado. Nenhuma nova tentativa foi enviada.',{exact:true}).waitFor();
 assert.equal(requests.filter(({path,op})=>path.endsWith('/plan')&&op==='poll').length,1);
 assert.equal(requests.filter(({path,op})=>path.endsWith('/plan')&&op==='submit').length,1);
 // A file chosen in the previous account must never be saved under either account.
 await chooseDuringSessionCheck('arquivo da conta anterior.png');
 sessionUser='00000000-0000-4000-8000-000000000003';
 sessionCheck.resolve();
 await page.getByLabel('Nome do projeto',{exact:true}).waitFor();
 const stored=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{
   const open=indexedDB.open('compor-studio-v1');
   open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  try{
   const entries=await new Promise((resolve,reject)=>{
    const read=db.transaction('references').objectStore('references').getAll();
    read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);
   });
   return Promise.all(entries.map(async entry=>({scope:entry.scope,name:entry.metadata.name,bytes:Array.from(new Uint8Array(await entry.file.arrayBuffer()))})));
  }finally{db.close();}
 });
 assert.deepEqual(stored,[{scope:JSON.stringify([user,project]),name:'referência sem chave.png',bytes:[...Buffer.from(image,'base64')]}]);
 assert.equal(requests.filter(({path,op})=>path.endsWith('/reference-authority/selection')&&op==='write').length,1);
 assert.deepEqual(errors,[]);
});
