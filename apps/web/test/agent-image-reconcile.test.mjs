import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentImageReconcile,createAgentImageWaitStatus} from '../lib/agent-image-reconcile.ts';
import {createSessionBindings} from '@compor/agents-api/session-binding';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic-token'};
const projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444';
const bindings=createSessionBindings({secret:Buffer.alloc(32,7)});
const actionBinding=bindings.issueAction({userId:actor.userId,projectId,attemptId,sessionId:'sess_test',turnId:'turn_test',callId:'call_test',prompt:'synthetic'});
const body={projectId,pieceId,version:3,attemptId,actionBinding};
const request=(input=body,origin='https://compor.test')=>new Request('https://compor.test/api/agent/image/reconcile',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)});

test('prova autenticada cerca a ação sem contato com o provedor e preserva a versão',async()=>{
 const calls=[];
 const handler=createAgentImageReconcile({appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsVersion:async value=>value.version===3,bindings,fence:async value=>{calls.push(value);return {status:'fenced'};}});
 const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'fenced'});
 assert.equal(calls.length,1);assert.equal(calls[0].version,3);assert.equal(calls[0].pieceId,pieceId);assert.equal(calls[0].callId,'call_test');
 assert.equal((await handler(request({...body,actionBinding:'invalid'}))).status,403);
 assert.equal((await handler(request(body,'https://other.test'))).status,403);
 assert.equal((await handler(request({...body,version:4}))).status,404);
 assert.equal(calls.length,1);
});
test('falha ou reserva anterior permanecem não verificadas',async()=>{
 for(const fence of [async()=>({status:'unverified'}),async()=>{throw Error('unavailable');}]){
  const handler=createAgentImageReconcile({appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsVersion:async()=>true,bindings,fence});
  const response=await handler(request());assert.deepEqual(await response.json(),{status:'unverified'});
 }
});

test('a prontidão usa a prova e a versão autorizada sem chave ou anexos',async()=>{
 const scopes=[];
 const handler=createAgentImageWaitStatus({
  appOrigin:'https://compor.test',resolveActor:async()=>actor,ownsVersion:async value=>value.version===3,bindings,
  getWaitStatus:async scope=>{scopes.push(scope);return {status:'waiting_planning'};},
 });
 const response=await handler(request());
 assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{status:'waiting_planning'});
 assert.deepEqual(scopes,[{actor,projectId,pieceId,version:3,attemptId,sessionId:'sess_test',turnId:'turn_test',callId:'call_test'}]);
 assert.equal((await handler(request({...body,apiKey:'synthetic'}))).status,400);
 assert.equal((await handler(request({...body,artworkInput:{}}))).status,400);
 assert.equal((await handler(request({...body,attemptId:pieceId}))).status,403);
 assert.equal((await handler(request({...body,version:4}))).status,404);
 assert.equal(scopes.length,1);
});
