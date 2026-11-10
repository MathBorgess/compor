import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioChatHandlers} from '@compor/agents-api/studio-chat';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {AGENT_MODEL} from '../../../packages/agents-api/src/agent-model.mjs';
import {AGENT_STUDIO_TOOLS} from '@compor/agents-api/studio-chat-tools';
import {createCredentialSessionBindings,createCredentialStudioBindings} from '../lib/openai-credential-bindings.ts';

const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',request2='55555555-5555-4555-8555-555555555555';
const apiKey='sk-synthetic_abcdefghijklmnopqrstuvwxyz',app='https://compor.test';
const request=(body,origin=app)=>new Request(app+'/api/studio/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const body={apiKey,projectId,requestId,message:'Atualize a oferta para oficina fictícia',context:{revision:1,pieceId:null,brief:{offer:'Oficina'}},history:[]};
function fixture(options={}){
 const records=new Map(),calls=[],claims=new Map();let status='in_progress',actions=[],turn='turn_one',turnState='in_progress',model=AGENT_MODEL,answer='Atualização concluída na aba.';
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)}),studioBindings=createStudioBindings({secret:Buffer.alloc(32,7)});
 const store={
  async reserve(c){if(records.has(c.requestId)){const t=records.get(c.requestId);return{status:t.inputDigest===c.inputDigest?'existing':'conflict',turn:t};}if([...records.values()].some(t=>!['completed','failed'].includes(t.state)))return{status:'busy'};const t={requestId:c.requestId,projectId,userId,attemptId:c.requestId===requestId?attemptId:request2,inputDigest:c.inputDigest,state:'starting',binding:null,turnId:null};records.set(c.requestId,t);return{status:'reserved',turn:t};},
  async get(c){return records.get(c.requestId)??null;},
  async bind(c){Object.assign(records.get(c.requestId),{binding:c.binding,expiresAt:c.expiresAt,priorTurnId:c.priorTurnId,initialInput:c.initialInput,initialOutput:c.initialOutput,state:'running'});},
  async state(c){const t=records.get(c.requestId);t.state=c.state;t.turnId=c.turnId??t.turnId;},
  async claimAction(c){const key=c.callId;if(claims.has(key))return{status:'existing',id:claims.get(key).id};claims.set(key,{id:request2,state:'sending'});return{status:'claimed',id:request2};},
  async finishAction(c){calls.push({kind:'receipt',state:c.state});for(const v of claims.values())if(v.id===c.submissionId)v.state=c.state;},
  async getAction(c){return claims.get(c.callId)??null;},
 };
 const fetch=async(url,init={})=>{
  calls.push({url,method:init.method??'GET',body:init.body?JSON.parse(init.body):null,headers:init.headers});
  if(url.endsWith('/sessions')&&init.method==='POST')return Response.json({id:options.createdSessionId??'sess_one',status:'in_progress'},{status:201});
  if(url.endsWith('/events'))return new Response(null,{status:202});
  if(url.includes('/items?'))return Response.json({has_more:false,data:[{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:turn,content:[{type:'output_text',text:answer}]}]});
  if(url.includes('/turns?'))return Response.json({has_more:false,data:[{id:turn,session_id:'sess_one',subagent_id:null,status:turnState},...(turn==='turn_two'?[{id:'turn_one',session_id:'sess_one',subagent_id:null,status:'completed'}]:[])]});
  options.onSessionRead?.();
  return Response.json({id:'sess_one',agent:{model,tools:options.sessionTools??AGENT_STUDIO_TOOLS},status,required_actions:actions,usage:{input_tokens:100,output_tokens:20,total_tokens:120}});
 };
 const deps={appOrigin:app,resolveActor:async()=>({userId,token:'jwt-synthetic'}),ownsProject:async()=>true,ownsVersion:async()=>true,store,bindings,studioBindings,attempts:{async bindRecovery(){},async finish(){}},usage:{async start(){return true;},async finish(){}},fetch,...options};
 return{...createStudioChatHandlers(deps),withBindings:values=>createStudioChatHandlers({...deps,...values}),calls,records,store,set:(v)=>{status=v.status??status;actions=v.actions??actions;turn=v.turn??turn;turnState=v.turnState??turnState;if(Object.hasOwn(v,'model'))model=v.model;answer=v.answer??answer;}};
}

const credentials=(source,key=apiKey)=>{
 const options={secret:Buffer.alloc(32,7),source,apiKey:key};
 return{bindings:createCredentialSessionBindings(options),studioBindings:createCredentialStudioBindings(options)};
};
const editArgs=()=>({projectId,requestId,revision:1,field:'offer',value:'Oficina fictícia'});
async function pendingAction(f,name='compor_editar_briefing',args=editArgs()){
 await f.chat(request(body));
 f.set({status:'requires_action',turnState:'waiting',actions:[{type:'function_call',name,turn_id:'turn_one',call_id:'call_one',arguments:args}]});
 return (await f.chat(request({op:'poll',apiKey,projectId,requestId}))).json();
}
const actionInput=(pending,result={status:'completed',revision:2})=>({apiKey,projectId,requestId,actionBinding:pending.declineBinding??pending.actionBinding,result});
const events=f=>f.calls.filter(call=>call.url?.endsWith('/events'));

for(const source of ['byok','default']){
 test(`${source}: prepared credential bindings acknowledge an unchanged local action once`,async()=>{
  const f=fixture(credentials(source)),pending=await pendingAction(f);
  assert.equal(pending.status,'action_required');
  const input=actionInput(pending),response=await f.action(request(input));
  assert.equal(response.status,202);assert.equal((await response.json()).status,'running');
  const repeated=await f.action(request(input));assert.equal(repeated.status,202);
  assert.equal((await repeated.json()).status,'unknown');assert.equal(events(f).length,1);
  assert.equal(events(f)[0].body.events[0].call_id,'call_one');
  assert.equal(f.records.get(requestId).state,'running');
 });
 test(`${source}: an image decline reaches the provider without image generation`,async()=>{
  const f=fixture(credentials(source)),pending=await pendingAction(f,'generate_image',{prompt:'Formas azuis'});
  assert.equal(pending.status,'consent_required');
  const response=await f.action(request(actionInput(pending,{status:'declined'})));
  assert.equal(response.status,202);assert.equal((await response.json()).status,'running');
  assert.equal(events(f).length,1);assert.equal(events(f)[0].body.events[0].success,false);
  assert.equal(f.calls.some(call=>call.url?.includes('/images/')),false);
 });
 test(`${source}: unknown local effects preserve uncertainty and send no continuation`,async()=>{
  const f=fixture(credentials(source)),pending=await pendingAction(f);
  const response=await f.action(request(actionInput(pending,{status:'unknown'})));
  assert.equal(response.status,202);assert.equal((await response.json()).status,'unknown');
  assert.equal(f.records.get(requestId).state,'unknown');assert.equal(events(f).length,0);
 });
 test(`${source}: an image success cannot bypass the image confirmation protocol`,async()=>{
  const f=fixture(credentials(source)),pending=await pendingAction(f,'generate_image',{prompt:'Formas azuis'});
  const response=await f.action(request(actionInput(pending,{status:'completed'})));
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'image_confirmation_required'});
  assert.equal(events(f).length,0);
 });
 test(`${source}: changed arguments or credentials cannot acknowledge a pending action`,async()=>{
  const f=fixture(credentials(source)),pending=await pendingAction(f),input=actionInput(pending);
  f.set({actions:[{type:'function_call',name:'compor_editar_briefing',turn_id:'turn_one',call_id:'call_one',arguments:{...editArgs(),value:'Changed'}}]});
  let response=await f.action(request(input));assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'invalid_binding'});
  f.set({actions:[{type:'function_call',name:'compor_editar_briefing',turn_id:'turn_one',call_id:'call_one',arguments:editArgs()}]});
  for(const invalid of [credentials(source,'sk-'+ 'b'.repeat(30)),credentials(source==='default'?'byok':'default')]){
   response=await f.withBindings(invalid).action(request(input));assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'invalid_binding'});
  }
  assert.equal(events(f).length,0);assert.equal(f.records.get(requestId).state,'action_required');
 });
}

test('a historical BYOK action completes through the credential wrapper in its original domain',async()=>{
 const f=fixture(),pending=await pendingAction(f),response=await f.withBindings(credentials('byok')).action(request(actionInput(pending)));
 assert.equal(response.status,202);assert.equal((await response.json()).status,'running');assert.equal(events(f).length,1);
});

test('serialized provider arguments retain the issued proof domain',async()=>{
 const f=fixture(credentials('default')),pending=await pendingAction(f,'compor_editar_briefing',JSON.stringify(editArgs()));
 const response=await f.action(request(actionInput(pending)));
 assert.equal(response.status,202);assert.equal((await response.json()).status,'running');assert.equal(events(f).length,1);
});

test('a proof that expires during provider lookup cannot send a result',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1000000});let expireOnRead=false;
 const f=fixture({...credentials('default'),onSessionRead:()=>{if(expireOnRead)t.mock.timers.tick(600000);}}),pending=await pendingAction(f);
 expireOnRead=true;
 const response=await f.action(request(actionInput(pending)));
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'invalid_binding'});
 assert.equal(events(f).length,0);assert.equal(f.records.get(requestId).state,'action_required');
});

test('the action claim compares stable argument digests across historical and credential-bound proofs',async()=>{
 const f=fixture(),pending=await pendingAction(f),claims=new Map(),digests=[];
 // Mirror claim_studio_action: the same call with different digests is a conflict.
 f.store.claimAction=async c=>{digests.push(c.actionDigest);const known=claims.get(c.callId);if(known)return known.actionDigest===c.actionDigest&&known.resultDigest===c.resultDigest?{status:'existing',id:known.id}:{status:'conflict'};claims.set(c.callId,{id:request2,actionDigest:c.actionDigest,resultDigest:c.resultDigest});return{status:'claimed',id:request2};};
 const byok=credentials('byok'),result={status:'completed',revision:2};
 const first=await f.withBindings(byok).action(request(actionInput(pending,result)));
 assert.equal(first.status,202);assert.equal((await first.json()).status,'running');
 const reissued=byok.studioBindings.issue({userId,projectId,requestId,attemptId,sessionId:'sess_one',turnId:'turn_one',callId:'call_one',name:'compor_editar_briefing',args:editArgs()});
 assert.notEqual(reissued,pending.actionBinding,'the new proof uses the credential-bound domain');
 const repeated=await f.withBindings(byok).action(request({apiKey,projectId,requestId,actionBinding:reissued,result}));
 assert.equal(repeated.status,202);assert.equal((await repeated.json()).status,'unknown','a repeated ACK is not a conflict and is not resent');
 assert.equal(digests.length,2);assert.equal(digests[0],digests[1]);
 assert.equal(digests[0],createStudioBindings({secret:Buffer.alloc(32,7)}).digest(editArgs()),'BYOK keeps the historical claim digest');
 assert.equal(events(f).length,1);
});
