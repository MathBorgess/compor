import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentImageRoute,createImageReceiptPreflight} from '../lib/agent-image-route.ts';
const actor={userId:'11111111-1111-4111-8111-111111111111',token:'private-token'};
const projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',executionId='55555555-5555-4555-8555-555555555555',assetId='66666666-6666-4666-8666-666666666666';
const requestId='77777777-7777-4777-8777-777777777777',contentSha256='a'.repeat(64);
const apiKey='sk-abcdefghijklmnopqrstuvwxyz123456';
const body={projectId,pieceId,version:1,attemptId,apiKey,actionBinding:'signed',explicitApproval:true};
const request=(value=body,origin='https://compor.test')=>new Request('https://compor.test/api/agent/image',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
function setup({allow=true,sendStatus='accepted'}={}) {
 const calls=[];const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async input=>{calls.push('approve');return allow && input.actor===actor?'approved':null;},execute:async()=>{calls.push('execute');return {status:'completed',executionId,toolResult:{output:JSON.stringify({assetId})}};},send:async()=>{calls.push('send');return {status:sendStatus};}});return {handler,calls};
}
test('aprovação explícita executa e retorna somente aceitação e asset',async()=>{const f=setup();const result=await f.handler(request());assert.equal(result.status,202);const data=await result.json();assert.deepEqual(data,{status:'accepted',assetId});assert.deepEqual(f.calls,['approve','execute','send']);assert.doesNotMatch(JSON.stringify(data),/sk-|private-token/);});
test('origem e confirmação inválidas não acionam geração',async()=>{for(const req of [request({...body,explicitApproval:false}),request(body,'https://evil.test')]){const f=setup();assert.notEqual((await f.handler(req)).status,202);assert.deepEqual(f.calls,[]);}});
test('autorização negada e resultado desconhecido não geram repetição',async()=>{let f=setup({allow:false});assert.equal((await f.handler(request())).status,403);assert.deepEqual(f.calls,['approve']);f=setup({sendStatus:'unknown'});const r=await f.handler(request());assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'result_unknown',retryAutomatically:false,assetId});assert.deepEqual(f.calls,['approve','execute','send']);});

test('prova de imagem só é persistida após execução e envio confirmados',async()=>{
 const calls=[];let storeFails=false,sendStatus='accepted',proofRecord=null;
 const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,
  approve:async()=>{calls.push('approve');return 'action-proof';},
  execute:async()=>{calls.push('execute');return {status:'completed',executionId,contentSha256,toolResult:{output:JSON.stringify({assetId})}};},
  send:async()=>{calls.push('send');return {status:sendStatus};},
  receipt:{preflight:async value=>{calls.push('preflight');assert.deepEqual(value,{actor,projectId,requestId,attemptId});return true;},store:async value=>{calls.push('store');proofRecord=value;if(storeFails)throw Error('response lost');}},
 });
 let response=await handler(request({...body,requestId}));assert.equal(response.status,202);assert.deepEqual(await response.json(),{status:'accepted',assetId});
 assert.deepEqual(calls,['preflight','approve','execute','send','store']);assert.deepEqual(proofRecord,{actor,projectId,requestId,attemptId,pieceId,version:1,executionId,assetId,contentSha256});
 calls.length=0;sendStatus='unknown';response=await handler(request({...body,requestId}));assert.equal(response.status,502);assert.deepEqual(calls,['preflight','approve','execute','send']);
 calls.length=0;sendStatus='accepted';storeFails=true;response=await handler(request({...body,requestId}));assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'result_unknown',retryAutomatically:false,assetId});assert.deepEqual(calls,['preflight','approve','execute','send','store']);
});

test('preflight de recibo indisponível ou escopo incompatível falha antes de gerar',async()=>{
 for(const preflight of [async()=>false,async()=>{throw Error('store unavailable');}]){
  let approvals=0,executions=0;
  const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>{approvals++;return 'proof';},execute:async()=>{executions++;return {status:'unknown'};},send:async()=>({status:'unknown'}),receipt:{preflight,store:async()=>{throw Error('unexpected');}}});
  const dispatchId='99999999-9999-4999-8999-999999999999';
  const response=await handler(request({...body,requestId,dispatchId}));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'image_preflight_unavailable',requestId,attemptId,dispatchId});assert.equal(approvals,0);assert.equal(executions,0);
  const legacy=await handler(request({...body,requestId}));assert.equal(legacy.status,503);assert.deepEqual(await legacy.json(),{error:'unavailable'});
 }
});

test('preflight vincula pedido e tentativa ao escopo e exige RPC disponível',async()=>{
 const context={actor,projectId,requestId,attemptId},turn={userId:actor.userId,projectId,requestId,attemptId,state:'action_required'};
 let current=turn,status='unverified',lookups=0;
 const preflight=createImageReceiptPreflight({getTurn:async value=>{assert.deepEqual(value,{actor,projectId,requestId});return current;},lookup:async()=>{lookups++;return {status};}});
 assert.equal(await preflight(context),true);assert.equal(lookups,1);
 for(const change of [{userId:assetId},{projectId:assetId},{requestId:assetId},{attemptId:assetId},{state:'completed'}]){current={...turn,...change};assert.equal(await preflight(context),false);}
 assert.equal(lookups,1,'não consulta nem autoriza recibo de escopo incompatível');current=turn;status='candidate';assert.equal(await preflight(context),false);
 const unavailable=createImageReceiptPreflight({getTurn:async()=>turn,lookup:async()=>{throw Error('missing RPC');}});await assert.rejects(()=>unavailable(context));
});

test('sem hash comprovável a imagem não produz recibo nem libera a tentativa',async()=>{
 let stores=0;const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>'proof',execute:async()=>({status:'completed',executionId,toolResult:{output:JSON.stringify({assetId})}}),send:async()=>({status:'accepted'}),receipt:{preflight:async()=>true,store:async()=>{stores++;}}});
 const response=await handler(request({...body,requestId}));assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'result_unknown',retryAutomatically:false,assetId});assert.equal(stores,0);
});

test('ocupação conhecida não envia resultado ao agente nem é classificada como geração incerta',async()=>{
 for(const status of ['busy','blocked']) {let sends=0;const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>'proof',execute:async()=>({status}),send:async()=>{sends++;}});const result=await handler(request());assert.equal(result.status,200);assert.deepEqual(await result.json(),{status});assert.equal(sends,0);}
});

test('fluxo HTTP com adaptadores reais e serviços simulados exige prova e evita segunda imagem',async()=>{
 const {createSessionBindings}=await import('../../../packages/agents-api/src/session-binding.mjs');
 const {createImageToolReservationStore}=await import('../../../packages/agents-api/src/image-tool-reservation.mjs');
 const {createImageToolApproval,createImageToolExecution}=await import('../../../packages/agents-api/src/image-tool-execution.mjs');
 const {createImageToolResultSender}=await import('../../../packages/agents-api/src/image-tool-result.mjs');
 const {createImageHandler}=await import('../../../packages/images-api/src/index.mjs');
 const {createPrivateImageHandler}=await import('../../../packages/private-images/src/index.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,7)}),prompt='Composição abstrata';
 const actionBinding=bindings.issueAction({userId:actor.userId,projectId,attemptId,sessionId:'sess_a',turnId:'turn_a',callId:'call_a',prompt});
 const reservationId='77777777-7777-4777-8777-777777777777',submissionId='88888888-8888-4888-8888-888888888888';
 let generationCount=0,postCount=0,claimed=false,saved=false;
 const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
 const fetch=async (target,init={})=>{
  const url=new URL(target),path=url.pathname;
  if(path==='/v1/agents/sessions/sess_a/events'){postCount++;return Response.json({}, {status:202});}
  if(path==='/v1/agents/sessions/sess_a')return Response.json({id:'sess_a',agent:{model:'gpt-6-astra'},status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:'call_a',arguments:{prompt}}]});
  if(path==='/v1/images/generations'){generationCount++;return Response.json({data:[{b64_json:png.toString('base64')}]});}
  if(path==='/rest/v1/piece_versions')return Response.json([{project_id:projectId,piece_id:pieceId,version:1,projects:{owner_id:actor.userId}}]);
  if(path.includes('/storage/v1/object/')){saved=true;return Response.json({});}
  if(path.endsWith('/reserve_image_tool_call'))return Response.json([{reservation_id:reservationId,state:'reserved',is_new:true}]);
  if(path.endsWith('/declare_image_generation_consent'))return Response.json([{declaration_id:reservationId,is_new:true}]);
  if(path.endsWith('/claim_image_tool_execution')){let first=!claimed;claimed=true;return Response.json([{execution_id:executionId,asset_id:assetId,state:'running',is_new:first}]);}
  if(path.endsWith('/complete_image_tool_execution')){assert.equal(saved,true);return Response.json(true);}
  if(path.endsWith('/claim_image_tool_result_submission'))return Response.json([{submission_id:submissionId,asset_id:assetId,state:'sending',is_new:true}]);
  if(path.endsWith('/finish_image_tool_result_submission'))return Response.json(true);
  throw Error('unexpected upstream');
 };
 const reservations=createImageToolReservationStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch});
 const ownsVersion=async({actor:a,projectId:p,pieceId:i,version:v})=>a.userId===actor.userId&&p===projectId&&i===pieceId&&v===1;
 const authenticate=async()=>actor;
 const route=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:authenticate,approve:createImageToolApproval({bindings,ownsVersion}),execute:createImageToolExecution({bindings,ownsVersion,reservations,fetch,appOrigin:'https://compor.test',imageHandler:createImageHandler({authenticate,fetch}),imageStorageHandler:createPrivateImageHandler({appOrigin:'https://compor.test',supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate,fetch})}),send:createImageToolResultSender({bindings,ownsVersion,reservations,fetch})});
 const first=await route(request({...body,actionBinding}));assert.equal(first.status,202);assert.deepEqual(await first.json(),{status:'accepted',assetId});
 const second=await route(request({...body,actionBinding}));assert.equal(second.status,502);assert.equal(generationCount,1);assert.equal(postCount,1);
 const tampered=await route(request({...body,actionBinding,pieceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}));assert.equal(tampered.status,403);assert.equal(generationCount,1);
});
test('asset já salvo permanece recuperável se envio do evento lançar erro',async()=>{
 const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>'proof',execute:async()=>({status:'completed',executionId,toolResult:{output:JSON.stringify({assetId})}}),send:async()=>{throw Error(apiKey);}});
 const response=await handler(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'result_unknown',retryAutomatically:false,assetId});
});
test('imagem confirmada no Storage permanece recuperável se registro final ficar incerto',async()=>{
 let sends=0;
 const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,approve:async()=>'proof',execute:async()=>({status:'unknown',retryAutomatically:false,assetId}),send:async()=>{sends++;}});
 const response=await handler(request());assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'result_unknown',retryAutomatically:false,assetId});assert.equal(sends,0);
});

test('HTTP preserva o pacote revisado e recusa entradas remotas antes de aprovar',async()=>{
 const artworkInput={literalText:{headline:'Oferta',price:'R$ 12',date:''},source:null,images:[]};
 let approvals=0,executions=0;
 const handler=createAgentImageRoute({appOrigin:'https://compor.test',resolveActor:async()=>actor,
  approve:async input=>{approvals++;assert.deepEqual(input.artworkInput,artworkInput);return 'proof';},
  execute:async input=>{executions++;assert.deepEqual(input.artworkInput,artworkInput);return {status:'unknown'};},send:async()=>{throw Error('unexpected');},
 });
 assert.equal((await handler(request({...body,artworkInput}))).status,502);
 for(const changed of [{...artworkInput,images:[{url:'http://127.0.0.1/private'}]},{...artworkInput,literalText:{headline:'Oferta'}},null]){
  assert.equal((await handler(request({...body,artworkInput:changed}))).status,400);
 }
 assert.equal(approvals,1);assert.equal(executions,1);
});
