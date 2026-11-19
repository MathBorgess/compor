import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function waitForPage(page,predicate,message){
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){
  if(await page.evaluate(predicate))return;
  await delay(20);
 }
 assert.fail(message);
}

test('gesto explícito mostra recibos progressivos e espera entre duas rodadas',{skip:!existsSync(browserPath),timeout:30000},async t=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'parallel-loop-fixture.tsx',loader:'tsx',contents:`
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {useParallelExploration} from './studio/use-parallel-exploration.ts';import {ParallelExplorationProgress} from './studio/parallel-exploration-progress.tsx';
  import {createStudioState,createPost,addReference,prepareAdjustment,settleAdjustment,REFERENCE_SELECTION_EVENT} from './lib/studio-state.ts';import {validateExplorationPlan} from '@compor/agents-api/exploration-plan-contract';
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const visualMode=location.search.startsWith('?visual'),canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);const file=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));window.visualOriginal=Array.from(new Uint8Array(await file.arrayBuffer()));
  const reference={id:id(90),name:'Upload',mime:'image/png',size:file.size,width:2,height:2,source:location.search==='?visual-extra'?{kind:'generated',projectId:id(2),imageId:id(91)}:{kind:'local-upload'}};
  const initial=createStudioState({userId:id(1),projectId:id(2)}),state=visualMode?addReference(initial,reference):initial,key='sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const batches=new Map();window.calls=[];window.applied=[];window.completeBatches=0;window.holdGate=location.search==='?gate';
  window.fetch=async(path,options)=>{
   const body=JSON.parse(options.body);window.calls.push({path,body,ownCredential:options.headers['x-compor-openai-key']===key,mediaType:options.headers['content-type']});
   if(path.endsWith('/intent/epoch'))return Response.json({epoch:0});
   if(path.endsWith('/intent'))return Response.json({status:'created',epoch:body.expectedEpoch+1});
   if(path==='/api/studio/explorations/status'){if(window.holdGate){window.gateEntered=true;return new Promise(resolve=>{window.releaseGate=()=>resolve(Response.json({status:'awaiting_feedback'}));});}return Response.json({status:location.search.startsWith('?resume')||window.completeBatches>=2?'awaiting_feedback':'active'});}
   if(path==='/api/studio/exploration-batches/resume'){if(location.search==='?resume-lost')return Response.json({status:'unknown',retryAutomatically:false},{status:503});if(location.search==='?resume-hold'){window.resumeEntered=true;return new Promise(resolve=>{window.releaseResume=()=>resolve(Response.json({status:'resumed',intentEpoch:body.expectedEpoch,reviewEpoch:1,retryAutomatically:false}));});}return Response.json({status:'resumed',intentEpoch:body.expectedEpoch,reviewEpoch:1,retryAutomatically:false});}
   if(path.endsWith('/signals'))return Response.json({signals:[]});
   if(path.endsWith('/plan')){const version=body.visualInput?.version===2?2:1,plan=validateExplorationPlan({version,items:[1,2,3].map(position=>({position,creativePrompt:'caminho '+position,composition:'composição '+position,contrast:'contraste '+position,differenceFromOthers:'diferença '+position})),...(version===2?{referenceIds:body.visualInput.entries.map(entry=>entry.id)}:{})},body.context,body.visualInput);return Response.json({status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'});}
   if(path.endsWith('/execute')){batches.set(body.batchId,{ids:body.imageIds,reads:0});return new Promise(()=>{});}
   if(path==='/api/studio/exploration-batches/status'){const batch=batches.get(body.batchId);if(!batch)return Response.json({status:'absent',projectId:body.projectId,batchId:body.batchId});batch.reads++;const unknown=location.search==='?unknown',done=!unknown&&batch.reads>=2;if(done&&!batch.counted){batch.counted=true;window.completeBatches++;}return Response.json({batchId:body.batchId,projectId:body.projectId,pieceId:null,state:unknown?'unknown':done?'completed':'running',completedAt:null,nextAt:null,closedAt:null,images:batch.ids.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:unknown&&index===1?'unknown':done||index===2?'completed':'running',revision:done||index===2||unknown&&index===1?2:1,replacesImageId:null}))});}
   if(path.endsWith('/intent/revoke'))return Response.json({status:'revoked',epoch:2,revocationEpoch:2});
   throw Error('unexpected '+path);
  };
  function Screen(){const [authenticated,setAuthenticated]=useState(location.search!=='?reauth'),[source,setSource]=useState('byok'),[generation,setGeneration]=useState(0),[studio,setStudio]=useState(state),[visible,setVisible]=useState(true);const loop=useParallelExploration({userId:id(1),projectId:id(2),conversationId:'references',state:studio,getState:()=>studio,source,credentialEpoch:generation,hasApiKey:true,getApiKey:()=>source==='byok'?key:'',isAuthenticated:()=>authenticated,available:true,selectedVisualsAvailable:visualMode,selectedVisualsRequired:location.search==='?required',loadReference:async()=>({metadata:reference,file}),visible,idea:'Oficina',onCompleted:async(...args)=>{if(window.slowCallback){window.callbackEntered=true;await new Promise(resolve=>{window.releaseCallback=resolve;});window.slowCallback=false;}window.applied.push(args);}});function ask(){const requestId=crypto.randomUUID(),at=new Date().toISOString(),prepared=prepareAdjustment(createPost(studio,{pieceId:id(80)}),{requestId,messageId:crypto.randomUUID(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at,eventId:crypto.randomUUID()});setStudio(settleAdjustment(prepared,{requestId,status:'completed',result:{messageId:crypto.randomUUID(),text:'Posso seguir?'},createdAt:at,eventId:crypto.randomUUID()}));}return <><button disabled={!loop.epochReady} onClick={()=>void loop.start()}>Pedir propostas</button>{location.search==='?reauth'&&<button onClick={()=>setAuthenticated(true)}>Confirmar sessão</button>}<button onClick={loop.pause}>Pausar</button><button onClick={()=>{setSource('default');setGeneration(value=>value+1);}}>Trocar fonte</button><button onClick={()=>setVisible(false)}>Sair</button><button onClick={ask}>Perguntar</button><p role="status">{loop.status}</p>{loop.progress&&<ParallelExplorationProgress progress={loop.progress}/>}</>;}
  createRoot(document.getElementById('root')).render(<Screen/>);
 `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundled.outputFiles[0].text);}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.clock.install();await page.goto(`http://127.0.0.1:${server.address().port}/?reauth`);
 const proposals=page.getByRole('button',{name:'Pedir propostas'});
 await proposals.waitFor();
 assert.equal(await proposals.isDisabled(),true);
 assert.equal((await page.evaluate(()=>window.calls)).length,0);
 await page.getByRole('button',{name:'Confirmar sessão'}).click();
 await waitForPage(page,()=>!document.querySelector('button').disabled,'o botão de propostas continua bloqueado após confirmar a sessão');
 assert.deepEqual(await page.evaluate(()=>window.calls.map(call=>call.path)),['/api/studio/exploration-batches/intent/epoch']);
 await page.clock.pauseAt(new Date(Date.now()+1000));
 assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'abertura não planeja nem gera');
 await page.getByRole('button',{name:'Pedir propostas'}).click();await page.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1);
 await page.evaluate(()=>{window.slowCallback=true;});await page.clock.fastForward(3000);await waitForPage(page,()=>window.callbackEntered===true,'a última imagem ainda espera o callback');
 await page.clock.fastForward(20000);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'callback lento não consome espera visível');
 await page.evaluate(()=>window.releaseCallback());await page.getByText(/Próximo lote em/).waitFor();
 await page.clock.fastForward(14999);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'14.999 ms não iniciam novo lote');
 await page.clock.fastForward(1);await waitForPage(page,()=>window.calls.filter(call=>call.path.endsWith('/execute')).length===2,'o segundo lote começa depois de 15 s');
 await page.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 await page.clock.fastForward(3000);await page.getByText(/Próximo lote em 15s/).waitFor();
 await page.clock.fastForward(15000);await page.getByText('Aguardando sua decisão sobre as propostas.',{exact:true}).waitFor();
 await page.clock.fastForward(30000);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,2,'duas rodadas aguardam decisão');
 await page.getByRole('button',{name:'Pedir propostas'}).click();await waitForPage(page,()=>window.calls.filter(call=>call.path.endsWith('/execute')).length===3,'o terceiro lote exige novo pedido');
 const intentions=(await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/intent'));
 assert.deepEqual(intentions.map(call=>call.body.expectedEpoch),[0,1,2]);
 for(const action of ['Pausar','Trocar fonte','Sair','Perguntar']){
  const context=await browser.newContext();const other=await context.newPage();await other.clock.install();await other.goto(`http://127.0.0.1:${server.address().port}`);await other.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
  await other.getByRole('button',{name:'Pedir propostas'}).click();await other.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
  await other.getByRole('button',{name:action,exact:true}).click();await other.waitForFunction(()=>window.calls.some(call=>call.path.endsWith('/intent/revoke')));
  await other.clock.fastForward(30000);assert.equal((await other.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,action+' não repete execução');
  await other.reload();await other.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);assert.equal((await other.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'recarregar não envia efeitos');await context.close();
 }
 const hiddenContext=await browser.newContext(),hiddenPage=await hiddenContext.newPage();await hiddenPage.clock.install({time:new Date('2026-01-01T00:00:00Z')});await hiddenPage.goto(`http://127.0.0.1:${server.address().port}`);await hiddenPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
 // Exact remaining time must depend only on virtual time, including on a busy CI runner.
 await hiddenPage.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
 await hiddenPage.getByRole('button',{name:'Pedir propostas'}).click();await hiddenPage.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();await hiddenPage.clock.fastForward(3000);await hiddenPage.getByText(/Próximo lote em/).waitFor();
 await hiddenPage.clock.fastForward(5000);
 await hiddenPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await hiddenPage.getByText('Exploração pausada.',{exact:true}).waitFor();
 await waitForPage(hiddenPage,async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-parallel-exploration-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const value=await new Promise((resolve,reject)=>{const request=db.transaction('preparations').objectStore('preparations').get('00000000-0000-4000-8000-000000000001');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const journal=await new Promise((resolve,reject)=>{const request=db.transaction('journals').objectStore('journals').get(JSON.stringify([value.userId,value.projectId,value.batchId]));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();return journal.progress.wait.mode==='paused'&&journal.progress.wait.remainingMs===10000;},'a pausa preserva os 10 s restantes no journal');
 await hiddenPage.clock.fastForward(30000);await hiddenPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal((await hiddenPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'tempo oculto e retorno não iniciam novo lote');await hiddenContext.close();
 const gateContext=await browser.newContext(),gatePage=await gateContext.newPage();await gatePage.goto(`http://127.0.0.1:${server.address().port}/?gate`);await gatePage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
 await gatePage.getByRole('button',{name:'Pedir propostas'}).click();await gatePage.waitForFunction(()=>window.gateEntered===true);await gatePage.getByText('Verificando as condições para gerar propostas…',{exact:true}).waitFor();await gatePage.getByRole('button',{name:'Pausar'}).click();await gatePage.evaluate(()=>window.releaseGate());
 await gatePage.waitForTimeout(200);assert.equal((await gatePage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/resume')||call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'leitura atrasada após pausa não retoma gate nem envia efeitos');await gateContext.close();
 const questionContext=await browser.newContext(),questionPage=await questionContext.newPage();await questionPage.goto(`http://127.0.0.1:${server.address().port}`);await questionPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
 await questionPage.getByRole('button',{name:'Perguntar'}).click();await questionPage.waitForTimeout(200);
 assert.equal((await questionPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'pergunta não inicia geração');
 await questionPage.getByRole('button',{name:'Pedir propostas'}).click();await questionPage.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 assert.equal((await questionPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'pedido explícito permite um lote');await questionContext.close();
 for(const mode of ['resume','resume-lost']){
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(`http://127.0.0.1:${server.address().port}/?${mode}`);await page.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
  await page.getByRole('button',{name:'Pedir propostas'}).click();
  if(mode==='resume')await page.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();else await page.getByText('Não foi possível confirmar esta tentativa. Ela permanece preservada.',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.calls),intent=calls.findIndex(call=>call.path.endsWith('/intent')),resume=calls.findIndex(call=>call.path==='/api/studio/exploration-batches/resume'),plan=calls.findIndex(call=>call.path.endsWith('/plan'));
  assert(intent>=0&&resume>intent,'intenção confirmada antes de retomar');assert.equal(calls.filter(call=>call.path==='/api/studio/exploration-batches/resume').length,1);
  assert.equal(calls[resume].ownCredential,true);assert.equal(Object.hasOwn(calls[resume].body,'apiKey'),false);
  assert.equal(calls[resume].mediaType,'application/vnd.compor.byok+json');
  if(mode==='resume')assert(plan>resume,'planejamento depois da retomada protegida');else assert.equal(plan,-1,'resposta incerta não inicia planejamento');await context.close();
 }
 const resumeContext=await browser.newContext(),resumePage=await resumeContext.newPage();await resumePage.goto(`http://127.0.0.1:${server.address().port}/?resume-hold`);await resumePage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);await resumePage.getByRole('button',{name:'Pedir propostas'}).click();await resumePage.waitForFunction(()=>window.resumeEntered);await resumePage.getByRole('button',{name:'Pausar'}).click();await resumePage.evaluate(()=>window.releaseResume());await resumePage.waitForTimeout(200);assert.equal((await resumePage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'pausa durante retomada não planeja nem executa');await resumeContext.close();
 const unknownContext=await browser.newContext(),unknownPage=await unknownContext.newPage();await unknownPage.clock.install();await unknownPage.goto(`http://127.0.0.1:${server.address().port}/?unknown`);await unknownPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);
 await unknownPage.getByRole('button',{name:'Pedir propostas'}).click();await unknownPage.getByText('Resultado desconhecido',{exact:true}).waitFor();await unknownPage.waitForFunction(()=>window.calls.some(call=>call.path.endsWith('/intent/revoke')));
 await unknownPage.clock.fastForward(30000);const unknownCalls=await unknownPage.evaluate(()=>window.calls);assert.equal(unknownCalls.filter(call=>call.path==='/api/studio/exploration-batches/status').length,1);assert.equal(unknownCalls.filter(call=>call.path.endsWith('/execute')).length,1);await unknownContext.close();
 const blockedContext=await browser.newContext(),blockedPage=await blockedContext.newPage();await blockedPage.goto(`http://127.0.0.1:${server.address().port}/?required`);await blockedPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);await blockedPage.getByRole('button',{name:'Pedir propostas'}).click();await blockedPage.getByText('O envio das imagens selecionadas está indisponível.',{exact:true}).waitFor();assert.equal((await blockedPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/intent')||call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0);await blockedContext.close();
 const visualContext=await browser.newContext(),visualPage=await visualContext.newPage();await visualPage.goto(`http://127.0.0.1:${server.address().port}/?visual`);await visualPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);await visualPage.getByRole('button',{name:'Pedir propostas'}).click();await visualPage.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 const visualCalls=await visualPage.evaluate(()=>window.calls),visualPlan=visualCalls.find(call=>call.path.endsWith('/plan')).body,visualExecute=visualCalls.find(call=>call.path.endsWith('/execute')).body;
 assert.equal(visualPlan.visualInput.entries[0].inputOrigin,'local-upload');assert.equal(visualExecute.referenceImages[0].data,visualPlan.referenceImages[0].data);assert.deepEqual([...Buffer.from(visualPlan.referenceImages[0].data,'base64')],await visualPage.evaluate(()=>window.visualOriginal));
 assert.equal((await visualPage.evaluate(()=>window.applied[0][3].references[0].id)),'00000000-0000-4000-8000-000000000090');await visualContext.close();
 const extraContext=await browser.newContext(),extraPage=await extraContext.newPage();await extraPage.goto(`http://127.0.0.1:${server.address().port}/?visual-extra`);await extraPage.waitForFunction(()=>document.querySelector('button')&&!document.querySelector('button').disabled);await extraPage.getByRole('button',{name:'Pedir propostas'}).click();await extraPage.getByText(/Referências externas ou geradas ainda não estão disponíveis/).waitFor();
 assert.equal((await extraPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/intent')||call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0);await extraContext.close();
});
