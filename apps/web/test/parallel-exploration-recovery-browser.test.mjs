import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('recuperação visível consulta lote somente por gesto e mostra resultados por posição',{skip:!existsSync(browserPath)},async t=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'parallel-recovery-fixture.tsx',loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import Recovery from './app/parallel-exploration-recovery.tsx';
  import {useExplorationLoop} from './app/use-exploration-loop.ts';
  import {createStudioState} from './lib/studio-state.ts';
  import {createParallelJournalStore} from './lib/parallel-exploration-journal.ts';
  import {validateExplorationPlan} from '@compor/agents-api/exploration-plan-contract';
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:'caminho '+position,composition:'composição '+position,contrast:'contraste '+position,differenceFromOthers:'diferença '+position}))},context);
  const base={version:1,userId:id(1),projectId:id(2),batchId:id(3),conversationId:id(4),planRequestId:id(5),credentialSource:'byok',context,plan,imageIds:[id(6),id(7),id(8)]};
  const store=createParallelJournalStore(),unsent=location.search==='?unsent'||location.search==='?uncertain';
  await store.createBeforePlanning({...base,plan:null,stage:'planning',revision:0,...(unsent?{intentId:id(9),expectedEpoch:0,planSubmitted:false,revocationRequested:false}:{})});
  if(!unsent){await store.updatePreparation(id(1),0,{kind:'planned',plan});
   const {imageIds,...journalBase}=base;
   await store.createBeforeDispatch({...journalBase,revision:0,progress:{children:[1,2,3].map(position=>({requestId:id(position+5),position,status:'unconfirmed',revision:0,confirmedAt:null})),wait:{mode:'none'}}});
   await store.updatePreparation(id(1),1,{kind:'executing'});}
  store.close();
  window.calls=[];window.applied=[];
  window.fetch=async(path,options)=>{window.calls.push({path,body:JSON.parse(options.body)});if(path.endsWith('/intent/state'))return Response.json({state:'active',epoch:1,revocationEpoch:null});if(path.endsWith('/intent/revoke'))return Response.json({status:'revoked',epoch:2,revocationEpoch:2});if(path.endsWith('/plan/status'))return location.search==='?uncertain'?Response.json({error:'unavailable'},{status:503}):Response.json({status:'absent',projectId:id(2),conversationId:id(4),batchId:id(3),requestId:id(5)});if(path!=='/api/studio/exploration-batches/status')throw Error('efeito inesperado');return Response.json({batchId:id(3),projectId:id(2),pieceId:id(4),state:'partial',completedAt:null,nextAt:null,closedAt:null,images:[{requestId:id(8),position:3,status:'completed',ordinal:3,revision:2,replacesImageId:null},{requestId:id(6),position:1,status:'unknown',ordinal:1,revision:2,replacesImageId:null},{requestId:id(7),position:2,status:'rejected',ordinal:2,revision:2,replacesImageId:null}]});};
  const state=createStudioState({userId:id(1),projectId:id(2)});
  function Fixture(){const loop=useExplorationLoop({userId:id(1),projectId:id(2),conversationId:id(4),state,getState:()=>state,hasApiKey:true,getApiKey:()=>'',isAuthenticated:()=>true,enabled:true,idea:'Oficina'});return <><output aria-label="bloqueio">{loop.parallelBlocked?'Bloqueado':loop.status}</output><Recovery userId={id(1)} projectId={id(2)} conversationId={id(4)} credentialSource="byok" getApiKey={()=>''} isAuthenticated={()=>true} onCompleted={async(...args)=>window.applied.push(args)}/></>;}
  createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const server=createServer((request,response)=>{if(request.url==='/fixture.js'){response.setHeader('Content-Type','text/javascript');response.end(bundled.outputFiles[0].text);}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText('Há uma tentativa paralela anterior. Ela não será repetida automaticamente.',{exact:true}).waitFor();
 await page.getByLabel('bloqueio').getByText('Bloqueado',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls),[]);
 await page.getByRole('button',{name:'Consultar tentativa anterior'}).click();
 await page.getByText('1 de 3 imagens confirmadas.',{exact:true}).waitFor();
 await page.getByText('Resultado desconhecido',{exact:true}).waitFor();await page.getByText('Envio recusado',{exact:true}).waitFor();
 const calls=await page.evaluate(()=>window.calls),applied=await page.evaluate(()=>window.applied);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/studio/exploration-batches/status');assert.equal(applied.length,1);assert.equal(applied[0][1],3);
 assert.equal(await page.getByRole('button',{name:/gerar|repor|substituir/i}).count(),0);
 const context=await browser.newContext();t.after(()=>context.close());const unsentPage=await context.newPage();await unsentPage.goto(`http://127.0.0.1:${server.address().port}/?unsent`);
 await unsentPage.getByRole('button',{name:'Verificar encerramento da tentativa'}).click();
 await unsentPage.getByText('Tentativa encerrada e preservada no histórico local. Para pedir novas propostas, faça um novo pedido.',{exact:true}).waitFor();
 const archiveCalls=await unsentPage.evaluate(()=>window.calls);assert.deepEqual(archiveCalls.map(call=>call.path),['/api/studio/exploration-batches/intent/state','/api/studio/exploration-batches/intent/revoke','/api/studio/exploration-batches/plan/status']);
 const uncertainContext=await browser.newContext();t.after(()=>uncertainContext.close());const uncertainPage=await uncertainContext.newPage();await uncertainPage.goto(`http://127.0.0.1:${server.address().port}/?uncertain`);
 await uncertainPage.getByRole('button',{name:'Verificar encerramento da tentativa'}).click();await uncertainPage.getByText('Não foi possível confirmar e preservar o encerramento. A tentativa continua bloqueada.',{exact:true}).waitFor();
 assert.equal(await uncertainPage.getByRole('button',{name:'Verificar encerramento da tentativa'}).count(),1,'ausência de prova conserva bloqueio');
});
