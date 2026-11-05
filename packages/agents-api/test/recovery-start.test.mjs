import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAgentHandler } from '../src/project-route.mjs';
import { createSessionBindings } from '../src/session-binding.mjs';
const userId='a2b9eb55-83e4-41d5-b726-c28116a31234', projectId='a2b9eb55-83e4-41d5-b726-c28116a34321', attemptId='a2b9eb55-83e4-41d5-b726-c28116a39999';
const apiKey='sk-test-01234567890123456789012';
function request() {return new Request('https://compor.test/api/agent',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json','x-compor-project-id':projectId,'x-compor-attempt-id':attemptId},body:JSON.stringify({apiKey,objective:'Exemplo'})});}
const stream='data: {"type":"agent.session.created","session":{"id":"sess_test"}}\n\ndata: {"type":"agent.session.requires_action","session":{"id":"sess_test"}}\n\n';
test('the session is durably signed before a pending action is consulted',async()=>{
 const b=createSessionBindings({secret:Buffer.alloc(32,8)});let bound=false;
 const h=createProjectAgentHandler({appOrigin:'https://compor.test',resolveActor:async()=>({userId,token:'fake-token'}),ownsProject:async()=>true,bindings:b,enableRecovery:true,attempts:{start:async()=>({id:attemptId,state:'started',isNew:true}),finish:async()=>{},bindRecovery:async({binding})=>{assert.equal(b.verifyRecovery({token:binding,userId,projectId,attemptId}).sessionId,'sess_test');bound=true;}},fetch:async(_url,opt)=>{if(opt.method==='POST')return new Response(stream,{status:201});assert.equal(bound,true);return Response.json({id:'sess_test',status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_x',call_id:'call_x',arguments:{prompt:'Papel azul'}}]});}});
 assert.equal((await h(request())).status,202);
});
test('failed persistence stays uncertain, never retries the paid request or returns consent',async()=>{
 let calls=0,state;
 const b=createSessionBindings({secret:Buffer.alloc(32,8)});
 const h=createProjectAgentHandler({appOrigin:'https://compor.test',resolveActor:async()=>({userId,token:'fake-token'}),ownsProject:async()=>true,bindings:b,enableRecovery:true,attempts:{start:async()=>({id:attemptId,state:'started',isNew:true}),finish:async x=>{state=x.state;},bindRecovery:async()=>{throw Error('offline');}},fetch:async()=>{calls++;return new Response(stream,{status:201});}});
 const r=await h(request());assert.equal(r.status,502);assert.equal(state,'unknown');assert.equal(calls,1);
});
