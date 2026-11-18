import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';
const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('transição em relógio virtual preserva pausa, recibos e gate de duas rodadas',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{const files={'/journal.js':'../lib/parallel-exploration-journal.ts','/planner.js':'../../../packages/agents-api/src/exploration-plan-contract.mjs'};if(files[request.url]){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(files[request.url],import.meta.url)));}else response.end('<!doctype html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const {createParallelJournalStore}=await import('/journal.js'),{validateExplorationPlan}=await import('/planner.js');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]},plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},context);
  const store=createParallelJournalStore(),gates={visible:true,sessionActive:true,originalCredential:true,generationAllowed:true,questionResolved:true,feedbackAllowed:true,noOtherPending:true};
  async function complete(round,expectedEpoch){
   const scope={userId:id(1),projectId:id(2),batchId:id(10+round)},intentId=id(20+round),imageIds=[1,2,3].map(n=>id(30+round*3+n));
   let prep=await store.createBeforePlanning({version:1,...scope,conversationId:'references',planRequestId:id(50+round),credentialSource:'byok',intentId,expectedEpoch,planSubmitted:false,revocationRequested:false,imageIds,context,plan:null,stage:'planning',revision:0});
   prep=await store.updatePreparation(scope.userId,prep.revision,{kind:'intent_confirmed',epoch:expectedEpoch+1});prep=await store.updatePreparation(scope.userId,prep.revision,{kind:'plan_submitted'});prep=await store.updatePreparation(scope.userId,prep.revision,{kind:'planned',plan});
   prep=await store.prepareExecution(scope,prep.revision);let journal=await store.load(scope);
   for(const position of [3,1,2])journal=await store.update(scope,journal.revision,{kind:'observe',observation:{requestId:imageIds[position-1],position,status:'completed',revision:1},now:1000,visible:false});
   prep=await store.updatePreparation(scope.userId,prep.revision,{kind:'revoke'});
   let denied=false;try{await store.retireCompleted(scope,prep.revision,100000,gates);}catch{denied=true;}
   prep=await store.updatePreparation(scope.userId,prep.revision,{kind:'revoke_confirmed',epoch:expectedEpoch+2});
   journal=await store.update(scope,journal.revision,{kind:'resume',now:2000,gates});
   return {scope,prep,journal,denied};
  }
  const one=await complete(1,0);let before=false;try{await store.retireCompleted(one.scope,one.prep.revision,16999,gates);}catch{before=true;}
  const nextEpoch=await store.retireCompleted(one.scope,one.prep.revision,17000,gates),preserved=Boolean(await store.load(one.scope));
  const two=await complete(2,nextEpoch);let feedback=false,question=false;
  try{await store.retireCompleted(two.scope,two.prep.revision,17000,{...gates,feedbackAllowed:false});}catch{feedback=true;}
  try{await store.retireCompleted(two.scope,two.prep.revision,17000,{...gates,questionResolved:false});}catch{question=true;}
  const stillBlocked=Boolean(await store.loadPreparation(two.scope.userId));
  const finalEpoch=await store.retireCompleted(two.scope,two.prep.revision,17000,gates);
  const recoveredScope={userId:id(70),projectId:id(2),batchId:id(71)},oldIntent=id(72),newIntent=id(73);
  let recovered=await store.createBeforePlanning({version:1,...recoveredScope,conversationId:'references',planRequestId:id(74),credentialSource:'byok',intentId:oldIntent,expectedEpoch:0,planSubmitted:false,revocationRequested:false,imageIds:[id(75),id(76),id(77)],context,plan:null,stage:'planning',revision:0});
  recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'intent_confirmed',epoch:1});recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'plan_submitted'});recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'planned',plan});
  recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'revoke'});recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'revoke_confirmed',epoch:2});
  const originalAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='preparationHistory')throw new DOMException('quota','QuotaExceededError');return originalAdd.apply(this,args);};
  let archiveFailure=false;try{await store.reissuePlannedIntent(recoveredScope,recovered.revision,newIntent,2);}catch{archiveFailure=true;}IDBObjectStore.prototype.add=originalAdd;
  const oldPreserved=(await store.loadPreparation(recovered.userId)).intentId===oldIntent;
  recovered=await store.reissuePlannedIntent(recoveredScope,recovered.revision,newIntent,2);
  const planPreserved=JSON.stringify(recovered.plan)===JSON.stringify(plan)&&(await store.loadArchivedPreparation(recoveredScope,oldIntent))?.intentId===oldIntent;
  recovered=await store.updatePreparation(recovered.userId,recovered.revision,{kind:'intent_confirmed',epoch:3});recovered=await store.prepareExecution(recoveredScope,recovered.revision);
  let noSecond=false;try{await store.prepareExecution(recoveredScope,recovered.revision);}catch{noSecond=true;}
  return {denied:one.denied&&two.denied,before,nextEpoch,preserved,feedback,question,stillBlocked,finalEpoch,secondPreserved:Boolean(await store.load(two.scope)),archiveFailure,oldPreserved,planPreserved,noSecond};
 });
 assert.deepEqual(result,{denied:true,before:true,nextEpoch:2,preserved:true,feedback:true,question:true,stillBlocked:true,finalEpoch:4,secondPreserved:true,archiveFailure:true,oldPreserved:true,planPreserved:true,noSecond:true});
});
