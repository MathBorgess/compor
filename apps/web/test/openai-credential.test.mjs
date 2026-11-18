import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOpenAiRequest,credentialSigningKey,createCredentialStatusHandler} from '../lib/openai-credential.ts';
import {byokJsonHeaders,byokJsonMediaType} from '../lib/openai-byok-transport.ts';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {createStudioChatHandlers} from '@compor/agents-api/studio-chat';
import {createCredentialSessionBindings,createCredentialStudioBindings} from '../lib/openai-credential-bindings.ts';

const app='https://compor.example',projectId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444';
const ownKey='sk-'+ 'b'.repeat(30),defaultKey='sk-'+ 'd'.repeat(30),actor={userId,token:'verified-user-token'};
const request=(body,headers={})=>new Request(app+'/api/test',{method:'POST',headers:{origin:app,'content-type':'application/json',...headers},body:JSON.stringify(body)});
function fixture(extra={}){
  const calls=[];
  return {calls,deps:{appOrigin:app,defaultEnabled:true,resolveActor:async()=>{calls.push('actor');return actor;},ownsProject:async()=>{calls.push('project');return true;},ownsVersion:async()=>{calls.push('version');return true;},resolveDefault:async()=>{calls.push('vault');return defaultKey;},...extra}};
}
const options={bodyLimit:16384};

test('explicit own credentials, including invalid values, never inspect Vault',async()=>{
  for(const apiKey of [ownKey,'',null,'invalid']){
    const {calls,deps}=fixture({resolveActor:async()=>{throw Error('should not authenticate twice');}});
    const result=await prepareOpenAiRequest(request({projectId,apiKey}),deps,options);
    assert.equal(result.source,'byok');assert.equal((await result.request.json()).apiKey,apiKey);assert.deepEqual(calls,[]);
  }
  const {calls,deps}=fixture();
  const result=await prepareOpenAiRequest(request({projectId},{'x-compor-openai-key':''}),deps,{...options,keyLocation:'header'});
  assert.equal(result.source,'byok');assert.equal(result.request.headers.get('x-compor-openai-key'),'');assert.deepEqual(calls,[]);
});

test('a chave do navegador e a entrada legada preservam a mesma credencial interna',async()=>{
 for(const keyLocation of ['header-or-legacy-body','separate']){
  for(const [body,headers] of [[{projectId,apiKey:ownKey},{}],[{projectId},{'x-compor-openai-key':ownKey}]]){
   const {calls,deps}=fixture();
   const result=await prepareOpenAiRequest(request(body,headers),deps,{...options,keyLocation});
   assert.equal(result.source,'byok');assert.equal(result.apiKey,ownKey);assert.deepEqual(calls,[]);
   assert.equal(result.request.headers.has('x-compor-openai-key'),false);
   const expected=keyLocation==='separate'?{projectId}:{projectId,apiKey:ownKey};
   assert.deepEqual(await result.request.json(),expected);
  }
  const {calls,deps}=fixture();
  const invalid=await prepareOpenAiRequest(request({projectId},{'x-compor-openai-key':''}),deps,{...options,keyLocation});
  assert.equal(invalid.source,'byok');assert.equal(invalid.apiKey,undefined);
  const ambiguous=await prepareOpenAiRequest(request({projectId,apiKey:ownKey},{'x-compor-openai-key':ownKey}),deps,{...options,keyLocation});
  assert.equal(ambiguous.status,400);assert.deepEqual(await ambiguous.json(),{error:'invalid_request'});
  assert.deepEqual(calls,[]);
 }
});

test('o tipo BYOK impede que uma aba nova caia no Vault de uma versão antiga',async()=>{
 const headers=byokJsonHeaders(ownKey);
 // The prior body-only server used this check before reading credentials or Vault.
 assert.equal(/^application\/json(?:\s*;|$)/i.test(headers['content-type']),false);
 for(const keyLocation of ['body','header']){
  const {calls,deps}=fixture();
  assert.equal((await prepareOpenAiRequest(request({projectId},headers),deps,{...options,keyLocation})).status,400);
  assert.deepEqual(calls,[]);
 }
 for(const keyLocation of ['header-or-legacy-body','separate']){
  const {calls,deps}=fixture();
  const opts={...options,keyLocation};
  const result=await prepareOpenAiRequest(request({projectId},headers),deps,opts);
  assert.equal(result.source,'byok');
  assert.equal(result.apiKey,ownKey);
  assert.equal(result.request.headers.get('content-type'),'application/json');
  const missing=await prepareOpenAiRequest(request({projectId},{'content-type':byokJsonMediaType}),deps,opts);
  assert.equal(missing.status,400);
  const ambiguous=await prepareOpenAiRequest(request({projectId,apiKey:ownKey},headers),deps,opts);
  assert.equal(ambiguous.status,400);
  assert.deepEqual(calls,[]);
 }
});

test('missing credential is resolved after verified project and exact version ownership',async()=>{
  const {calls,deps}=fixture();
  const result=await prepareOpenAiRequest(request({projectId,pieceId,version:2}),deps,{...options,versionScope:true});
  assert.equal(result.source,'default');assert.equal(result.actor,actor);
  assert.deepEqual(calls,['actor','project','version','vault']);
  assert.equal((await result.request.json()).apiKey,defaultKey);
  assert.equal(result.request.headers.get('origin'),app);
  const header=await prepareOpenAiRequest(request({projectId}),deps,{...options,keyLocation:'header'});
  assert.equal(header.request.headers.get('x-compor-openai-key'),defaultKey);
  assert.deepEqual(await header.request.json(),{projectId});
  const separate=await prepareOpenAiRequest(request({projectId}),deps,{...options,keyLocation:'separate'});
  assert.equal(separate.source,'default');assert.equal(separate.apiKey,defaultKey);
  assert.equal(separate.request.headers.has('x-compor-openai-key'),false);
  assert.deepEqual(await separate.request.json(),{projectId});
});

test('unauthenticated, cross-project, cross-version and invalid-origin requests never read Vault',async()=>{
  for(const [extra,opts,status] of [[{resolveActor:async()=>null},{},401],[{ownsProject:async()=>false},{},404],[{ownsVersion:async()=>false},{versionScope:true},404]]){
    const {calls,deps}=fixture(extra);
    const result=await prepareOpenAiRequest(request({projectId,pieceId,version:1}),deps,{...options,...opts});
    assert.equal(result.status,status);assert.equal(calls.includes('vault'),false);
  }
  const {calls,deps}=fixture();
  assert.equal((await prepareOpenAiRequest(request({projectId},{origin:'https://other.example'}),deps,options)).status,403);
  assert.deepEqual(calls,[]);
});

test('default failure is safe, bounded and happens before a provider reservation',async()=>{
  for(const resolveDefault of [async()=>null,async()=>'',async()=>{throw Error(defaultKey); }]){
    const {deps}=fixture({resolveDefault});
    const result=await prepareOpenAiRequest(request({projectId}),deps,options);
    assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:'default_credential_unavailable'});
  }
  const {calls,deps}=fixture();
  const tooLarge=await prepareOpenAiRequest(request({projectId,prompt:'x'.repeat(100)}),deps,{bodyLimit:30,bodyTooLargeStatus:413});
  assert.equal(tooLarge.status,413);assert.deepEqual(calls,[]);
  const correlated=await prepareOpenAiRequest(request({projectId}),fixture({resolveDefault:async()=>null}).deps,{...options,failure:(_error,status)=>Response.json({status:'not_started',requestId:attemptId,retryAutomatically:false},{status})});
  assert.deepEqual(await correlated.json(),{status:'not_started',requestId:attemptId,retryAutomatically:false});
});

test('disabled default keeps legacy missing-key validation without Vault access',async()=>{
  const {calls,deps}=fixture({defaultEnabled:false});
  const result=await prepareOpenAiRequest(request({projectId}),deps,options);
  assert.equal(result.source,'byok');assert.deepEqual(await result.request.json(),{projectId});assert.deepEqual(calls,[]);
});

test('missing Vault key distinguishes a fresh chat dispatch from an older turn poll',async()=>{
  const {deps}=fixture({resolveDefault:async()=>null});
  for(const op of [undefined,'submit','reference_selection']){
    const fresh=await prepareOpenAiRequest(request({projectId,requestId:attemptId,...(op?{op}:{})}),deps,{...options,freshSubmission:true});
    assert.equal(fresh.status,503);
    assert.deepEqual(await fresh.json(),{status:'failed',error:'default_credential_unavailable',failurePhase:'before_submission',requestId:attemptId,retryAutomatically:false});
  }
  const poll=await prepareOpenAiRequest(request({projectId,requestId:attemptId,op:'poll'}),deps,{...options,freshSubmission:true});
  assert.equal(poll.status,503);assert.deepEqual(await poll.json(),{error:'default_credential_unavailable'});
  const otherRoute=await prepareOpenAiRequest(request({projectId,requestId:attemptId}),deps,options);
  assert.deepEqual(await otherRoute.json(),{error:'default_credential_unavailable'});
});

test('credential source separates recovery and tool proofs while preserving historical BYOK',()=>{
  const secret=Buffer.alloc(32,7),standard=credentialSigningKey(secret,'byok'),shared=credentialSigningKey(secret,'default');
  assert.equal(standard,secret);assert.notDeepEqual(shared,secret);assert.equal(credentialSigningKey(null,'default'),null);
  const byok=createSessionBindings({secret:standard}),fallback=createSessionBindings({secret:shared});
  const scope={userId,projectId,attemptId,sessionId:'sess_test'};
  const ownProof=byok.issueRecovery(scope),defaultProof=fallback.issueRecovery(scope);
  assert.ok(byok.verifyRecovery({...scope,token:ownProof}));assert.equal(byok.verifyRecovery({...scope,token:defaultProof}),null);
  assert.ok(fallback.verifyRecovery({...scope,token:defaultProof}));assert.equal(fallback.verifyRecovery({...scope,token:ownProof}),null);
  const ownStudio=createStudioBindings({secret:standard}),defaultStudio=createStudioBindings({secret:shared});
  const action={...scope,requestId:attemptId,turnId:'turn_test',callId:'call_test',name:'compor_novo_post',args:{projectId}};
  const actionProof=defaultStudio.issue(action);
  assert.ok(defaultStudio.verify({...action,token:actionProof}));assert.equal(ownStudio.verify({...action,token:actionProof}),null);
  for(const proof of [ownProof,defaultProof,actionProof])assert.equal(Buffer.from(proof.split('.')[1],'base64url').toString().includes(defaultKey),false);
});

test('authenticated availability exposes a boolean only and never starts a provider operation',async()=>{
  let reads=0;
  const handler=createCredentialStatusHandler({appOrigin:app,resolveActor:async()=>actor,resolveDefault:async()=>{reads++;return defaultKey;}});
  const response=await handler(new Request(app+'/api/ai/credential-status'));
  assert.deepEqual(await response.json(),{defaultAvailable:true});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(reads,1);
  const unauth=createCredentialStatusHandler({appOrigin:app,resolveActor:async()=>null,resolveDefault:async()=>{throw Error('must not read');}});
  const denied=await unauth(new Request(app+'/api/ai/credential-status'));
  assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{defaultAvailable:false});
  const cross=await handler(new Request(app+'/api/ai/credential-status',{headers:{origin:'https://other.example'}}));
  assert.equal(cross.status,403);assert.equal(reads,1);
});

test('polling a managed turn with another credential or source never contacts OpenAI',async()=>{
  const secret=Buffer.alloc(32,7);
  for(const [originalSource,originalKey,requestedSource,requestedKey] of [['byok',ownKey,'default',defaultKey],['default',defaultKey,'byok',ownKey],['byok',ownKey,'byok','sk-'+ 'z'.repeat(30)]]){
    const oldBindings=createCredentialSessionBindings({secret,source:originalSource,apiKey:originalKey});
    const binding=oldBindings.issueRecovery({userId,projectId,attemptId,sessionId:'sess_private'});
    const {deps}=fixture();
    const headers=requestedSource==='byok'?{'x-compor-openai-key':requestedKey}:{};
    const prepared=await prepareOpenAiRequest(request({projectId,requestId:attemptId,op:'poll'},headers),deps,{...options,keyLocation:'header-or-legacy-body'});
    let providerCalls=0;
    const noop=async()=>{};
    const store={reserve:noop,get:async()=>({state:'running',attemptId,requestId:attemptId,binding}),bind:noop,state:noop,claimAction:noop,finishAction:noop,getAction:noop};
    const handler=createStudioChatHandlers({appOrigin:app,resolveActor:async()=>actor,ownsProject:async()=>true,store,attempts:{bindRecovery:noop,finish:noop},bindings:createCredentialSessionBindings({secret,source:prepared.source,apiKey:prepared.apiKey}),studioBindings:createCredentialStudioBindings({secret,source:prepared.source,apiKey:prepared.apiKey}),fetch:async()=>{providerCalls++;throw Error('must not contact another source');}});
    const response=await handler.chat(prepared.request),body=await response.json();
    assert.equal(response.status,202);assert.equal(body.status,'unknown');assert.equal(body.retryAutomatically,false);assert.equal(providerCalls,0);
  }
});

test('inspect_pending aceita apenas prova vinculada à fonte e chave originais, sem ações ou conteúdo',async()=>{
 const secret=Buffer.alloc(32,7),scope={userId,projectId,attemptId,sessionId:'sess_private'};
 for(const [originalSource,originalKey,requestedSource,requestedKey,legacy,allowed] of [
  ['byok',ownKey,'byok',ownKey,false,true],['default',defaultKey,'default',defaultKey,false,true],
  ['byok',ownKey,'byok','sk-'+ 'z'.repeat(30),false,false],['byok',ownKey,'default',defaultKey,false,false],
  ['default',defaultKey,'byok',ownKey,false,false],['byok',ownKey,'byok',ownKey,true,false],
 ]){
  const binding=legacy?createSessionBindings({secret}).issueRecovery(scope):createCredentialSessionBindings({secret,source:originalSource,apiKey:originalKey}).issueRecovery(scope);
  const {deps}=fixture();
  const prepared=await prepareOpenAiRequest(request({projectId,requestId:attemptId,op:'inspect_pending',...(requestedSource==='byok'?{apiKey:requestedKey}:{})}),deps,{...options,freshSubmission:true});
  let calls=0,writes=0;const forbidden=async()=>{writes++;throw Error('unexpected mutation');};
  const record={state:'running',userId,projectId,attemptId,requestId:attemptId,binding,turnId:'turn_one'};
  const store={reserve:forbidden,get:async()=>record,bind:forbidden,state:forbidden,claimAction:forbidden,finishAction:forbidden,getAction:forbidden};
  const handler=createStudioChatHandlers({appOrigin:app,resolveActor:async()=>actor,ownsProject:async()=>true,store,attempts:{bindRecovery:forbidden,finish:forbidden},bindings:createCredentialSessionBindings({secret,source:prepared.source,apiKey:prepared.apiKey}),studioBindings:createCredentialStudioBindings({secret,source:prepared.source,apiKey:prepared.apiKey}),fetch:async(url,init)=>{calls++;assert.equal(init.method??'GET','GET');if(url.includes('/turns?'))return Response.json({has_more:false,data:[{id:'turn_one',session_id:'sess_private',subagent_id:null,status:'waiting'}]});return Response.json({id:'sess_private',status:'requires_action',required_actions:[{type:'function_call',turn_id:'turn_one',name:'generate_image',arguments:{prompt:'PRIVATE_CONTENT'},call_id:'call_one'}]});}});
  const response=await handler.chat(prepared.request),result=await response.json();
  assert.deepEqual(result,{status:allowed?'action_required':'unknown',retryAutomatically:false});assert.equal(calls,allowed?2:0);assert.equal(writes,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_CONTENT|sk-|call_one|generate_image/);
 }
});
