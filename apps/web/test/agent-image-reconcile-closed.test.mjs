import test from 'node:test';
import assert from 'node:assert/strict';
import {createClosedImageReconciliation} from '../lib/agent-image-reconcile-closed.ts';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic'};
const projectId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
const attemptId='44444444-4444-4444-8444-444444444444',pieceId='55555555-5555-4555-8555-555555555555',executionId='66666666-6666-4666-8666-666666666666',assetId='77777777-7777-4777-8777-777777777777';
const req=(body={projectId,requestId},origin='https://compor.test')=>new Request('https://compor.test/api/agent/image/reconcile-closed',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});

test('verifica somente a tentativa da conta autenticada e preserva incerteza',async()=>{
 const calls=[];
 const handler=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:async value=>{calls.push(value);return {status:'confirmed'};}});
 assert.deepEqual(await (await handler(req())).json(),{status:'confirmed'});
 assert.deepEqual(calls,[{actor,projectId,requestId}]);
 assert.equal((await handler(req({projectId,requestId,apiKey:'unexpected'}))).status,400);
 assert.equal((await handler(req(undefined,'https://elsewhere.test'))).status,403);
 const anonymous=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>null,confirm:async()=>{throw Error('unexpected')}});
 assert.equal((await anonymous(req())).status,401);
 const unavailable=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:async()=>{throw Error('unknown')}});
 assert.deepEqual(await (await unavailable(req())).json(),{status:'unverified'});
});

test('imagem recuperável exige assinatura válida com associação exata e não expõe prova',async()=>{
 const {createSessionBindings}=await import('../../../packages/agents-api/src/session-binding.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)}),contentSha256='a'.repeat(64);
 const fields={userId:actor.userId,projectId,requestId,attemptId,pieceId,version:1,executionId,assetId,contentSha256};
 const proof=bindings.issueImageReceipt(fields),good={status:'candidate',requestId,attemptId,pieceId,version:1,executionId,assetId,proof};
 let current=good,viewer=actor;
 const handler=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>viewer,confirm:async()=>({status:'unverified'}),candidate:async()=>current,
  verify:({proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})=>bindings.verifyImageReceipt({token:proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})});
 let response=await handler(req());assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'image_completed',requestId,pieceId,version:1,assetId,contentSha256});
 for(const change of [
  {requestId:'88888888-8888-4888-8888-888888888888'},
  {attemptId:'88888888-8888-4888-8888-888888888888'},
  {pieceId:'88888888-8888-4888-8888-888888888888'},
  {version:2}, {executionId:'88888888-8888-4888-8888-888888888888'},
  {assetId:'88888888-8888-4888-8888-888888888888'}, {proof:proof.slice(0,-1)+(proof.endsWith('A')?'B':'A')},
 ]) {current={...good,...change};response=await handler(req());assert.deepEqual(await response.json(),{status:'unverified'});}
 current=good;viewer={...actor,userId:'88888888-8888-4888-8888-888888888888'};response=await handler(req());assert.deepEqual(await response.json(),{status:'unverified'});
 viewer=actor;response=await handler(req({projectId:'88888888-8888-4888-8888-888888888888',requestId}));assert.deepEqual(await response.json(),{status:'unverified'});
 current={status:'unverified'};response=await handler(req());assert.deepEqual(await response.json(),{status:'unverified'});
});

test('resposta de gravação perdida conserva fence e prova persistida pode ser consultada sem repetir imagem',async()=>{
 const {createSessionBindings}=await import('../../../packages/agents-api/src/session-binding.mjs');
 const {createAgentImageRoute}=await import('../lib/agent-image-route.ts');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,9)}),contentSha256='b'.repeat(64);let imageCalls=0,candidateRecord=null;
 const generate=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>'proof',
  execute:async()=>{imageCalls++;return {status:'completed',executionId,contentSha256,toolResult:{output:JSON.stringify({assetId})}};},send:async()=>({status:'accepted'}),
  receipt:{preflight:async()=>true,store:async value=>{const {actor:who,...scope}=value;candidateRecord={status:'candidate',requestId,attemptId,pieceId,version:1,executionId,assetId,proof:bindings.issueImageReceipt({userId:who.userId,...scope})};throw Error('response lost after commit');}}});
 const body={projectId,requestId,attemptId,pieceId,version:1,apiKey:'sk-abcdefghijklmnopqrstuvwxyz123456',actionBinding:'signed',explicitApproval:true};
 const imageReq=new Request('https://compor.test/api/agent/image',{method:'POST',headers:{origin:'https://compor.test','content-type':'application/json'},body:JSON.stringify(body)});
 const result=await generate(imageReq);assert.equal(result.status,502);assert.deepEqual(await result.json(),{error:'result_unknown',retryAutomatically:false,assetId});
 const recover=createClosedImageReconciliation({appOrigin:'https://compor.test',resolveActor:async()=>actor,confirm:async()=>({status:'unverified'}),candidate:async()=>candidateRecord,
  verify:({proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})=>bindings.verifyImageReceipt({token:proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})});
 assert.deepEqual(await (await recover(req())).json(),{status:'image_completed',requestId,pieceId,version:1,assetId,contentSha256});assert.equal(imageCalls,1);
});
