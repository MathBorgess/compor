import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createImageHandler} from '@compor/images-api';
import {createExplorationPlanner,createExplorationPlannerBindings,verifyExplorationPlan} from '@compor/agents-api/exploration-planner';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createManagedExplorationPlanProvider} from '@compor/agents-api/exploration-plan-provider';
import {deriveExplorationIntent} from '../lib/exploration-intent.ts';
import {createExplorationIntentRoute} from '../lib/exploration-intent-route.ts';
import {createExplorationPlannerRoute} from '../lib/exploration-planner-route.ts';
import {createExplorationBatchRoute} from '../lib/exploration-batch-route.ts';
import {decodeExplorationImage} from '../lib/exploration-image-runtime.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='https://compor.test',key=`sk-synthetic-${'x'.repeat(30)}`,actor={userId:id(1),token:'synthetic-user'};
const context={idea:'Oficina sintética',offer:'',audience:'',goal:'',direction:'',offerFacts:[],accepted:[],rejected:[],feedback:[]};
const scope={projectId:id(2),conversationId:'references',batchId:id(3),intentId:id(4)},requestId=id(5);
const pngs=[
 Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64'),
 Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'),
 Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7YQAAAAASUVORK5CYII=','base64'),
 Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmTkAAAAASUVORK5CYII=','base64'),
];
function visual(){
 const entries=pngs.map((bytes,index)=>{
  const desc={sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',byteLength:bytes.length};
  const source=index===0?{inputOrigin:'local-upload',source:null}
   :index===2?{inputOrigin:'generated',source:{projectId:scope.projectId,imageId:id(40)}}
   :{inputOrigin:'external',source:{originUrl:`https://www.pinterest.com/pin/synthetic-${index}/`,board:'behance/advertising'}};
  return {id:id(10+index),ordinal:index+1,role:'reference',...source,original:desc,transport:{...desc,width:1,height:1},transformation:'none'};
 });
 return {visualInput:{version:2,policy:'optimized-v1',externalConsent:true,entries},referenceImages:entries.map((entry,index)=>({id:entry.id,mime:'image/png',data:pngs[index].toString('base64')}))};
}
const items=[1,2,3].map(position=>({position,creativePrompt:`Caminho ${position}`,composition:`Composição ${position}`,contrast:`Contraste ${position}`,differenceFromOthers:`Diferença ${position}`}));
const request=(value,headers={})=>new Request(`${origin}/test`,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(value)});

test('seleção triada pelo agente mantém os bytes de uploads, externas e geradas nas três propostas paralelas', {timeout:15000}, async()=>{
 const v=visual(),selected=v.referenceImages.slice(0,3),rawPlan={version:2,items,referenceIds:selected.map(image=>image.id)};
 const bindings=createExplorationPlannerBindings({secret:Buffer.alloc(32,19),source:'byok',apiKey:key});
 let state='none',epoch=0,expectedDigest='',record=null,reservations=0,plannerCreates=0,plannerReads=0;
 const agentCalls=[],imageCalls=[],stored=[];
 const allImagesStarted=Promise.withResolvers(),releaseImages=Promise.withResolvers();
 const agentFetch=async(url,options)=>{
  assert.equal(new URL(url).origin,'https://api.openai.com');
  const path=new URL(url).pathname;
  if(options.method==='POST'&&path==='/v1/agents/sessions'){
   plannerCreates++;const body=JSON.parse(options.body);agentCalls.push(body);
   return Response.json({id:'sess_visual'});
  }
  assert.equal(options.method,'GET');plannerReads++;
  if(path==='/v1/agents/sessions/sess_visual')return Response.json({id:'sess_visual',status:'idle',agent:{tools:[]},required_actions:[]});
  if(path==='/v1/agents/sessions/sess_visual/turns')return Response.json({data:[{id:'turn_visual',session_id:'sess_visual',subagent_id:null,status:'completed'}],has_more:false});
  if(path==='/v1/agents/sessions/sess_visual/turns/turn_visual/items')return Response.json({data:[{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:'turn_visual',content:[{type:'output_text',text:JSON.stringify(rawPlan)}]}],has_more:false});
  throw Error('unexpected synthetic provider request');
 };
 const provider=createManagedExplorationPlanProvider({apiKey:key,fetch:agentFetch});
 const intentStore={create:async value=>{if(value.expectedEpoch!==epoch)return {status:'conflict'};expectedDigest=value.intentProofDigest;state='active';return {status:'created',epoch:++epoch};},revoke:async()=>{throw Error('unexpected revoke');},epoch:async()=>({epoch})};
 const auth={authorizeVisualInput:async()=>true,appOrigin:origin,apiKey:key,bindings,allowCreate:true,resolveActor:async()=>actor,ownsProject:async()=>true};
 const manifestDigest=visualInputDigest(v.visualInput),consentHeader=Buffer.alloc(32,42).toString('base64url');
 // The SQL and HTTP bridge tests cover the real mirror and revocation.
 let selectionActive=true;
 const prepareVisualAuthority=async input=>selectionActive&&input.actor.userId===actor.userId&&input.projectId===scope.projectId&&
  input.requestId===requestId&&input.consentHeader===consentHeader&&visualInputDigest(input.visualInput)===manifestDigest
  ? {requestId,manifestDigest,consentSecret:Buffer.alloc(32,42).toString('hex')} : null;
 const checkVisualDispatch=async()=>selectionActive&&state==='consumed';
 const authorizeVisualInput=async input=>selectionActive&&input.requestId===requestId&&visualInputDigest(input.visualInput)===manifestDigest;
 const intentRoute=createExplorationIntentRoute({...auth,prepareVisualAuthority,store:intentStore});
 const visualHeaders={'x-compor-reference-consent':consentHeader};
 const intentResponse=await intentRoute.create(request({...scope,purpose:'batch',context,visualInput:v.visualInput,authorityRequestId:requestId,expectedEpoch:0,apiKey:key},visualHeaders));assert.equal(intentResponse.status,200);
 const sha=value=>createHash('sha256').update(Buffer.from(value,'hex')).digest('hex');
 const plannerFor=cap=>createExplorationPlanner({bindings,provider,authorize:async()=>true,authorizeVisualInput,store:{
  reserve:async value=>{assert.equal(state,'active');assert.equal(sha(cap.intentSecret),expectedDigest);record={userId:actor.userId,projectId:scope.projectId,conversationId:scope.conversationId,batchId:scope.batchId,requestId,attemptId:id(6),inputDigest:value.inputDigest,state:'starting',binding:null};return {status:'reserved',record};},
  get:async()=>record,bind:async value=>{record={...record,binding:value.binding,state:'running'};},finish:async value=>{record={...record,state:value.state};},
 }});
 const planRoute=createExplorationPlannerRoute({...auth,prepareVisualAuthority,allowSubmit:true,plannerFor});
 const planned=await planRoute(request({op:'submit',...scope,requestId,context,...v,apiKey:key},visualHeaders));assert.equal(planned.status,202);
 assert.equal(plannerCreates,1);const blocks=agentCalls[0].input[0].content.filter(item=>item.type==='input_image');assert.deepEqual(blocks.map(item=>item.image_url),v.referenceImages.map(image=>`data:${image.mime};base64,${image.data}`));
 const poll=await planRoute(request({op:'poll',projectId:scope.projectId,conversationId:scope.conversationId,batchId:scope.batchId,requestId,context,visualInput:v.visualInput,apiKey:key}));
 const result=await poll.json();assert.equal(result.status,'completed');assert.deepEqual(result.plan.referenceIds,rawPlan.referenceIds);assert.equal(plannerReads,3);
 const imageHandler=createImageHandler({authenticate:async()=>actor,fetch:async(url,options)=>{
  assert.equal(String(url),'https://api.openai.com/v1/images/edits');assert.equal(options.method,'POST');assert.ok(options.body instanceof FormData);
  const files=options.body.getAll('image[]');imageCalls.push({prompt:options.body.get('prompt'),files:await Promise.all(files.map(async file=>({type:file.type,bytes:Buffer.from(await file.arrayBuffer())})))});
  if(imageCalls.length===3)allImagesStarted.resolve();
  await releaseImages.promise;
  return Response.json({data:[{b64_json:pngs[0].toString('base64')}]});
 }});
 const batchRoute=createExplorationBatchRoute({appOrigin:origin,visualEnabled:true,resolveActor:async()=>actor,ownsProject:async()=>true,authorizeVisualInput:async()=>true,prepareVisualAuthority,checkVisualDispatch,
  verifyPlan:async value=>value.apiKey===key&&verifyExplorationPlan({bindings,input:{actor,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.requestId,context:value.context,visualInput:value.visualInput},plan:value.plan,token:value.token}),
  intentSecret:value=>deriveExplorationIntent(bindings,{...value,purpose:'batch'}).intentSecret,
  intentState:async()=>({state,epoch,revocationEpoch:null}),
  store:{reserveBatch:async(who,value)=>{reservations++;assert.equal(value.visualAuthority.manifestDigest,manifestDigest);assert.equal(who.userId,actor.userId);assert.equal(sha(value.intentSecret),expectedDigest);if(state==='consumed')return {state:'running',isNew:false};assert.equal(state,'active');state='consumed';return {state:'running',isNew:true};},plan:async()=>{},put:async(_actor,_project,requestId,bytes)=>stored.push({requestId,bytes:Buffer.from(bytes)}),finish:async()=>{},reject:async()=>{}},
  generate:async(who,apiKey,prompt,images)=>decodeExplorationImage(await imageHandler(request({apiKey,prompt,authorizeGeneration:true,images:images.map(({mime,data})=>({mime,data}))}))),
 });
 const batch={...scope,planRequestId:requestId,context,plan:result.plan,planBinding:result.planBinding,visualInput:v.visualInput,referenceImages:selected,imageIds:[id(20),id(21),id(22)]};
 const headers={...visualHeaders,'x-compor-openai-key':key};
 const corruptProof=`${result.planBinding.slice(0,-1)}${result.planBinding.endsWith('A')?'B':'A'}`;
 const modifiedPlan={...result.plan,referenceIds:v.referenceImages.map(image=>image.id)};
 const bad=[{...batch,planBinding:corruptProof},{...batch,plan:modifiedPlan,referenceImages:v.referenceImages},{...batch,referenceImages:[selected[1],selected[0],selected[2]]},{...batch,referenceImages:[{...selected[0],data:pngs[1].toString('base64')},...selected.slice(1)]}];
 for(const input of bad){const response=await batchRoute.post(request(input,headers));assert.ok([400,403].includes(response.status));}
 assert.equal((await batchRoute.post(request(batch,{...visualHeaders,'x-compor-openai-key':`${key}other`}))).status,403);assert.equal(reservations,0);assert.equal(imageCalls.length,0);
 selectionActive=false;
 assert.equal((await batchRoute.post(request(batch,headers))).status,403);
 assert.equal(reservations,0);assert.equal(imageCalls.length,0);
 selectionActive=true;
 const pending=batchRoute.post(request(batch,headers));
 // All three requests must reach the provider while the first remains in flight.
 await Promise.race([allImagesStarted.promise,pending.then(()=>assert.fail('batch ended before all three requests entered the provider'))]);
 assert.equal(stored.length,0);assert.equal(reservations,1);assert.equal(new Set(imageCalls.map(call=>call.prompt)).size,3);
 releaseImages.resolve();
 const done=await pending;const resultBatch=await done.json();assert.equal(done.status,200);assert.equal(resultBatch.status,'completed');
 assert.deepEqual(imageCalls.map(call=>call.prompt).sort(),result.plan.items.map(item=>item.prompt).sort());
 for(const call of imageCalls){assert.deepEqual(call.files.map(file=>file.type),['image/png','image/png','image/png']);assert.deepEqual(call.files.map(file=>file.bytes),pngs.slice(0,3));}
 assert.equal(stored.length,3);assert.ok(stored.every(item=>item.bytes.equals(pngs[0])));assert.equal(plannerCreates,1);
 const replay=await batchRoute.post(request(batch,headers));assert.equal(replay.status,409);assert.equal(imageCalls.length,3);assert.equal(plannerCreates,1);
});
