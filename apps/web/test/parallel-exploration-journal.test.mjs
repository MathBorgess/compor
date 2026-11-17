import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';
import {createParallelJournalStore} from '../lib/parallel-exploration-journal.ts';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('ausência de IndexedDB impede preparar despacho',async()=>{
 const store=createParallelJournalStore({indexedDB:undefined});
 await assert.rejects(store.loadForRecovery({userId:'00000000-0000-4000-8000-000000000001',projectId:'00000000-0000-4000-8000-000000000002',batchId:'00000000-0000-4000-8000-000000000003'}),error=>error.code==='parallel_storage_unavailable');
});
test('journal local é transacional, preserva escopo e recupera espera sem repetir lote',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{if(request.url==='/journal.js'){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL('../lib/parallel-exploration-journal.ts',import.meta.url)));}else if(request.url==='/planner.js'){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL('../../../packages/agents-api/src/exploration-plan-contract.mjs',import.meta.url)));}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Journal local</title>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async()=>{
  const {createParallelJournalStore}=await import('/journal.js'),{validateExplorationPlan}=await import('/planner.js');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const context={idea:'Oficina de desenho',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},context);
  const scope={userId:id(1),projectId:id(2),batchId:id(3)};
  const input={version:1,...scope,conversationId:id(4),planRequestId:id(5),credentialSource:'byok',context,plan,revision:0,progress:{children:[1,2,3].map(position=>({requestId:id(position+5),position,status:'unconfirmed',revision:0,confirmedAt:null})),wait:{mode:'none'}}};
  const a=createParallelJournalStore(),b=createParallelJournalStore();
  const expectCode=async(operation,code)=>{try{await operation;return false;}catch(error){return error.code===code;}};
  const invalid=await expectCode(a.createBeforeDispatch({...input,planBinding:'proof'}),'parallel_storage_invalid');
  const secret=await expectCode(a.createBeforeDispatch({...input,apiKey:'sk-test-secret'}),'parallel_storage_invalid');
  const originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){if(this.name==='journals')throw new DOMException('synthetic quota','QuotaExceededError');return originalAdd.apply(this,args);};
  let effects=0;const quota=await expectCode((async()=>{await a.createBeforeDispatch(input);effects++;})(),'parallel_storage_quota');
  IDBObjectStore.prototype.add=originalAdd;
  const noEffect=effects===0&&(await a.loadForRecovery(scope))===null;
  const writes=await Promise.allSettled([a.createBeforeDispatch(input),b.createBeforeDispatch(input)]);
  const oneWrite=writes.filter(result=>result.status==='fulfilled').length===1&&writes.filter(result=>result.status==='rejected'&&result.reason.code==='parallel_storage_exists').length===1;
  const other=await a.loadForRecovery({...scope,userId:id(20)})===null;
  const obs=(position)=>({kind:'observe',observation:{requestId:id(position+5),position,status:'completed',revision:1},now:position*100,visible:true});
  const competing=await Promise.allSettled([a.update(scope,0,obs(3)),b.update(scope,0,obs(1))]);
  const oneUpdate=competing.filter(result=>result.status==='fulfilled').length===1&&competing.filter(result=>result.status==='rejected'&&result.reason.code==='parallel_storage_conflict').length===1;
  let current=competing.find(result=>result.status==='fulfilled').value;
  for(const position of [3,1,2])if(current.progress.children[position-1].status!=='completed')current=await a.update(scope,current.revision,obs(position));
  const firstDeadline=current.progress.wait.mode==='running';a.close();b.close();
  const restored=await createParallelJournalStore().loadForRecovery(scope);
  return {invalid,secret,quota,noEffect,oneWrite,other,oneUpdate,firstDeadline,restored:restored.progress.wait.mode==='paused'&&restored.progress.wait.remainingMs===15000,all:restored.progress.children.every(child=>child.status==='completed'),plan:JSON.stringify(restored.plan)===JSON.stringify(plan)};
 });
 assert.deepEqual(results,{invalid:true,secret:true,quota:true,noEffect:true,oneWrite:true,other:true,oneUpdate:true,firstDeadline:true,restored:true,all:true,plan:true});
});
