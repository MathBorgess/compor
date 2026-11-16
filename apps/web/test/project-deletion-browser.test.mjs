import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {sessionCookie} from './session-cookie.mjs';
import {createStudioState,addCreativeCriterion,recordCreativeDecision} from '../lib/studio-state.ts';
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

test('excluir o último projeto pelo menu preserva os aprendizados no perfil da conta após reload',{timeout:90000},async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],creative=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addCookies([sessionCookie(origin)]);
 const title='Projeto de matemática',at='2026-11-16T15:00:00.000Z';let deletedAt=null,profileReads=0;
 const signals=[{kind:'reference',id:id(10),projectId:project,pieceId:null,action:'comment',comment:'Quero exemplos visuais simples.',supersedes:null,createdAt:at,originUrl:'https://www.pinterest.com/pin/123/',title:'Matemática visual'}];
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/projects'){
   if(request.method()==='DELETE'){assert.deepEqual(request.postDataJSON(),{projectId:project,expectedRevision:1});deletedAt=at;return route.fulfill({json:{status:'deleted',projectId:project}});}
   return route.fulfill({json:{projects:deletedAt?[]:[{id:project,title,revision:1}]}});
  }
  if(path==='/api/profile'){profileReads++;assert.equal(request.method(),'POST');assert.deepEqual(request.postDataJSON(),{offset:0});return route.fulfill({json:{userId:alice,projects:[{id:project,title,deletedAt}],signals,nextOffset:null,limitedSources:[]}});}
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/posts')return route.fulfill({json:{posts:[]}});
  if(request.method()==='POST')creative.push(path);
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 try{
  await page.goto(origin);await page.getByRole('button',{name:`${title} Abrir projeto`,exact:true}).waitFor();
  const states=[alice,bob].map(userId=>{
   let state=createStudioState({userId,projectId:project});
   state=addCreativeCriterion(state,{id:id(11),viewpoint:'creator',dimension:'visual',statement:userId===alice?'Espaço entre os exemplos':'Critério da outra conta',example:{description:'Uma ideia por quadro',referenceId:null},counterexample:{description:'Texto compacto',referenceId:null},provenance:'creator_report',source:'Conversa do projeto',tension:''});
   return recordCreativeDecision(state,{id:id(12),criterionId:id(11),choice:'accept',reason:'Ajudar na leitura',at});
  });
  await page.evaluate(async states=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-studio-v1',4);request.onupgradeneeded=()=>{for(const [name,key] of [['states','scope'],['legacyStates','scope'],['stateArchives','key'],['references','key'],['draftAssets','key']]){const store=request.result.createObjectStore(name,{keyPath:key});if(['references','draftAssets'].includes(name))store.createIndex('scope','scope');}};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   try{await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite');for(const state of states)tx.objectStore('states').put({scope:JSON.stringify([state.userId,state.projectId]),state});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}
  },states);
  async function checkProfile(deleted){
   const readsBefore=profileReads;
   await page.locator('.studio-account-menu > summary').click();await page.getByRole('button',{name:'Seu perfil',exact:true}).click();
   const profile=page.getByRole('dialog',{name:'Seu perfil',exact:true});try{await profile.getByText(title,{exact:true}).waitFor({timeout:8000});}catch(error){throw new Error(`Perfil indisponível após ${profileReads} leituras: ${await page.locator('body').innerText()}; erros=${JSON.stringify(errors)}; dialogs=${await page.locator('dialog').evaluateAll(nodes=>nodes.map(node=>node.outerHTML))}`,{cause:error});}await profile.locator('.profile-project > summary').click();
   await profile.getByText('Espaço entre os exemplos',{exact:true}).waitFor();assert.equal(await profile.getByText('Quero exemplos visuais simples.',{exact:true}).isVisible(),true);assert.equal(await profile.getByText('Aceito',{exact:true}).isVisible(),true);
   assert.equal(await profile.getByText('Critério da outra conta',{exact:true}).count(),0);assert.equal(await profile.getByText('Excluído da lista',{exact:true}).count(),deleted?1:0);assert.ok(profileReads>readsBefore,'cada abertura consulta o perfil atual da conta');
   await profile.getByRole('button',{name:'Fechar perfil',exact:true}).click();await profile.waitFor({state:'hidden'});
  }
  await checkProfile(false);
  await page.getByRole('button',{name:`${title} Abrir projeto`,exact:true}).click();
  const menu=page.getByRole('navigation',{name:'Menu do projeto',exact:true});await menu.getByRole('button',{name:'Expandir menu',exact:true}).click();await menu.getByRole('button',{name:'Excluir projeto',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'Excluir projeto?',exact:true});await confirmation.getByRole('button',{name:'Excluir projeto',exact:true}).click();
  await page.getByText('Seus projetos aparecerão aqui. Comece com uma ideia acima.',{exact:true}).waitFor();await checkProfile(true);
  await page.reload();await page.getByText('Seus projetos aparecerão aqui. Comece com uma ideia acima.',{exact:true}).waitFor();await checkProfile(true);
  assert.deepEqual(creative,[]);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
after(async()=>{stopping.abort();try{await browser?.close();}finally{await stopApp(child);}});

test('excluir exige confirmação, mantém o projeto ao cancelar e confirma persistência após reload',{timeout:90000},async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addCookies([sessionCookie(origin)]);
 let projects=[{id:project,title:'Projeto de matemática',revision:1}],deletes=0,fail=false;
 await page.route('**/auth/session',route=>route.fulfill({json:{state:'connected',userId:alice}}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/ai/credential-status')return route.fulfill({json:{defaultAvailable:false}});
  if(path==='/api/projects'){
   if(request.method()==='DELETE'){
    deletes++;assert.deepEqual(request.postDataJSON(),{projectId:project,expectedRevision:1});
    if(fail)return route.fulfill({status:502,json:{error:'result_unknown'}});
    projects=[];return route.fulfill({json:{status:'deleted',projectId:project}});
   }
   return route.fulfill({json:{projects}});
  }
  return route.fulfill({status:503,json:{error:'unexpected'}});
 });
 try{
  await page.goto(origin);const remove=page.locator('.studio-project-entry').filter({hasText:'Projeto de matemática'}).getByRole('button',{name:'Excluir projeto',exact:true});await remove.waitFor();
  const card=await page.locator('.studio-project-card').boundingBox(),icon=await remove.boundingBox();
  assert.ok(icon.x>=card.x&&icon.y>=card.y&&icon.x+icon.width<=card.x+card.width&&icon.y+icon.height<=card.y+card.height,'a lixeira fica dentro do card');
  assert.ok(icon.width>=44&&icon.height>=44,'o alvo de toque continua acessível');
  assert.equal(await remove.innerText(),'','o botão exibe apenas o ícone');
  await remove.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Excluir projeto?',exact:true});await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(deletes,0);assert.equal(await remove.isVisible(),true);
  fail=true;await remove.click();await dialog.getByRole('button',{name:'Excluir projeto',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(deletes,1);await page.waitForTimeout(200);assert.equal(deletes,1);
  await dialog.getByRole('button',{name:'Atualizar projetos',exact:true}).click();await remove.waitFor();assert.equal(await remove.isVisible(),true);
  fail=false;await remove.click();await dialog.getByRole('button',{name:'Excluir projeto',exact:true}).click();await remove.waitFor({state:'hidden'});assert.equal(deletes,2);
  await page.reload();await page.getByText('Seus projetos aparecerão aqui. Comece com uma ideia acima.',{exact:true}).waitFor();assert.equal(await remove.count(),0);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
