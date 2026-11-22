import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {basename} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright-core';
import {waitForApp,stopApp} from './wait-for-app.mjs';
import {openSettings} from './guided-navigation.mjs';
import {validateExplorationPlan} from '../../../packages/agents-api/src/exploration-plan-contract.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,userId=id(1),projectId=id(2);
test('o estúdio recupera um plano revogado e executa o mesmo lote por gesto com IA padrão',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../pages/parallel-studio-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('index.jsx',`file://${fixture}/`),`'use client';import {useEffect,useState} from 'react';import StudioApp from '../../studio/studio-app';export default function Fixture(){const [serial,setSerial]=useState(false);useEffect(()=>setSerial(location.search==='?serial'),[]);return <StudioApp userId="${userId}" hasApiKey={true} canUseAI={true} credentialSource="default" credentialEpoch={0} defaultAvailable={true} parallelAvailable={!serial} selectedVisualsRequired={serial} selectedVisualsAvailable={serial} getApiKey={()=>''} keyInput={<span>Conectada</span>} onRemoveKey={()=>{}} initialObjective="Oficina de cerâmica" isAuthenticated={()=>true}/>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 const calls=[],batches=new Map(),errors=[];
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
 let imagesReady=false;
 let confirmRevocation;
 const revocation=new Promise(resolve=>{confirmRevocation=resolve;});
 t.after(()=>confirmRevocation());page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;calls.push({path,body,method:request.method()});
  if(path==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Projeto paralelo',revision:1,created_at:'2026-11-17T12:00:00Z'}]}});
  if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
  if(path==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:png});
  if(path==='/api/studio/explorations'&&request.method()==='GET'){
   const images=imagesReady?[...batches.values()].flatMap(batch=>batch.imageIds.map((imageId,index)=>({id:imageId,project_id:projectId,state:'completed',created_at:new Date().toISOString(),ordinal:index+1,batch_id:batch.batchId,batch_position:index+1}))):[];
   return route.fulfill({json:{images}});
  }
  if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
  if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
  if(path.endsWith('/intent/epoch'))return route.fulfill({json:{epoch:0}});
  if(path.endsWith('/intent'))return route.fulfill({json:{status:'created',epoch:body.expectedEpoch+1}});
  if(path.endsWith('/intent/state'))return route.fulfill({json:{state:'revoked',epoch:2,revocationEpoch:2}});
  if(path.endsWith('/plan')){
   if(body.op==='submit')return route.fulfill({status:202,json:{status:'running',retryAutomatically:false,requestId:body.requestId}});
   const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},body.context);return route.fulfill({json:{status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'}});}
  if(path.endsWith('/execute')){batches.set(body.batchId,body);return route.fulfill({json:{status:'running',batchId:body.batchId,retryAutomatically:false}});}
  if(path==='/api/studio/exploration-batches/status'){const batch=batches.get(body.batchId);if(!batch)return route.fulfill({json:{status:'absent',projectId,batchId:body.batchId}});return route.fulfill({json:{projectId,batchId:body.batchId,pieceId:null,state:imagesReady?'completed':'running',completedAt:imagesReady?new Date().toISOString():null,nextAt:imagesReady?new Date(Date.now()+15000).toISOString():null,closedAt:null,images:batch.imageIds.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:imagesReady?'completed':'running',revision:imagesReady?2:1,replacesImageId:null}))}});}
  if(path.endsWith('/intent/revoke')){
   await revocation;
   return route.fulfill({json:{status:'revoked',epoch:2,revocationEpoch:2}});
  }
  return route.fulfill({status:503,json:{error:'unavailable'}});
 });
 await page.goto(`${origin}/${basename(fixture)}`);await page.getByRole('button',{name:/Projeto paralelo/}).click();
 const contextPanel=await openSettings(page,'Contexto');await contextPanel.locator('summary').filter({hasText:'Oferta'}).first().click();await contextPanel.getByLabel('Oferta',{exact:true}).fill('Oficina de cerâmica');
 await openSettings(page,'Referências');
 await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 assert.equal(calls.filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'abrir referências não inicia efeitos');
 const button=page.getByRole('button',{name:'Pedir 3 propostas',exact:true});await button.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Pedir 3 propostas'&&!button.disabled));
 const submitted=page.waitForResponse(response=>response.url().endsWith('/plan')&&response.request().postDataJSON().op==='submit'&&response.status()===202);
 await button.click();await submitted;
 await page.getByRole('progressbar',{name:'Carregando propostas'}).waitFor();
 const modal=page.getByRole('dialog',{name:'Configurações do projeto'});
 assert.equal(await modal.getByRole('button',{name:'Fechar configurações'}).isDisabled(),true);
 await page.keyboard.press('Escape');
 assert.equal(await modal.isVisible(),true,'Escape não encerra a exploração sem pausar');
 assert.equal(calls.filter(call=>call.path.endsWith('/intent/revoke')).length,0);
 await page.getByRole('button',{name:'Pausar exploração'}).click();
 const inspect=page.getByRole('button',{name:'Consultar tentativa anterior'});
 await inspect.waitFor();
 confirmRevocation();
 await page.waitForFunction(async userId=>{
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-parallel-exploration-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const request=db.transaction('preparations','readonly').objectStore('preparations').get(userId);request.onsuccess=()=>resolve(request.result?.revocationEpoch===2);request.onerror=()=>reject(request.error);});}
  finally{db.close();}
 },userId);
 await inspect.click();
 await page.getByText('Plano recuperado. A execução permanece pausada.',{exact:true}).waitFor();
 assert.equal(calls.filter(call=>call.path.endsWith('/execute')).length,0,'consultar o plano não inicia imagens');
 const executed=page.waitForResponse(response=>response.ok()&&response.url().endsWith('/execute'));
 await page.getByRole('button',{name:'Continuar mesmo plano'}).click();
 try{await executed;await page.waitForFunction(()=>document.body.textContent.includes('Aguardando confirmação das propostas'));}catch(error){throw Error(`Estado: ${JSON.stringify({statuses:await page.getByRole('status').allTextContents(),calls:calls.map(({path,body})=>({path,op:body?.op})),errors})}`,{cause:error});}
 const submits=calls.filter(call=>call.path.endsWith('/plan')&&call.body.op==='submit');
 const executions=calls.filter(call=>call.path.endsWith('/execute'));
 const intents=calls.filter(call=>call.path.endsWith('/intent'));
 assert.equal(submits.length,1,'o plano original não é solicitado outra vez');
 assert.equal(executions.length,1);
 assert.equal(intents.length,2);
 assert.notEqual(intents[0].body.intentId,intents[1].body.intentId);
 assert.equal(intents[1].body.expectedEpoch,2);
 assert.equal(executions[0].body.intentId,intents[1].body.intentId);
 assert.equal(executions[0].body.planRequestId,submits[0].body.requestId);
 assert.equal(Object.hasOwn(submits[0].body,'apiKey'),false,'IA padrão é resolvida no servidor');
 imagesReady=true;
 for(const ordinal of [1,2,3]){
  const choice=page.getByRole('checkbox',{name:`Escolher imagem ${ordinal}`,exact:true});
  await choice.waitFor();
  assert.equal(await choice.isEnabled(),true,'a escolha é liberada após o lote');
 }
 await page.waitForFunction(()=>[...document.querySelectorAll('.studio-exploration-grid img')].filter(image=>image.complete&&image.naturalWidth>0).length===3);
 assert.equal(await modal.getByRole('button',{name:'Fechar configurações'}).isEnabled(),true);
 await page.getByRole('button',{name:'Pausar exploração'}).click();
 const before=calls.length,marker=JSON.stringify({projectId,requestId:id(77),sequence:0,conversationId:'references'});
 await page.evaluate(({userId,marker})=>localStorage.setItem('compor-exploration-pending:'+userId,marker),{userId,marker});
 await page.goto(`${origin}/${basename(fixture)}?serial`);await page.getByRole('button',{name:/Projeto paralelo/}).click();await openSettings(page,'Referências');await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
 try{await page.getByRole('button',{name:'Consultar tentativa sequencial'}).click();}catch(error){throw Error(`Estado serial: ${JSON.stringify({body:(await page.locator('body').innerText()).slice(-4500),errors})}`,{cause:error});}await page.getByText(/tentativa anterior ainda não foi confirmada/i).waitFor();
 assert.equal(await page.evaluate(userId=>localStorage.getItem('compor-exploration-pending:'+userId),userId),marker);
 assert.equal((await page.getByRole('button',{name:'Pedir 3 propostas',exact:true}).isDisabled()),true);
 assert.equal(calls.slice(before).filter(call=>call.method==='POST'&&(call.path==='/api/studio/explorations'||call.path.endsWith('/plan')||call.path.endsWith('/execute')||call.path.endsWith('/intent'))).length,0);
 assert.deepEqual(errors,[]);
});

test('um único lote abre seleção fora de inert, pausa no timer sem segunda rodada e recupera resultado incerto pelo mesmo recibo',{skip:!existsSync(browserPath),timeout:90000},async t=>{
 const fixture=await mkdtemp(new URL('../pages/parallel-studio-pause-test-',import.meta.url));let child,browser;
 t.after(async()=>{try{await browser?.close();}finally{try{await stopApp(child);}finally{await rm(fixture,{recursive:true,force:true});}}});
 await writeFile(new URL('index.jsx',`file://${fixture}/`),`'use client';import StudioApp from '../../studio/studio-app';export default function Fixture(){return <StudioApp userId="${userId}" hasApiKey={true} canUseAI={true} credentialSource="default" credentialEpoch={0} defaultAvailable={true} parallelAvailable={true} getApiKey={()=>''} keyInput={<span>Conectada</span>} onRemoveKey={()=>{}} initialObjective="Oficina de cerâmica" isAuthenticated={()=>true}/>;}`);
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));const origin=`http://127.0.0.1:${port}`;
 let startup='';child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:['ignore','pipe','pipe'],env:{...process.env,APP_ORIGIN:origin}});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{startup=(startup+chunk).slice(-6000);});
 await waitForApp({url:`${origin}/${basename(fixture)}`,child,signal:t.signal,diagnostics:()=>startup});
 browser=await chromium.launch({executablePath:browserPath,headless:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');

 // Cenário A: Um único clique explícito -> 3 imagens carregadas -> espera sincronizada no timer -> seleção habilitada fora de inert -> pausa na mesma execução ativa -> avançar relógio > 15s sem segunda reserva
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.clock.install({time:new Date('2026-11-21T20:45:00Z')});
  const calls=[],batches=new Map(),errors=[];
  let statusMode='running';
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;
   calls.push({path,body,method:request.method()});
   if(path==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Teste de propostas 21-11',revision:1,created_at:'2026-11-21T20:40:00Z'}]}});
   if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
   if(path==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:png});
   if(path==='/api/studio/explorations'&&request.method()==='GET'){
    const images=statusMode==='completed'?[...batches.values()].flatMap(batch=>batch.imageIds.map((imageId,index)=>({id:imageId,project_id:projectId,state:'completed',created_at:'2026-11-21T20:45:27Z',ordinal:index+1,batch_id:batch.batchId,batch_position:index+1}))):[];
    return route.fulfill({json:{images}});
   }
   if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
   if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
   if(path.endsWith('/intent/epoch'))return route.fulfill({json:{epoch:0}});
   if(path.endsWith('/intent'))return route.fulfill({json:{status:'created',epoch:body.expectedEpoch+1}});
   if(path.endsWith('/intent/revoke'))return route.fulfill({json:{status:'revoked',epoch:2,revocationEpoch:2}});
   if(path.endsWith('/plan')){
    const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},body.context);
    return route.fulfill({json:{status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'}});
   }
   if(path.endsWith('/execute')){batches.set(body.batchId,body);return route.fulfill({json:{status:'running',batchId:body.batchId,retryAutomatically:false}});}
   if(path==='/api/studio/exploration-batches/status'){
    const batch=batches.get(body.batchId);
    if(!batch)return route.fulfill({json:{status:'absent',projectId,batchId:body.batchId}});
    return route.fulfill({json:{projectId,batchId:body.batchId,pieceId:null,state:statusMode==='completed'?'completed':'running',completedAt:statusMode==='completed'?'2026-11-21T20:45:27Z':null,nextAt:statusMode==='completed'?'2026-11-21T20:45:42Z':null,closedAt:null,images:batch.imageIds.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:statusMode==='completed'?'completed':'running',revision:statusMode==='completed'?2:1,replacesImageId:null}))}});
   }
   return route.fulfill({status:503,json:{error:'unavailable'}});
  });

  await page.goto(`${origin}/${basename(fixture)}`);
  await page.getByRole('button',{name:/Teste de propostas 21-11/}).click();
  const contextPanel=await openSettings(page,'Contexto');
  await contextPanel.locator('summary').filter({hasText:'Oferta'}).first().click();
  await contextPanel.getByLabel('Oferta',{exact:true}).fill('Oficina de cerâmica');
  await openSettings(page,'Referências');
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  const askButton=page.getByRole('button',{name:'Pedir 3 propostas',exact:true});
  await askButton.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Pedir 3 propostas'&&!button.disabled));

  // Congela relógio virtual antes do clique explícito e mantém espera + pausa na mesma execução ativa
  await page.clock.pauseAt(new Date('2026-11-21T20:45:13Z'));
  const executeSeen=page.waitForResponse(response=>response.url().endsWith('/execute')&&response.ok());
  await askButton.click();
  await executeSeen;
  await page.getByRole('progressbar',{name:'Carregando propostas'}).waitFor();
  assert.equal(await page.locator('.reference-gallery-surface').evaluate(el=>el.hasAttribute('inert')),true,'galeria permanece inert durante a geração');

  // Confirma as 3 imagens e avança o intervalo de observação (3s) para entrar na janela entre lotes
  statusMode='completed';
  await page.clock.fastForward(3000);
  const timer=page.locator('.reference-exploration-status [role="timer"]');
  await timer.waitFor();
  assert.match(await timer.innerText(),/Próximo lote em 15s\./);

  // Confirma 3 imagens carregadas e os 3 controles de seleção habilitados e fora de qualquer área inert
  await page.waitForFunction(()=>[...document.querySelectorAll('.studio-exploration-grid img')].filter(image=>image.complete&&image.naturalWidth>0).length===3);
  assert.equal(await page.locator('.reference-gallery-surface').evaluate(el=>el.hasAttribute('inert')),false,'janela entre lotes libera a galeria do inert');
  for(const ordinal of [1,2,3]){
   const choice=page.getByRole('checkbox',{name:`Escolher imagem ${ordinal}`,exact:true});
   await choice.waitFor();
   assert.equal(await choice.isEnabled(),true,`opção ${ordinal} habilitada na janela entre lotes`);
   assert.equal(await choice.evaluate(el=>el.closest('[inert]')===null),true,`opção ${ordinal} fora de área inert`);
  }

  // Aciona a pausa na mesma execução ativa e valida encerramento imediato sob relógio congelado
  await page.getByRole('button',{name:'Pausar exploração',exact:true}).click();
  await page.locator('.reference-exploration-status').getByText('Exploração pausada.',{exact:true}).waitFor();
  assert.equal(await timer.count(),0,'contador entre lotes some ao pausar');
  await page.waitForFunction(()=>!document.body.textContent.includes('Concluindo a pausa da tentativa anterior'));

  // Avança o relógio além dos 15s e prova que houve exatamente 1 reserva e nenhuma segunda rodada ou reenvio
  await page.clock.fastForward(30000);
  assert.equal(calls.filter(c=>c.path.endsWith('/execute')).length,1,'exatamente uma reserva de lote');
  assert.equal(calls.filter(c=>c.path.endsWith('/plan')&&c.body?.op==='submit').length,1,'nenhum segundo planejamento');
  assert.equal(calls.filter(c=>c.path.endsWith('/intent')).length,1,'nenhuma segunda intenção');
  assert.deepEqual(errors,[]);
  await context.close();
 }

 // Cenário B: Pausa durante execução já despachada preserva resultados e consulta o mesmo recibo quando resultado está incerto
 {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  await page.clock.install({time:new Date('2026-11-21T20:50:00Z')});
  const calls=[],batches=new Map(),errors=[];
  let slot2State='running',slot2Revision=1;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,body=request.method()==='POST'?request.postDataJSON():null;
   calls.push({path,body,method:request.method()});
   if(path==='/api/projects')return route.fulfill({json:{projects:[{id:projectId,title:'Teste de propostas 21-11',revision:1,created_at:'2026-11-21T20:40:00Z'}]}});
   if(path==='/api/pieces')return route.fulfill({json:{versions:[]}});
   if(path==='/api/studio/explorations/image')return route.fulfill({contentType:'image/png',body:png});
   if(path==='/api/studio/explorations'&&request.method()==='GET'){
    const images=[...batches.values()].flatMap(batch=>batch.imageIds.map((imageId,index)=>({id:imageId,project_id:projectId,state:index===1?slot2State:'completed',created_at:'2026-11-21T20:50:10Z',ordinal:index+1,batch_id:batch.batchId,batch_position:index+1})));
    return route.fulfill({json:{images}});
   }
   if(path.endsWith('/signals'))return route.fulfill({json:{signals:[]}});
   if(path==='/api/studio/explorations/status')return route.fulfill({json:{status:'active'}});
   if(path.endsWith('/intent/epoch'))return route.fulfill({json:{epoch:0}});
   if(path.endsWith('/intent'))return route.fulfill({json:{status:'created',epoch:body.expectedEpoch+1}});
   if(path.endsWith('/intent/revoke'))return route.fulfill({json:{status:'revoked',epoch:2,revocationEpoch:2}});
   if(path.endsWith('/plan')){
    const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},body.context);
    return route.fulfill({json:{status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'}});
   }
   if(path.endsWith('/execute')){batches.set(body.batchId,body);return route.fulfill({json:{status:'running',batchId:body.batchId,retryAutomatically:false}});}
   if(path==='/api/studio/exploration-batches/status'){
    const batch=batches.get(body.batchId);
    if(!batch)return route.fulfill({json:{status:'absent',projectId,batchId:body.batchId}});
    const batchState=slot2State==='completed'?'completed':slot2State==='unknown'?'unknown':'running';
    return route.fulfill({json:{projectId,batchId:body.batchId,pieceId:null,state:batchState,completedAt:batchState==='completed'?'2026-11-21T20:50:20Z':null,nextAt:null,closedAt:null,images:batch.imageIds.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:index===1?slot2State:'completed',revision:index===1?slot2Revision:2,replacesImageId:null}))}});
   }
   return route.fulfill({status:503,json:{error:'unavailable'}});
  });

  await page.goto(`${origin}/${basename(fixture)}`);
  await page.getByRole('button',{name:/Teste de propostas 21-11/}).click();
  const contextPanel=await openSettings(page,'Contexto');
  await contextPanel.locator('summary').filter({hasText:'Oferta'}).first().click();
  await contextPanel.getByLabel('Oferta',{exact:true}).fill('Oficina de cerâmica');
  await openSettings(page,'Referências');
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('compor');
  const askButton=page.getByRole('button',{name:'Pedir 3 propostas',exact:true});
  await askButton.waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Pedir 3 propostas'&&!button.disabled));

  await page.clock.pauseAt(new Date('2026-11-21T20:50:05Z'));
  await askButton.click();
  await page.locator('.reference-exploration-status').getByText('2 de 3 imagens confirmadas.',{exact:true}).waitFor();

  // Pausa enquanto a imagem 2 ainda está pendente (já despachada)
  await page.getByRole('button',{name:'Pausar exploração',exact:true}).click();
  await page.locator('.reference-exploration-status').getByText('Exploração pausada.',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.body.textContent.includes('Concluindo a pausa da tentativa anterior'));
  assert.equal(calls.filter(c=>c.path.endsWith('/intent/revoke')).length,1,'pausa solicita revogação da intenção');
  await page.clock.fastForward(30000);
  assert.equal(calls.filter(c=>c.path.endsWith('/execute')).length,1,'nenhum novo lote após pausa durante execução');

  const originalBatchId=[...batches.keys()][0];
  // Resultado da imagem 2 fica incerto: consulta pelo mesmo recibo preserva incerteza e os resultados já despachados
  slot2State='unknown';slot2Revision=2;
  const inspectButton=page.getByRole('button',{name:'Consultar tentativa anterior',exact:true});
  await inspectButton.waitFor();
  await inspectButton.click();
  await page.getByText('A consulta terminou. Os resultados ainda não confirmados permanecem preservados.',{exact:true}).waitFor();
  await page.getByText('Resultado desconhecido',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.path==='/api/studio/exploration-batches/status').at(-1).body.batchId,originalBatchId,'consulta usa o mesmo recibo de lote');
  assert.equal(calls.filter(c=>c.path.endsWith('/execute')).length,1,'consulta de incerto não reenvia despacho');

  // Quando o servidor confirma a imagem 2 no mesmo recibo, nova consulta confirma as 3 mantendo continuação pausada
  slot2State='completed';slot2Revision=3;
  await inspectButton.click();
  await page.getByText('As imagens foram confirmadas. A continuação permanece pausada.',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.path==='/api/studio/exploration-batches/status').at(-1).body.batchId,originalBatchId);
  await page.waitForFunction(()=>[...document.querySelectorAll('.studio-exploration-grid img')].filter(image=>image.complete&&image.naturalWidth>0).length===3);
  await page.clock.fastForward(30000);
  assert.equal(calls.filter(c=>c.path.endsWith('/execute')).length,1,'consulta confirmada não inicia segunda rodada automaticamente');
  assert.equal(calls.filter(c=>c.path.endsWith('/plan')&&c.body?.op==='submit').length,1);
  assert.deepEqual(errors,[]);
  await context.close();
 }
});
