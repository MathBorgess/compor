import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('gesto explícito mostra recibos progressivos e espera entre duas rodadas',{skip:!existsSync(browserPath),timeout:30000},async t=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'parallel-loop-fixture.tsx',loader:'tsx',contents:`
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {useParallelExploration} from './app/use-parallel-exploration.ts';import {ParallelExplorationProgress} from './app/parallel-exploration-progress.tsx';
  import {createStudioState,createPost,prepareAdjustment,settleAdjustment,REFERENCE_SELECTION_EVENT} from './lib/studio-state.ts';import {validateExplorationPlan} from '@compor/agents-api/exploration-plan-contract';
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const state=createStudioState({userId:id(1),projectId:id(2)}),key='sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const batches=new Map();window.calls=[];window.applied=[];window.completeBatches=0;window.holdGate=location.search==='?gate';
  window.fetch=async(path,options)=>{
   const body=JSON.parse(options.body);window.calls.push({path,body});
   if(path.endsWith('/intent/epoch'))return Response.json({epoch:0});
   if(path.endsWith('/intent'))return Response.json({status:'created',epoch:body.expectedEpoch+1});
   if(path==='/api/studio/explorations/status'){if(window.holdGate){window.gateEntered=true;return new Promise(resolve=>{window.releaseGate=()=>resolve(Response.json({status:'awaiting_feedback'}));});}return Response.json({status:window.completeBatches>=2?'awaiting_feedback':'active'});}
   if(path.endsWith('/signals'))return Response.json({signals:[]});
   if(path.endsWith('/plan')){const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:'caminho '+position,composition:'composição '+position,contrast:'contraste '+position,differenceFromOthers:'diferença '+position}))},body.context);return Response.json({status:'completed',retryAutomatically:false,requestId:body.requestId,batchId:body.batchId,plan,planBinding:'synthetic-proof'});}
   if(path.endsWith('/execute')){batches.set(body.batchId,{ids:body.imageIds,reads:0});return new Promise(()=>{});}
   if(path==='/api/studio/exploration-batches/status'){const batch=batches.get(body.batchId);if(!batch)return Response.json({status:'absent',projectId:body.projectId,batchId:body.batchId});batch.reads++;const done=batch.reads>=2;if(done&&!batch.counted){batch.counted=true;window.completeBatches++;}return Response.json({batchId:body.batchId,projectId:body.projectId,pieceId:null,state:done?'completed':'running',completedAt:null,nextAt:null,closedAt:null,images:batch.ids.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:done||index===2?'completed':'running',revision:done||index===2?2:1,replacesImageId:null}))});}
   if(path.endsWith('/intent/revoke'))return Response.json({status:'revoked',epoch:2,revocationEpoch:2});
   throw Error('unexpected '+path);
  };
  function Screen(){const [source,setSource]=useState('byok'),[generation,setGeneration]=useState(0),[studio,setStudio]=useState(state),[visible,setVisible]=useState(true);const loop=useParallelExploration({userId:id(1),projectId:id(2),conversationId:'references',state:studio,getState:()=>studio,source,credentialEpoch:generation,hasApiKey:true,getApiKey:()=>source==='byok'?key:'',isAuthenticated:()=>true,available:true,visible,idea:'Oficina',onCompleted:async(...args)=>{if(window.slowCallback){window.callbackEntered=true;await new Promise(resolve=>{window.releaseCallback=resolve;});window.slowCallback=false;}window.applied.push(args);}});function ask(){const requestId=crypto.randomUUID(),at=new Date().toISOString(),prepared=prepareAdjustment(createPost(studio,{pieceId:id(80)}),{requestId,messageId:crypto.randomUUID(),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:at,eventId:crypto.randomUUID()});setStudio(settleAdjustment(prepared,{requestId,status:'completed',result:{messageId:crypto.randomUUID(),text:'Posso seguir?'},createdAt:at,eventId:crypto.randomUUID()}));}return <><button disabled={!loop.epochReady} onClick={()=>void loop.start()}>Pedir propostas</button><button onClick={loop.pause}>Pausar</button><button onClick={()=>{setSource('default');setGeneration(value=>value+1);}}>Trocar fonte</button><button onClick={()=>setVisible(false)}>Sair</button><button onClick={ask}>Perguntar</button><p role="status">{loop.status}</p>{loop.progress&&<ParallelExplorationProgress progress={loop.progress}/>}</>;}
  createRoot(document.getElementById('root')).render(<Screen/>);
 `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundled.outputFiles[0].text);}else response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.clock.install();await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Pedir propostas'}).waitFor();await page.waitForFunction(()=>!document.querySelector('button').disabled);
 await page.clock.pauseAt(new Date(Date.now()+1000));
 assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'abertura não planeja nem gera');
 await page.getByRole('button',{name:'Pedir propostas'}).click();await page.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1);
 await page.evaluate(()=>{window.slowCallback=true;});await page.clock.fastForward(3000);await page.waitForFunction(()=>window.callbackEntered===true);
 await page.clock.fastForward(20000);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'callback lento não consome espera visível');
 await page.evaluate(()=>window.releaseCallback());await page.getByText(/Próximo lote em/).waitFor();
 await page.clock.fastForward(14999);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'14.999 ms não iniciam novo lote');
 await page.clock.fastForward(1);await page.waitForFunction(()=>window.calls.filter(call=>call.path.endsWith('/execute')).length===2);
 await page.clock.fastForward(3000);await page.getByText('Aguardando sua decisão sobre as propostas.',{exact:true}).waitFor();
 await page.clock.fastForward(30000);assert.equal((await page.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,2,'duas rodadas aguardam decisão');
 for(const action of ['Pausar','Trocar fonte','Sair','Perguntar']){
  const context=await browser.newContext();const other=await context.newPage();await other.clock.install();await other.goto(`http://127.0.0.1:${server.address().port}`);await other.waitForFunction(()=>!document.querySelector('button').disabled);
  await other.getByRole('button',{name:'Pedir propostas'}).click();await other.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
  await other.getByRole('button',{name:action,exact:true}).click();await other.waitForFunction(()=>window.calls.some(call=>call.path.endsWith('/intent/revoke')));
  await other.clock.fastForward(30000);assert.equal((await other.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,action+' não repete execução');
  await other.reload();await other.waitForFunction(()=>!document.querySelector('button').disabled);assert.equal((await other.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'recarregar não envia efeitos');await context.close();
 }
 const hiddenContext=await browser.newContext(),hiddenPage=await hiddenContext.newPage();await hiddenPage.clock.install();await hiddenPage.goto(`http://127.0.0.1:${server.address().port}`);await hiddenPage.waitForFunction(()=>!document.querySelector('button').disabled);
 await hiddenPage.getByRole('button',{name:'Pedir propostas'}).click();await hiddenPage.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();await hiddenPage.clock.fastForward(3000);await hiddenPage.getByText(/Próximo lote em/).waitFor();
 await hiddenPage.clock.fastForward(5000);
 await hiddenPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await hiddenPage.getByText('Exploração pausada.',{exact:true}).waitFor();
 await hiddenPage.waitForFunction(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('compor-parallel-exploration-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const value=await new Promise((resolve,reject)=>{const request=db.transaction('preparations').objectStore('preparations').get('00000000-0000-4000-8000-000000000001');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const journal=await new Promise((resolve,reject)=>{const request=db.transaction('journals').objectStore('journals').get(JSON.stringify([value.userId,value.projectId,value.batchId]));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();return journal.progress.wait.mode==='paused'&&journal.progress.wait.remainingMs===10000;});
 await hiddenPage.clock.fastForward(30000);await hiddenPage.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal((await hiddenPage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/execute')).length,1,'tempo oculto e retorno não iniciam novo lote');await hiddenContext.close();
 const gateContext=await browser.newContext(),gatePage=await gateContext.newPage();await gatePage.goto(`http://127.0.0.1:${server.address().port}/?gate`);await gatePage.waitForFunction(()=>!document.querySelector('button').disabled);
 await gatePage.getByRole('button',{name:'Pedir propostas'}).click();await gatePage.waitForFunction(()=>window.gateEntered===true);await gatePage.getByRole('button',{name:'Pausar'}).click();await gatePage.evaluate(()=>window.releaseGate());
 await gatePage.waitForTimeout(200);assert.equal((await gatePage.evaluate(()=>window.calls)).filter(call=>call.path.endsWith('/resume')||call.path.endsWith('/plan')||call.path.endsWith('/execute')).length,0,'leitura atrasada após pausa não retoma gate nem envia efeitos');await gateContext.close();
});
