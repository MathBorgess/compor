import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {browserModuleSource} from './browser-module-source.mjs';

const browserPath=process.env.BROWSER_EXECUTABLE_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('registro de planejamento é único e recuperação só consulta a mesma tentativa',{skip:!existsSync(browserPath)},async t=>{
 const server=createServer(async(request,response)=>{const modules={'/client.js':'../lib/parallel-exploration-client.ts','/journal.js':'../lib/parallel-exploration-journal.ts','/planner.js':'../../../packages/agents-api/src/exploration-plan-contract.mjs'};if(modules[request.url]){response.setHeader('Content-Type','text/javascript');response.end(await browserModuleSource(new URL(modules[request.url],import.meta.url)));}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Cliente simulado</title>');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const browser=await chromium.launch({executablePath:browserPath,headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=await page.evaluate(async()=>{
  const {createParallelExplorationClient}=await import('/client.js'),{createParallelJournalStore}=await import('/journal.js'),{validateExplorationPlan}=await import('/planner.js');
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,source='byok',apiKey=`sk-synthetic-${'x'.repeat(30)}`;
  const context={idea:'Oficina',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
  const plan=validateExplorationPlan({version:1,items:[1,2,3].map(position=>({position,creativePrompt:`caminho ${position}`,composition:`composição ${position}`,contrast:`contraste ${position}`,differenceFromOthers:`diferença ${position}`}))},context);
  const input={version:1,userId:id(1),projectId:id(2),batchId:id(3),conversationId:id(4),planRequestId:id(5),credentialSource:source,imageIds:[id(6),id(7),id(8)],context,plan:null,stage:'planning',revision:0};
  const store=createParallelJournalStore(),calls=[];let persistedBeforePlan=false;
  const fetchApi=async(path,options)=>{
   const body=JSON.parse(options.body);calls.push({path,op:body.op,
     byokTransport:options.headers['x-compor-openai-key']===apiKey&&options.headers['content-type']==='application/vnd.compor.byok+json'&&!Object.hasOwn(body,'apiKey')});
   if(path.endsWith('/plan')){
    persistedBeforePlan=Boolean(await store.loadPreparation(input.userId));
    return Response.json({status:'completed',retryAutomatically:false,requestId:input.planRequestId,batchId:input.batchId,plan,planBinding:'proof-in-memory'});
   }
   throw Error('unexpected');
  };
  const client=createParallelExplorationClient({store,fetchApi,canInspect:()=>true});
  await store.createBeforePlanning(input);let duplicate=false;
  try{await store.createBeforePlanning(input);}catch{duplicate=true;}
  const existing=await store.loadPreparation(input.userId);
  await client.inspectPlan(existing,apiKey);
  const after=await store.loadPreparation(input.userId);
  const raw=JSON.stringify(after);
  return {persistedBeforePlan,duplicate,planSubmits:calls.filter(call=>call.op==='submit').length,polls:calls.filter(call=>call.op==='poll').length,executions:calls.filter(call=>call.path.endsWith('/execute')).length,planned:after.stage==='planned',noProof:!raw.includes('proof-in-memory')&&!raw.includes(apiKey),byokTransport:calls.every(call=>call.byokTransport)};
 });
 assert.deepEqual(results,{persistedBeforePlan:true,duplicate:true,planSubmits:0,polls:1,executions:0,planned:true,noProof:true,byokTransport:true});
});
