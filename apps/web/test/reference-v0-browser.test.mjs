import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {createStudioState} from '../lib/studio-state.ts';
import {sessionCookie,sessionCookieHeaders} from './session-cookie.mjs';
import {waitForApp,stopApp} from './wait-for-app.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,userId=id(1),projectId=id(2);
async function stored(page){return page.evaluate(async({userId,projectId})=>{
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1',4);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{
  const read=(store,key)=>new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const scope=JSON.stringify([userId,projectId]),state=(await read('states',scope))?.state;
  const asset=state?.selection?await read('draftAssets',JSON.stringify([scope,state.selection.pieceId,state.selection.baseVersion,'base'])):null;
  return {state,bytes:asset?Array.from(new Uint8Array(await asset.file.arrayBuffer())):null};
 }finally{db.close();}
},{userId,projectId});}
async function waitStored(page,predicate){for(let i=0;i<150;i++){const value=await stored(page);if(predicate(value))return value;await page.waitForTimeout(40);}throw Error('Persistent v0 state was not observed');}

for(const entry of ['button','chat','ready-chat','project-exit-x','project-exit-escape','project-exit-tab','post-exit-x'])test(`named post keeps generated v0, reload, scoped chat and creation races via ${entry}`,{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const origin=`http://127.0.0.1:${port}`;let diagnostics='';
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',COMPOR_DEFAULT_OPENAI_ENABLED:'true',APP_ORIGIN:origin}});
 for(const stream of [child.stdout,child.stderr])stream.on('data',value=>{diagnostics=(diagnostics+value.toString()).slice(-4000);});
 let browser;t.after(async()=>{try{await browser?.close();}finally{await stopApp(child);}});
 await waitForApp({url:origin,child,signal:t.signal,headers:sessionCookieHeaders(origin),nextApp:true,diagnostics:()=>diagnostics});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const context=await browser.newContext({viewport:{width:1440,height:1024}});await context.addCookies([sessionCookie(origin)]);
 const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[],generation=[],images=[],requests=[],posts=[];page.on('pageerror',error=>errors.push(error.message));
 let generatedPixels,referencePixels,releaseCreation,heldCreation,nextAgent=200;const actionResults=[];
 const pin={id:'101',title:'Editorial acolhedor',board:'behance/typography',originUrl:'https://www.pinterest.com/pin/101/',previewUrl:'https://i.pinimg.com/236x/101.png'};
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='i.pinimg.com')return route.fulfill({contentType:'image/png',body:referencePixels});
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/auth/session')return route.fulfill({json:{state:'connected',userId}});
  if(url.pathname==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:true}});
  if(url.pathname==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto v0'}]}});
  if(url.pathname==='/api/pieces')return route.fulfill({json:{versions:[],posts}});
  if(url.pathname==='/api/posts'){const body=request.postDataJSON();if(body.name==='Post A'){heldCreation=body;await new Promise(resolve=>{releaseCreation=resolve;});}const existing=posts.find(post=>post.pieceId===body.pieceId);const post=existing??{...body,deleted:false};if(!existing)posts.push(post);return route.fulfill({json:{status:'created',post}});}
  if(url.pathname==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(url.pathname==='/api/studio/explorations/resume')return route.fulfill({json:{status:'resumed'}});
  if(url.pathname==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:generatedPixels});
  if(url.pathname==='/api/studio/explorations'){
   if(request.method()==='GET'){const before=Number(url.searchParams.get('beforeOrdinal')||Infinity);return route.fulfill({json:{images:images.filter(item=>item.ordinal<before).toReversed(),nextBeforeOrdinal:null}});}
   const body=request.postDataJSON();generation.push(body);images.push({id:body.requestId,project_id:projectId,state:'completed',created_at:new Date().toISOString(),ordinal:100+generation.length,batch_id:body.batch.id,batch_position:body.batch.position});
   return route.fulfill({json:{status:'completed',requestId:body.requestId}});
  }
  if(url.pathname==='/api/studio/references/history')return route.fulfill({json:{references:[]}});
  if(url.pathname==='/api/studio/references/search')return route.fulfill({json:{status:'ok',references:[pin]}});
  if(url.pathname==='/api/studio/references/preview')return route.fulfill({contentType:'image/png',body:referencePixels});
  if(url.pathname.endsWith('/signals')){
   const body=request.postDataJSON();return body.action==='selected'?route.fulfill({status:201,json:{signal:{...body,createdAt:new Date().toISOString()}}}):route.fulfill({json:{signals:[]}});
  }
  if(url.pathname==='/api/studio/chat'){requests.push(url.pathname);const body=request.postDataJSON();if(body.message==='Crie outro post')return route.fulfill({json:{status:'action_required',action:{name:'compor_novo_post',args:{projectId,requestId:id(nextAgent++),revision:body.context.revision}},actionBinding:'prepare-post-binding'}});return route.fulfill({json:{status:'completed',text:'A referência foi registrada. Você pode continuar para o post.'}});}
  if(url.pathname==='/api/studio/action'){actionResults.push(request.postDataJSON().result);return route.fulfill({json:{status:'completed',text:'Informe o nome e confirme no formulário para criar o post.'}});}
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:500,json:{error:'unexpected_test_operation'}});
  return route.continue();
 });
 await page.goto(origin);
 [generatedPixels,referencePixels]=await page.evaluate(()=>['#123eab','#f6d550'].map(color=>{const canvas=document.createElement('canvas');canvas.width=12;canvas.height=16;canvas.getContext('2d').fillStyle=color;canvas.getContext('2d').fillRect(0,0,12,16);return canvas.toDataURL('image/png').split(',')[1];})).then(values=>values.map(value=>Buffer.from(value,'base64')));
 const initial=createStudioState({userId,projectId,projectIdea:'Convite para uma oficina de criação',prepare:true,projectTitleProvisional:true});
 await page.evaluate(async state=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1',4);request.onupgradeneeded=()=>{const db=request.result;for(const [name,key] of [['states','scope'],['legacyStates','scope'],['stateArchives','key'],['references','key'],['draftAssets','key']]){const store=db.createObjectStore(name,{keyPath:key});if(['references','draftAssets'].includes(name))store.createIndex('scope','scope');}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite');tx.objectStore('states').put({scope:JSON.stringify([state.userId,state.projectId]),state});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },initial);
 await page.getByRole('button',{name:/Projeto v0/}).click();
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('textbox',{name:'Quem você quer alcançar?',exact:true}).fill('Profissionais de criação');await page.getByRole('button',{name:'Continuar para a IA',exact:true}).click();
 await page.getByRole('button',{name:/^Usar a IA do Compor/}).click();await page.getByRole('button',{name:'Continuar para referências',exact:true}).click();
 assert.equal(generation.length,0,'entering references does not generate');
 if(entry==='ready-chat'||entry.startsWith('project-exit-')){await page.getByRole('button',{name:/^(Preparar primeiro post|Continuar sem referências)$/}).click();await page.getByRole('button',{name:'Configurações do projeto',exact:true}).click();await page.getByRole('dialog',{name:'Configurações do projeto',exact:true}).getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:'Referências',exact:true}).click();}
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('upload');await page.locator('.reference-step input[type="file"]').setInputFiles({name:'referencia-antes-da-geracao.png',mimeType:'image/png',buffer:referencePixels});
 await waitStored(page,value=>value.state?.references.length===1&&value.state.adjustments.every(item=>['completed','failed'].includes(item.status)));
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
 await waitStored(page,value=>value.state?.workflow.latestExplorations?.references?.ordinal===103);
 assert.equal(generation.length,3);await page.getByRole('button',{name:'Pausar exploração',exact:true}).click();
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('search');await page.getByRole('button',{name:'Permitir nesta sessão',exact:true}).click();
 await page.getByRole('checkbox',{name:'Escolher referência: Editorial acolhedor',exact:true}).click();await page.getByRole('checkbox',{name:'Escolher referência: Editorial acolhedor',checked:true,exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('upload');await page.locator('.reference-step input[type="file"]').setInputFiles({name:'minha-referencia.png',mimeType:'image/png',buffer:referencePixels});
 await waitStored(page,value=>value.state?.references.length===3&&value.state.adjustments.every(item=>['completed','failed'].includes(item.status)));
 const workspaceId=(await stored(page)).state.workflow.referencePieceId;
 if(entry.startsWith('project-exit-')){
  const settings=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});
  if(entry==='project-exit-x')await settings.getByRole('button',{name:'Fechar configurações',exact:true}).click();
  if(entry==='project-exit-escape')await page.keyboard.press('Escape');
  if(entry==='project-exit-tab')await settings.getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:'Contexto',exact:true}).click();
  await waitStored(page,value=>value.state?.workflow.referenceHandoff==='references');
  if(entry==='project-exit-tab')await settings.getByRole('button',{name:'Fechar configurações',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome do post',exact:true}).waitFor();
 }else if(entry==='button'||entry==='post-exit-x'){
  await page.getByRole('button',{name:/^(Preparar primeiro post|Continuar sem referências)$/}).click();
  await page.getByRole('textbox',{name:'Nome do post',exact:true}).waitFor();
  const beforeCreation=await stored(page);
  assert.equal(posts.length,0,'references do not register a post');assert.equal(beforeCreation.bytes,null,'the internal reference workspace never becomes the post v0');
  assert.equal(beforeCreation.state.drafts.filter(item=>item.pieceId!==workspaceId).length,0);assert.equal(beforeCreation.state.workflow.referenceHandoff,'references');
 }else{
  await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();
  await page.locator('.guided-reference-chat').getByRole('textbox',{name:'Sua mensagem',exact:true}).fill('Crie outro post');await page.locator('.guided-reference-chat').getByRole('button',{name:'Enviar →',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome do post',exact:true}).waitFor();
  for(let i=0;i<100&&!actionResults.length;i++)await page.waitForTimeout(40);
  assert.equal(actionResults.length,1);assert.equal(actionResults[0].status,'declined');assert.equal(posts.length,0);
  const prepared=await stored(page);assert.equal(prepared.state.workflow.phase,'ready');assert.equal(prepared.state.workflow.referenceHandoff,'references');assert.equal(prepared.state.selection,null);
 }
 await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('  Convite para colaborar  ');
 assert.equal(posts.length,0,'naming a post is not confirmation');
 await page.getByRole('button',{name:'Continuar para criação',exact:true}).click();
 await page.getByAltText('Arte integral da versão selecionada',{exact:true}).waitFor();
 const seeded=await waitStored(page,value=>Boolean(value.bytes));
 assert.deepEqual(seeded.bytes,Array.from(generatedPixels));assert.notDeepEqual(seeded.bytes,Array.from(referencePixels));
 const draft=seeded.state.drafts.find(item=>item.pieceId===seeded.state.selection.pieceId&&item.baseVersion===0);
 assert.ok(draft);assert.equal(posts.length,1);assert.equal(posts[0].pieceId,draft.pieceId);assert.notEqual(draft.pieceId,workspaceId);assert.equal(posts[0].name,'Convite para colaborar');assert.equal(seeded.state.workflow.referenceHandoff,null);assert.equal(draft.approval.status,'unapproved');assert.equal(draft.creationContext.explorationSource.imageId,generation[2].requestId);assert.equal(draft.creationContext.explorationSource.ordinal,103);assert.deepEqual(draft.creationContext.references,[],'selected references before or after a text-only exploration get no unsupported image attribution');
 await page.reload();await page.getByAltText('Arte integral da versão selecionada',{exact:true}).waitFor();assert.deepEqual((await stored(page)).bytes,Array.from(generatedPixels));assert.equal(generation.length,3,'transition and reload never call image generation');
 if(entry==='post-exit-x'){
  await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:'Criar novo post',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('Post sem imagem');await page.getByRole('button',{name:'Continuar para criação',exact:true}).click();
  await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();
  const postModal=page.getByRole('dialog',{name:'Referências deste post',exact:true});
  await postModal.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');await postModal.getByRole('button',{name:'Pedir 3 propostas',exact:true}).click();
  await waitStored(page,value=>value.state?.workflow.latestExplorations?.[value.state.selection?.pieceId]?.ordinal===106);
  await postModal.getByRole('button',{name:'Fechar referências do post',exact:true}).click();await postModal.waitFor({state:'hidden'});
  const retained=await waitStored(page,value=>Boolean(value.bytes));assert.deepEqual(retained.bytes,Array.from(generatedPixels));
  assert.equal(retained.state.drafts.find(item=>item.pieceId===retained.state.selection.pieceId).creationContext.explorationSource.ordinal,106);
  assert.deepEqual(errors,[]);return;
 }
 // The post conversation is mounted only once while its references are open.
 const message=page.locator('.guided-conversation:not([hidden])').getByRole('textbox',{name:'Sua mensagem',exact:true});await message.fill('Texto preservado do post');
 await page.getByRole('button',{name:'Escolher mais referências',exact:true}).click();const modal=page.locator('.reference-step');await modal.waitFor();await page.getByRole('dialog',{name:'Referências deste post',exact:true}).waitFor();await page.getByRole('button',{name:'Comentar seleção',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Sua mensagem',exact:true}).count(),1);const modalMessage=modal.getByRole('textbox',{name:'Sua mensagem',exact:true});assert.equal(await modalMessage.inputValue(),'Texto preservado do post');await modalMessage.fill('Texto atualizado nas referências');
 await page.getByRole('button',{name:'Voltar às imagens',exact:true}).click();await page.getByRole('button',{name:'Voltar ao post',exact:true}).click();await modal.waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('.guided-conversation:not([hidden]) textarea')?.value==='Texto atualizado nas referências');assert.equal(await message.inputValue(),'Texto atualizado nas referências');assert.deepEqual((await stored(page)).bytes,Array.from(generatedPixels));
 // An agent request prepares a post without registering or inventing its identity.
 const actionsBefore=actionResults.length,agentPieceId=id(nextAgent);
 await message.fill('Crie outro post');await page.locator('.guided-conversation:not([hidden])').getByRole('button',{name:'Enviar →',exact:true}).click();
 await page.getByRole('textbox',{name:'Nome do post',exact:true}).waitFor();
 for(let i=0;i<100&&actionResults.length===actionsBefore;i++)await page.waitForTimeout(40);
 assert.equal(actionResults.length,actionsBefore+1,'the existing turn controller delivers the declined result before disappearing');assert.equal(actionResults.at(-1).status,'declined');assert.equal(actionResults.at(-1).pieceId,undefined);
 const pendingAgent=await waitStored(page,value=>value.state?.workflow.pendingPost?.pieceId===agentPieceId&&value.state.adjustments.every(turn=>['completed','failed'].includes(turn.status)));
 assert.equal(posts.length,1);assert.equal(pendingAgent.state.selection,null);assert.equal(pendingAgent.state.drafts.some(item=>item.pieceId===agentPieceId),false);assert.ok(pendingAgent.state.drafts.some(item=>item.pieceId===draft.pieceId));
 await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('Post solicitado na conversa');await page.getByRole('button',{name:'Continuar para criação',exact:true}).click();
 await waitStored(page,value=>value.state?.selection?.pieceId===agentPieceId&&value.state.workflow.pendingPost===null);assert.equal(posts.length,2);assert.equal(generation.length,3);
 // An in-flight confirmation locks conflicting navigation; B later starts independently.
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:'Configurações do projeto',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Configurações do projeto',exact:true});await settings.getByRole('navigation',{name:'Configurações',exact:true}).getByRole('button',{name:'Referências',exact:true}).click();await page.getByRole('button',{name:'Voltar aos posts',exact:true}).click();await settings.waitFor({state:'hidden'});
 await waitStored(page,value=>value.state?.workflow.referenceHandoff==='references');
 await page.getByRole('button',{name:'Criar novo post',exact:true}).click();await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('Post A');await page.getByRole('button',{name:'Continuar para criação',exact:true}).click();
 for(let i=0;i<100&&!heldCreation;i++)await page.waitForTimeout(40);assert.ok(heldCreation);
 assert.equal(await page.getByRole('button',{name:'Posts do projeto',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Configurações do projeto',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Cancelar',exact:true}).isDisabled(),true);
 releaseCreation();
 const afterA=await waitStored(page,value=>value.state?.selection?.pieceId===heldCreation.pieceId&&value.state.workflow.pendingPost===null&&value.state.workflow.referenceHandoff===null);
 assert.equal(afterA.state.drafts.find(item=>item.pieceId===heldCreation.pieceId).creationContext.explorationSource.ordinal,103);
 await page.getByRole('button',{name:'Posts do projeto',exact:true}).click();await page.getByRole('button',{name:'Criar novo post',exact:true}).click();
 const beforeB=await stored(page),pieceB=beforeB.state.workflow.pendingPost.pieceId;assert.notEqual(pieceB,heldCreation.pieceId);
 assert.equal(beforeB.state.drafts.some(item=>item.pieceId===pieceB),false);assert.equal(beforeB.state.workflow.referenceHandoff,null);assert.equal(posts.some(post=>post.pieceId===pieceB),false);
 await page.getByRole('textbox',{name:'Nome do post',exact:true}).fill('Post B');assert.equal((await stored(page)).state.workflow.pendingPost.pieceId,pieceB);assert.deepEqual(errors,[]);
});
