import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createImageToolApproval} from '@compor/agents-api/image-tool-execution';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createAgentImageRoute} from '../lib/agent-image-route.ts';
import {createAgentImageReconcile} from '../lib/agent-image-reconcile.ts';

const actor={userId:'11111111-1111-4111-8111-111111111111',token:'synthetic-token'};
const projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444';
const referenceId='55555555-5555-4555-8555-555555555555',executionId='66666666-6666-4666-8666-666666666666',assetId='77777777-7777-4777-8777-777777777777';
const origin='https://compor.test',apiKey='sk-syntheticabcdefghijklmnopqrstuvwxyz';
const request=body=>new Request(`${origin}/api/agent/image`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});

function fixture({visual=true,empty=false}={}) {
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
 const meta={sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png',byteLength:bytes.length};
 const manifest={version:1,policy:'optimized-v1',entries:empty?[]:[{id:referenceId,ordinal:1,role:'reference',inputOrigin:'local-upload',original:meta,transport:{...meta,width:1,height:1},transformation:'none'}]};
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)});
 const artworkInput={literalText:{headline:'',price:'',date:''},source:null,images:empty?[]:[{id:referenceId,role:'reference',mime:'image/png',data:bytes.toString('base64')}],...(visual?{visualInput:manifest}:{})};
 const proposal={prompt:'Composição sintética',operation:'create',baseImageId:null,referenceIds:empty?[]:[referenceId]};
 const actionBinding=bindings.issueAction({userId:actor.userId,projectId,attemptId,sessionId:'sess_visual',turnId:'turn_visual',callId:'call_visual',proposal,...(visual?{visualInputDigest:visualInputDigest(manifest)}:{})});
 const body={projectId,pieceId,attemptId,...(visual?{requestId:referenceId}:{}),version:1,actionBinding,apiKey,explicitApproval:true,artworkInput};
 const ownsVersion=async scope=>scope.actor.userId===actor.userId&&scope.projectId===projectId&&scope.pieceId===pieceId&&scope.version===1;
 return {bindings,body,ownsVersion};
}

function route(f,options={}) {
 const calls=[];
 const approve=createImageToolApproval({bindings:f.bindings,ownsVersion:f.ownsVersion});
 const handler=createAgentImageRoute({appOrigin:origin,resolveActor:async()=>actor,
  approve:async input=>{calls.push('approve');return approve(input);},
  execute:async input=>{calls.push('execute');assert.ok(f.bindings.verifyApprovedAction({token:input.actionBinding,userId:actor.userId,projectId,pieceId,attemptId,version:1}));return {status:'completed',executionId,toolResult:{output:JSON.stringify({assetId})}};},
  prepareVisualAuthority:async input=>({requestId:input.requestId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:null}),
  send:async()=>{calls.push('send');return {status:'accepted'};},...options,
 });
 return {handler,calls};
}

test('desligamento visual bloqueia prova válida anterior antes de aprovação ou execução',async()=>{
 for(const empty of [false,true])for(const options of [{},{visualEnabled:false}]) {
  const f=fixture({empty});
  assert.ok(f.bindings.verifyAction({token:f.body.actionBinding,userId:actor.userId,projectId,attemptId}));
  const enabled=route(f,{visualEnabled:true});
  assert.equal((await enabled.handler(request(f.body))).status,202);
  assert.deepEqual(enabled.calls,['approve','execute','send']);
  const disabled=route(f,options),response=await disabled.handler(request(f.body));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'unavailable'});
  assert.deepEqual(disabled.calls,[]);
 }
});

test('desligamento visual preserva geração legada com anexos e reconciliação da prova visual',async()=>{
 const legacyFixture=fixture({visual:false}),legacy=route(legacyFixture,{visualEnabled:false});
 assert.equal((await legacy.handler(request(legacyFixture.body))).status,202);
 assert.deepEqual(legacy.calls,['approve','execute','send']);
 const f=fixture(),calls=[];
 const reconcile=createAgentImageReconcile({appOrigin:origin,resolveActor:async()=>actor,ownsVersion:f.ownsVersion,bindings:f.bindings,fence:async input=>{calls.push(input);return {status:'unverified'};}});
 const {projectId,pieceId,attemptId,version,actionBinding}=f.body;
 const response=await reconcile(request({projectId,pieceId,attemptId,version,actionBinding}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'unverified'});
 assert.equal(calls.length,1);assert.equal(calls[0].callId,'call_visual');
});

test('modo visual exigido não admite arte legada sem manifesto',async()=>{
 const f=fixture({visual:false}),enabled=route(f,{visualEnabled:true,visualRequired:true});
 assert.equal((await enabled.handler(request(f.body))).status,503);assert.deepEqual(enabled.calls,[]);
 const unavailable=route(f,{visualEnabled:false,visualRequired:true});
 assert.equal((await unavailable.handler(request(f.body))).status,503);assert.deepEqual(unavailable.calls,[]);
});

test('arte exige snapshot do turno correto antes de aprovar ou executar',async()=>{
 const f=fixture();
 for(const options of [
  {visualEnabled:true,prepareVisualAuthority:undefined},
  {visualEnabled:true,prepareVisualAuthority:async()=>null},
  {visualEnabled:true,prepareVisualAuthority:async input=>({requestId:assetId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:null})},
  {visualEnabled:true,prepareVisualAuthority:async input=>({requestId:input.requestId,manifestDigest:'f'.repeat(64),consentSecret:null})},
 ]){const checked=route(f,options);assert.ok([403,503].includes((await checked.handler(request(f.body))).status));assert.deepEqual(checked.calls,[]);}
});

test('remover manifesto não converte a prova visual anterior em autorização legada',async()=>{
 const f=fixture(),disabled=route(f,{visualEnabled:false});
 const {visualInput,...artworkInput}=f.body.artworkInput;
 assert.ok(visualInput);
 const {requestId,...legacyBody}=f.body;
 const response=await disabled.handler(request({...legacyBody,artworkInput}));
 assert.equal(response.status,403);assert.deepEqual(disabled.calls,['approve']);
});
