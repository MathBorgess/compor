import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('reposição visual recupera snapshot vinculado e nunca reenvia resultado incerto',{skip:!existsSync(browserPath),timeout:30000},async t=>{
 const bundled=await build({stdin:{resolveDir:process.cwd(),sourcefile:'replacement-visual-fixture.ts',loader:'ts',contents:`
 import {createReplacementRun} from './lib/parallel-exploration-replacement-run.ts';
 import {createParallelJournalStore} from './lib/parallel-exploration-journal.ts';
 import {validateExplorationPlan} from '@compor/agents-api/exploration-plan-contract';
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),key='sk-synthetic-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
 const scope={userId:id(1),projectId:id(2),batchId:id(3)},context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
 const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,1,1);const file=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');const desc={sha256:digest,mime:'image/png',byteLength:file.size};
 const entries=[1,2,3].map((ordinal,index)=>({id:id(10+index),ordinal,role:'reference',...(index===1?{inputOrigin:'external',source:{originUrl:'https://www.pinterest.com/pin/123/',board:'behance/advertising'}}:{inputOrigin:'local-upload',source:null}),original:desc,transport:{...desc,width:2,height:2},transformation:'none'}));
 const visualInput={version:2,policy:'optimized-v1',externalConsent:true,entries},snapshot={manifest:visualInput,blobs:[file,file,file]};
 const plan=validateExplorationPlan({version:2,referenceIds:[id(10),id(12)],items:[1,2,3].map(position=>({position,creativePrompt:'caminho '+position,composition:'composição '+position,contrast:'contraste '+position,differenceFromOthers:'diferença '+position}))},context,visualInput);
 const store=createParallelJournalStore();let prep=await store.createBeforePlanningWithVisual({version:1,...scope,conversationId:'references',planRequestId:id(4),credentialSource:'byok',intentId:id(5),expectedEpoch:0,planSubmitted:false,revocationRequested:false,imageIds:[id(6),id(7),id(8)],context,visualInput,plan:null,stage:'planning',revision:0},snapshot);
 prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'intent_confirmed',epoch:1});prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'plan_submitted'});prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'planned',plan});prep=await store.prepareExecution(scope,prep.revision);
 let journal=await store.load(scope);for(const position of [1,2,3])journal=await store.update(scope,journal.revision,{kind:'observe',observation:{position,requestId:id(position+5),status:position===2?'rejected':'completed',revision:2},now:1000,visible:false});store.close();
 if(location.search==='?missing'){const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('compor-parallel-exploration-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('visualSnapshots','readwrite');tx.objectStore('visualSnapshots').delete(JSON.stringify([scope.userId,scope.projectId,scope.batchId]));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();}
 window.calls=[];window.notices=[];window.confirmed=id(7);window.fetch=async(path,options)=>{const body=JSON.parse(options.body);window.calls.push({path,body});
  if(path.endsWith('/plan'))return Response.json({status:'completed',retryAutomatically:false,requestId:id(4),batchId:id(3),plan,planBinding:'memory-proof'});
  if(path.endsWith('/status')){const ids=[id(6),window.confirmed,id(8)],images=ids.map((requestId,index)=>({requestId,position:index+1,ordinal:index+1,status:index===1&&requestId===id(7)?'rejected':'completed',revision:2,replacesImageId:index===1&&requestId!==id(7)?id(7):null}));return Response.json({batchId:id(3),projectId:id(2),pieceId:null,state:window.confirmed===id(7)?'partial':'completed',completedAt:null,nextAt:null,closedAt:null,images});}
  if(path.endsWith('/intent')){const journalStore=createParallelJournalStore(),current=await journalStore.load(scope);journalStore.close();window.claimBefore=current.replacements.at(-1).state==='prepared';return Response.json({status:'created',epoch:2});}
  if(path.endsWith('/replace')){const journalStore=createParallelJournalStore(),current=await journalStore.load(scope);journalStore.close();window.submittedBefore=current.replacements.at(-1).state==='submitted';if(location.search==='?lost')return Response.json({status:'unknown',retryAutomatically:false},{status:503});window.confirmed=body.requestId;return Response.json({status:'completed',batchId:id(3),requestId:body.requestId,retryAutomatically:false});}
  if(path.endsWith('/intent/revoke'))return Response.json({status:'revoked',epoch:3,revocationEpoch:3});
  throw Error('unexpected '+path);
 };
 const run=createReplacementRun({preparation:prep,position:2,key,allowed:()=>true,currentContext:async()=>context,onSnapshot:async()=>{},onNotice:value=>window.notices.push(value)});await run.run();window.finished=true;
 `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const server=createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text);}else res.end('<!doctype html><script type="module" src="/fixture.js"></script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 for(const mode of ['success','missing','lost']){
  const context=await browser.newContext(),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/${mode==='success'?'':'?'+mode}`);await page.waitForFunction(()=>window.finished,{timeout:10000});
  const result=await page.evaluate(()=>({calls:window.calls,notices:window.notices,claimBefore:window.claimBefore,submittedBefore:window.submittedBefore}));assert.deepEqual(errors,[]);
  const intents=result.calls.filter(call=>call.path.endsWith('/intent')),replacements=result.calls.filter(call=>call.path.endsWith('/replace'));
  if(mode==='missing'){assert.equal(intents.length,0);assert.equal(replacements.length,0);assert(result.notices.some(value=>value.includes('imagens desta tentativa não estão disponíveis')));}
  else{assert.equal(intents.length,1);assert.equal(replacements.length,1);assert(result.claimBefore&&result.submittedBefore);assert.equal(intents[0].body.visualInput.version,2);assert.deepEqual(replacements[0].body.referenceImages.map(image=>image.id),['00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012']);assert.equal(replacements[0].body.planBinding,'memory-proof');if(mode==='lost')assert(result.notices.some(value=>value.includes('ainda não foi confirmada')));}
  await context.close();
 }
});
