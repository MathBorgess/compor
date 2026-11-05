import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRecoveryHandler } from '../src/recovery-route.mjs';
import { createSessionBindings } from '../src/session-binding.mjs';
const userId='a2b9eb55-83e4-41d5-b726-c28116a31234',projectId='a2b9eb55-83e4-41d5-b726-c28116a34321',attemptId='a2b9eb55-83e4-41d5-b726-c28116a39999',idempotencyKey='a2b9eb55-83e4-41d5-b726-c28116a32222',childId='a2b9eb55-83e4-41d5-b726-c28116a35555',apiKey='sk-test-01234567890123456789012';
const bindings=createSessionBindings({secret:Buffer.alloc(32,8)});
const binding=bindings.issueRecovery({userId,projectId,attemptId,sessionId:'sess_test'});
const actor={userId,token:'test-user-token'};
const request=(body={apiKey,projectId,idempotencyKey},origin='https://compor.test')=>new Request('https://compor.test/api/agent/recover',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
function deps(fetch) {return {appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsProject:async()=>true,bindings,attempts:{getRecovery:async()=>({attemptId,state:'unknown',binding}),start:async()=>({id:childId,state:'started',isNew:true})},fetch};}
test('an uncertain attempt can recover a still-pending image action without re-running the agent',async()=>{
 const calls=[];const action={type:'function_call',name:'generate_image',turn_id:'turn_x',call_id:'call_x',arguments:{prompt:'Papel azul'}};
 const h=createAgentRecoveryHandler(deps(async(url,opt)=>{calls.push(opt.method);return Response.json({id:'sess_test',status:'requires_action',required_actions:[action]});}));
 const res=await h(request());assert.equal(res.status,202);const data=await res.json();assert.equal(data.status,'consent_required');assert.equal(data.attemptId,childId);assert.equal(data.prompt,'Papel azul');assert.deepEqual(calls,['GET']);
 assert.equal(bindings.verifyAction({token:data.actionBinding,userId,projectId,attemptId:childId}).sessionId,'sess_test');
 assert.doesNotMatch(JSON.stringify(data),/sk-test|test-user-token/);
});
test('ongoing session is never retried and no action is emitted',async()=>{
 const h=createAgentRecoveryHandler(deps(async()=>Response.json({id:'sess_test',status:'in_progress',required_actions:[]})));
 assert.deepEqual(await (await h(request())).json(),{status:'in_progress',retryAutomatically:false});
});
test('cross-tenant, untrusted proofs, wrong origin and provider failures fail closed',async()=>{
 let calls=0;const d=deps(async()=>{calls++;return new Response('',{status:503});});
 assert.equal((await createAgentRecoveryHandler(d)(request(undefined,'https://evil.test'))).status,403);
 assert.equal((await createAgentRecoveryHandler({...d,ownsProject:async()=>false})(request())).status,404);
 assert.equal((await createAgentRecoveryHandler({...d,attempts:{...d.attempts,getRecovery:async()=>({attemptId,state:'unknown',binding:binding.slice(0,-1)+'X'})}})(request())).status,503);
 assert.equal(calls,0); assert.equal((await createAgentRecoveryHandler(d)(request())).status,503);assert.equal(calls,1);
});
test('a completed turn is reconstructed only from the confirmed root final answer',async()=>{
 const h=createAgentRecoveryHandler(deps(async(url)=>{
  if(url.endsWith('/turns?limit=100&order=asc'))return Response.json({has_more:false,data:[{id:'turn_root',session_id:'sess_test',subagent_id:null,status:'completed'}]});
  if(url.includes('/turns/turn_root/items'))return Response.json({has_more:false,data:[{type:'message',role:'assistant',status:'completed',phase:'commentary',turn_id:'turn_root',content:[{type:'output_text',text:'rascunho'}]},{type:'message',role:'assistant',status:'completed',phase:'final_answer',turn_id:'turn_root',content:[{type:'output_text',text:'Direção final'}]}]});
  return Response.json({id:'sess_test',status:'idle',required_actions:[]});
 }));
 assert.deepEqual(await (await h(request())).json(),{status:'completed',text:'Direção final',retryAutomatically:false});
});
test('ambiguous required actions and opaque credentials are not returned',async()=>{
 const action={type:'function_call',name:'generate_image',turn_id:'turn_x',call_id:'call_x',arguments:{prompt:'Papel azul'}};
 for(const required_actions of [[],[action,action],[{...action,arguments:{prompt:'A'.repeat(200)}}]]) {
  const h=createAgentRecoveryHandler(deps(async()=>Response.json({id:'sess_test',status:'requires_action',required_actions})));
  const response=await h(request());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Papel azul|A{128}/);
 }
});
test('idle alone and incomplete or multiple root turns never imply completion',async()=>{
 for(const data of [[],[{id:'turn_root',session_id:'sess_test',subagent_id:null,status:'failed'}],[{id:'turn_1',session_id:'sess_test',subagent_id:null,status:'completed'},{id:'turn_2',session_id:'sess_test',subagent_id:null,status:'completed'}]]) {
  let calls=0;const h=createAgentRecoveryHandler(deps(async(url)=>{calls++;return url.includes('/turns?')?Response.json({has_more:false,data}):Response.json({id:'sess_test',status:'idle',required_actions:[]});}));
  assert.deepEqual(await (await h(request())).json(),{status:'completed_unavailable',retryAutomatically:false});assert.equal(calls,2);
 }
});
