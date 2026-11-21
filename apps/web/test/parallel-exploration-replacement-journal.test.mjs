import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('reposição mantém claim durável, recibos, vínculo do plano e CAS após recarga',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{const files={'/journal.js':'../lib/parallel-exploration-journal.ts','/client.js':'../lib/parallel-exploration-client.ts','/planner.js':'../../../packages/agents-api/src/exploration-plan-contract.mjs'};if(files[request.url]){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(files[request.url],import.meta.url)));}else response.end('<!doctype html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createParallelJournalStore}=await import('/journal.js'),{createParallelExplorationClient}=await import('/client.js'),{validateExplorationPlan}=await import('/planner.js');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,key=`sk-synthetic-${'x'.repeat(30)}`;
  const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},context);
  const scope={userId:id(1),projectId:id(2),batchId:id(3)},store=createParallelJournalStore(),second=createParallelJournalStore();
  let prep=await store.createBeforePlanning({version:1,...scope,conversationId:'references',planRequestId:id(4),credentialSource:'byok',intentId:id(5),expectedEpoch:0,planSubmitted:false,revocationRequested:false,imageIds:[id(6),id(7),id(8)],context,plan:null,stage:'planning',revision:0});
  prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'intent_confirmed',epoch:1});prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'plan_submitted'});prep=await store.updatePreparation(prep.userId,prep.revision,{kind:'planned',plan});prep=await store.prepareExecution(scope,prep.revision);
  let journal=await store.load(scope);for(const position of [1,2,3])journal=await store.update(scope,journal.revision,{kind:'observe',observation:{position,requestId:id(position+5),status:position===2?'rejected':'completed',revision:2},now:1000,visible:false});
  const claim={position:2,previousId:id(7),requestId:id(9),intentId:id(10),expectedEpoch:1};
  let badEpoch=false;try{await store.prepareReplacement(scope,journal.revision,{...claim,expectedEpoch:5});}catch{badEpoch=true;}
  const contest=await Promise.allSettled([store.prepareReplacement(scope,journal.revision,claim),second.prepareReplacement(scope,journal.revision,{...claim,requestId:id(11),intentId:id(12)})]);
  const one=contest.filter(item=>item.status==='fulfilled').length===1; journal=contest.find(item=>item.status==='fulfilled').value;
  const used=journal.replacements.at(-1);let pendingBlocked=false;try{await store.prepareReplacement(scope,journal.revision,{...claim,requestId:id(13),intentId:id(14)});}catch{pendingBlocked=true;}
  journal=await store.updateReplacement(scope,journal.revision,{kind:'intent_confirmed',epoch:2});journal=await store.updateReplacement(scope,journal.revision,{kind:'submitted'});
  let images=[{position:1,requestId:id(6),status:'completed',revision:2,replacesImageId:null},{position:2,requestId:used.requestId,status:'failed',revision:2,replacesImageId:used.previousId},{position:3,requestId:id(8),status:'completed',revision:2,replacesImageId:null}].map((v,i)=>({...v,ordinal:i+1}));
  const api=async(path)=>path.endsWith('/plan')?Response.json({status:'completed',retryAutomatically:false,requestId:prep.planRequestId,batchId:scope.batchId,plan,planBinding:'proof-memory'}):Response.json({batchId:scope.batchId,projectId:scope.projectId,pieceId:null,state:'partial',completedAt:null,nextAt:null,closedAt:null,images});
  const client=createParallelExplorationClient({store,fetchApi:api,canInspect:()=>true}),recovered=await client.inspectPlan(prep,key);
  journal=(await client.inspectBatch(prep,()=>2000,false)).journal;const observed=journal.progress.children[1].requestId===used.requestId&&journal.replacements.at(-1).state==='observed';
  const preserved=journal.progress.children[0].requestId===id(6)&&journal.progress.children[2].requestId===id(8);let stale=false;try{await store.prepareReplacement(scope,journal.revision,{position:2,previousId:id(7),requestId:id(20),intentId:id(21),expectedEpoch:2});}catch{stale=true;}
  journal=await store.prepareReplacement(scope,journal.revision,{position:2,previousId:used.requestId,requestId:id(20),intentId:id(21),expectedEpoch:2});journal=await store.updateReplacement(scope,journal.revision,{kind:'revoke'});journal=await store.updateReplacement(scope,journal.revision,{kind:'revoke_confirmed',epoch:3});
  let wrongEvidence=false;try{await store.abandonReplacement(scope,journal.revision,{position:2,requestId:id(20),status:'rejected',revision:2});}catch{wrongEvidence=true;}
  journal=await store.abandonReplacement(scope,journal.revision,{position:2,requestId:used.requestId,status:'failed',revision:2});const abandoned=journal.replacements.at(-1).state==='abandoned';
  const before=JSON.stringify(journal),oldPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='journals')throw new DOMException('quota','QuotaExceededError');return oldPut.apply(this,args);};let quota=false;try{await store.prepareReplacement(scope,journal.revision,{position:2,previousId:used.requestId,requestId:id(22),intentId:id(23),expectedEpoch:3});}catch{quota=true;}IDBObjectStore.prototype.put=oldPut;
  const unchanged=JSON.stringify(await store.load(scope))===before;store.close();second.close();const resumed=createParallelJournalStore();const saved=await resumed.load(scope);
  journal=await resumed.prepareReplacement(scope,saved.revision,{position:2,previousId:used.requestId,requestId:id(22),intentId:id(23),expectedEpoch:3});
  journal=await resumed.updateReplacement(scope,journal.revision,{kind:'intent_confirmed',epoch:4});journal=await resumed.updateReplacement(scope,journal.revision,{kind:'submitted'});
  images=images.map(image=>image.position===2?{...image,requestId:id(22),status:'completed',revision:2,replacesImageId:used.requestId}:image);
  const finalClient=createParallelExplorationClient({store:resumed,fetchApi:api,canInspect:()=>true});journal=(await finalClient.inspectBatch(prep,()=>3000,false)).journal;
  const gates={visible:true,sessionActive:true,originalCredential:true,generationAllowed:true,questionResolved:true,feedbackAllowed:true,noOtherPending:true};
  journal=await resumed.update(scope,journal.revision,{kind:'resume',now:4000,gates});
  let early=false;try{await resumed.retireCompleted(scope,prep.revision,18999,gates);}catch{early=true;}
  journal=await resumed.updateReplacement(scope,journal.revision,{kind:'revoke'});
  let uncertain=false;try{await resumed.retireCompleted(scope,prep.revision,19000,gates);}catch{uncertain=true;}
  journal=await resumed.updateReplacement(scope,journal.revision,{kind:'revoke_confirmed',epoch:5});
  const nextEpoch=await resumed.retireCompleted(scope,prep.revision,19000,gates);
  return {badEpoch,one,pendingBlocked,observed,preserved,stale,wrongEvidence,abandoned,quota,unchanged,reloaded:saved.replacements.length===2,binding:recovered.binding==='proof-memory',noSecrets:!JSON.stringify(saved).includes(key)&&!JSON.stringify(saved).includes('proof-memory'),early,uncertain,nextEpoch};
 });
 assert.deepEqual(result,{badEpoch:true,one:true,pendingBlocked:true,observed:true,preserved:true,stale:true,wrongEvidence:true,abandoned:true,quota:true,unchanged:true,reloaded:true,binding:true,noSecrets:true,early:true,uncertain:true,nextEpoch:5});
});
