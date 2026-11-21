import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { imageProposalDigest, artworkInputDigest } from '../src/artwork-input.mjs';
import { createImageToolExecution, createImageToolApproval } from '../src/image-tool-execution.mjs';

const userId = '11111111-1111-4111-8111-111111111111', projectId = '22222222-2222-4222-8222-222222222222', pieceId = '33333333-3333-4333-8333-333333333333', attemptId = '44444444-4444-4444-8444-444444444444', reservationId = '55555555-5555-4555-8555-555555555555', executionId = '66666666-6666-4666-8666-666666666666', assetId = '77777777-7777-4777-8777-777777777777';
const key = 'sk-abcdefghijklmnopqrstuvwxyz123456', actor = { userId, token: 'private-user-token' }, prompt = 'imagem de teste';
const claim = { userId, projectId, attemptId, sessionId:'sess_a', turnId:'turn_a', callId:'call_a', proposalDigest:imageProposalDigest({prompt}) };
const approvedClaim = {...claim,pieceId,version:1,artworkDigest:artworkInputDigest()};
function fixture(options = {}) {
  const calls = [], state = { claimed: false };
  const fn = createImageToolExecution({
    qualityHoldEnabled: Boolean(options.holdExecution),
    bindings: { verifyApprovedAction: ({userId: u, pieceId: p, version: v}) => u === userId && p === pieceId && v === 1 ? {...approvedClaim,callId:options.callId??approvedClaim.callId,artworkDigest:artworkInputDigest(options.artworkInput)} : null },
    ownsVersion: async () => !options.accessRevoked,
    fetch: async () => { calls.push('lookup'); return Response.json({ id:'sess_a', status:'requires_action', required_actions:[{ type:'function_call', name:'generate_image', turn_id:'turn_a', call_id:options.pendingCallId??options.callId??'call_a', arguments:{prompt:options.prompt ?? prompt} }] }); },
    reservations: {
      reserve: async () => { calls.push('reserve'); return {id:reservationId,state:'reserved'}; },
      declareConsent: async () => { calls.push('consent'); },
      claimExecution: async input => { calls.push('claim'); options.claimed?.(input); if (options.nextClaim) return options.nextClaim(); if (options.claimState) return {state:options.claimState}; if (state.claimed) return {id:executionId,assetId,state:'unknown',isNew:false}; state.claimed=true; return {id:executionId,assetId,state:'running',isNew:true}; },
      ...(options.holdExecution?{holdExecution:options.holdExecution}:{}),
      ...(options.failExecution?{failExecution:async input=>{calls.push('fail');await options.failExecution(input);}}:{}),
      ...(options.readExecutionClosure?{readExecutionClosure:options.readExecutionClosure}:{}),
      markExecutionUnknown: async () => {calls.push('unknown');},
      completeExecution: async () => {calls.push('complete'); if(options.completeFail) throw Error(key);},
    },
    imageHandler: async (req,review) => { calls.push('image'); if(options.imageHandler)return options.imageHandler(req,review); assert.equal((await req.json()).apiKey,key); if(options.imageFail) throw Error(key); return Response.json({imageBase64:Buffer.from('image').toString('base64'),usage:options.imageUsage??null}); },
    imageStorageHandler: async req => {calls.push('storage'); assert.equal(new URL(req.url).searchParams.get('assetId'),assetId); if(options.storageFail) throw Error(key); return Response.json({status:'stored',assetId},{status:201});},
    usage: options.usage,
    appOrigin:'https://example.test',
  });
  const input = {actor,projectId,pieceId,version:1,attemptId,actionBinding:'signed',apiKey:key,explicitApproval:true,...(options.artworkInput?{artworkInput:options.artworkInput}:{})};
  return {fn,input,calls};
}
test('atendimento único vincula sessão, declaração e asset e devolve tool_result', async()=>{
 const {fn,input,calls}=fixture(); const result=await fn(input); assert.equal(result.status,'completed'); assert.equal(result.toolResult.success,true); assert.equal(JSON.parse(result.toolResult.output).assetId,assetId); assert.deepEqual(calls,['lookup','reserve','consent','claim','image','storage','complete']); assert.ok(!JSON.stringify(result).includes(key));
 const second=await fn(input); assert.equal(second.status,'unknown'); assert.equal(calls.filter(x=>x==='image').length,1);
});

test('claim ocupado ou bloqueado é informado antes da geração paga',async()=>{
 for(const claimState of ['busy','blocked']) {const f=fixture({claimState});assert.deepEqual(await f.fn(f.input),{status:claimState});assert.ok(!f.calls.includes('image'));assert.ok(!f.calls.includes('unknown'));}
});

test('instrumentação deve reservar medição antes de gerar imagem paga',async()=>{
 let measurements=0;
 const usage={start:async()=>{measurements++;return false;},finish:async()=>{}};
 const f=fixture({usage});assert.equal((await f.fn(f.input)).status,'unknown');assert.equal(measurements,1);assert.ok(!f.calls.includes('image'));
});

test('medição registra contagens recebidas e preserva imagem se registro final falhar',async()=>{
 const records=[];let fail=false;
 const usage={start:async ctx=>{records.push({step:'start',ctx});return true;},finish:async ctx=>{records.push({step:'finish',ctx});if(fail)throw Error(key);}};
 let f=fixture({usage,imageUsage:{input_tokens:10,output_tokens:20,total_tokens:30}}),result=await f.fn(f.input);
 assert.equal(result.status,'completed');assert.equal(result.usageRecorded,true);assert.deepEqual(records[1].ctx.usage,{input_tokens:10,output_tokens:20,total_tokens:30});
 fail=true;f=fixture({usage});result=await f.fn(f.input);assert.equal(result.status,'completed');assert.equal(result.usageRecorded,false);assert.ok(f.calls.includes('storage'));assert.doesNotMatch(JSON.stringify(result),/sk-/);
});
test('recusa outra conta, autorização ausente ou prompt alterado antes da geração',async()=>{
 for(const scenario of ['actor','approval','prompt']) { const f=fixture({prompt:scenario==='prompt'?'alterado':undefined}); if(scenario==='actor') f.input.actor={...actor,userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}; if(scenario==='approval') f.input.explicitApproval=false; assert.notEqual((await f.fn(f.input)).status,'completed'); assert.ok(!f.calls.includes('image')); }
});
test('exec assinado não permite troca pelo ID de outra chamada nem por outra conta',async()=>{
 const callId='exec_'+ 'e'.repeat(56);
 for(const scenario of ['actor','mismatch']){
  const f=fixture({callId,...(scenario==='mismatch'?{pendingCallId:'exec_other'}:{})});if(scenario==='actor')f.input.actor={...actor,userId:projectId};
  assert.equal((await f.fn(f.input)).status,'rejected');assert.ok(!f.calls.includes('reserve'));assert.ok(!f.calls.includes('image'));
 }
});
test('400, 429 e 500 encerram sem repetir a imagem nem reutilizar o pedido', async () => {
  const cases = [
    [400, 'provider_rejected_400', 'failure'],
    [429, 'provider_rejected_429', 'retryable'],
    [503, 'result_unknown', 'retryable'],
  ];
  for (const [status, closureReason, providerOutcome] of cases) {
    let phase = 'new';
    const failed = [];
    const f = fixture({
      nextClaim: () => phase === 'new' ? (phase = 'replay', {id:executionId, assetId, state:'running', isNew:true}) : {id:executionId, assetId, state:'failed', isNew:false},
      failExecution: async input => { failed.push(input); },
      readExecutionClosure: async () => ({ closureReason, providerOutcome }),
      imageHandler: async () => Response.json({ error:'generation_not_produced', closureReason, providerOutcome, retryAutomatically:false }, { status }),
    });
    assert.deepEqual(await f.fn(f.input), { status:'failed', closureReason, providerOutcome, retryAutomatically:false });
    assert.equal(failed.length, 1);
    assert.equal(failed[0].executionId, executionId);
    assert.deepEqual(await f.fn(f.input), { status:'failed', closureReason, providerOutcome, retryAutomatically:false });
    assert.equal(f.calls.filter(call => call === 'image').length, 1);
    assert.equal(f.calls.includes('unknown'), false);
  }
});

test('timeout depois do claim marca incerteza e não repete a imagem', async () => {
  const f = fixture({ imageHandler: async () => { throw Object.assign(new Error('timeout'), { name:'TimeoutError' }); } });
  assert.deepEqual(await f.fn(f.input), { status:'unknown', retryAutomatically:false });
  assert.equal(f.calls.filter(call => call === 'image').length, 1);
  assert.equal(f.calls.filter(call => call === 'unknown').length, 1);
  assert.equal(f.calls.includes('fail'), false);
  await f.fn(f.input);
  assert.equal(f.calls.filter(call => call === 'image').length, 1);
});

test('falhas após claim preservam resultado desconhecido sem repetir imagem',async()=>{
 for(const option of ['imageFail','storageFail','completeFail']) {const f=fixture({[option]:true}); const result=await f.fn(f.input); assert.equal(result.status,'unknown'); assert.ok(f.calls.includes('unknown')); assert.ok(!JSON.stringify(result).includes(key)); await f.fn(f.input); assert.equal(f.calls.filter(x=>x==='image').length,1);}
});

test('revisão local atesta a retenção paga antes do Storage e do tool_result', async () => {
  const {createImageHandler}=await import('../../images-api/src/index.mjs');
  const imageBase64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
  const handler=createImageHandler({
    authenticate:async()=>actor,
    fetch:async()=>Response.json({data:[{b64_json:imageBase64}]}),
    reviewCandidate:async()=>({decision:'reject',findings:[{code:'visual_integrity',region:'borda',evidence:'Peça corrompida na borda.'}]}),
  });
  const artworkInput={literalText:{headline:'Inscrição',price:'   ',date:'14 de agosto',fields:[
    {id:'88888888-8888-4888-8888-888888888888',label:'Aviso',value:' Pague no dia ',origin:'user'},
    {id:'99999999-9999-4999-8999-999999999999',label:'Local',value:' ',origin:'agent'},
  ]},source:null,images:[]};
  let digest;
  const receipts=[],measurements=[];
  const imageHandler=async(request,review)=>{
    assert.deepEqual(review.requiredText,['Inscrição','14 de agosto',' Pague no dia ']);
    assert.deepEqual(Object.keys(await request.clone().json()).sort(),['apiKey','authorizeGeneration','images','prompt']);
    return handler(request,review);
  };
  const {fn,input,calls}=fixture({artworkInput,imageHandler,claimed:claim=>{digest=claim.qualityDigest;},holdExecution:async value=>{receipts.push(value);},usage:{start:async()=>true,finish:async value=>{measurements.push(value);}}});
  assert.deepEqual(await fn(input),{status:'quality_held',qualityReason:'image_quality_rejected',retryAutomatically:false,usageRecorded:true});
  assert.equal(receipts.length,1);
  assert.equal(receipts[0].executionId,executionId);
  assert.equal(receipts[0].qualityReason,'image_quality_rejected');
  assert.equal(createHash('sha256').update(Buffer.from(receipts[0].qualitySecret,'hex')).digest('hex'),digest);
  assert.deepEqual(measurements.map(record=>[record.part,record.state]),[['image','completed']]);
  assert.ok(!calls.includes('storage')&&!calls.includes('complete')&&!calls.includes('unknown'));
  await fn(input);
  assert.equal(calls.filter(call=>call==='image').length,1);
});

test('falha ao gravar a retenção mantém incerteza sem entregar a imagem',async()=>{
  const f=fixture({holdExecution:async()=>{throw Error('lost receipt');},imageHandler:async()=>Response.json({error:'image_quality_inconclusive',retryAutomatically:false,usage:null},{status:503})});
  assert.deepEqual(await f.fn(f.input),{status:'unknown',retryAutomatically:false});
  assert.ok(f.calls.includes('unknown'));
  assert.ok(!f.calls.includes('storage')&&!f.calls.includes('complete'));
});

test('texto literal malformado é recusado antes de reservar uma revisão', async()=>{
  const artworkInput={literalText:{headline:'Inscrição\uD800',price:'',date:''},source:null,images:[]};
  const f=fixture({artworkInput,holdExecution:async()=>{}});
  assert.deepEqual(await f.fn(f.input),{status:'invalid_prompt'});
  assert.deepEqual(f.calls,[]);
});

test('cancelamento durante revisão retém uma candidata recebida mesmo se o adaptador simulado aprovar',async()=>{
  const controller=new AbortController();
  const f=fixture({holdExecution:async()=>{},imageHandler:async(req,{authorizeReview})=>{
    assert.equal(await authorizeReview(),true);
    controller.abort();
    assert.equal(req.signal.aborted,true);
    assert.equal(await authorizeReview(),false);
    return Response.json({imageBase64:Buffer.from('discarded').toString('base64')});
  }});
  assert.deepEqual(await f.fn({...f.input,signal:controller.signal}),{status:'quality_held',qualityReason:'image_quality_inconclusive',retryAutomatically:false});
  assert.ok(!f.calls.includes('storage'));
});
test('adaptadores HTTP concretos cooperam com provedores simulados',async()=>{
 const {createImageHandler}=await import('../../images-api/src/index.mjs');
 const {createPrivateImageHandler}=await import('../../private-images/src/index.mjs');
 const {createImageToolReservationStore}=await import('../src/image-tool-reservation.mjs');
 const {createSessionBindings}=await import('../src/session-binding.mjs');
 const {createImageToolResultSender}=await import('../src/image-tool-result.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,4)});
 const callId='exec_'+ 'f'.repeat(56),submissionId='88888888-8888-4888-8888-888888888888';
 const signed=bindings.issueAction({...claim,callId,prompt});
 const approve=createImageToolApproval({bindings,ownsVersion:async()=>true});
 const approved=await approve({actor,projectId,pieceId,version:1,attemptId,actionBinding:signed,explicitApproval:true});
 assert.ok(approved);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==','base64');
 let images=0, saved=false, claimed=false,resultClaimed=false,events=0;
 const fakeFetch=async (target,init={})=>{
   const url=new URL(target);
   if(url.hostname==='api.openai.com'&&url.pathname.endsWith('/events')){events++;assert.equal(JSON.parse(init.body).events[0].call_id,callId);return new Response(null,{status:202});}
   if(url.hostname==='api.openai.com' && url.pathname.includes('/agents/')) return Response.json({id:'sess_a',agent:{model:'gpt-6.1-terra'},status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:callId,arguments:{prompt}}]});
   if(url.hostname==='api.openai.com') {images++;return Response.json({data:[{b64_json:png.toString('base64')}]});}
   if(url.pathname.endsWith('/piece_versions')) return Response.json([{project_id:projectId,piece_id:pieceId,version:1,projects:{owner_id:userId}}]);
   if(url.pathname.includes('/storage/')) {saved=true;return Response.json({});}
   if(url.pathname.endsWith('/reserve_image_tool_call')) {assert.equal(JSON.parse(init.body).p_call_id,callId);return Response.json([{reservation_id:reservationId,state:'reserved',is_new:true}]);}
   if(url.pathname.endsWith('/declare_image_generation_consent')) return Response.json([{declaration_id:reservationId,is_new:true}]);
   if(url.pathname.endsWith('/claim_image_tool_execution')) {const first=!claimed;claimed=true;return Response.json([{execution_id:executionId,asset_id:assetId,state:'running',is_new:first}]);}
   if(url.pathname.endsWith('/complete_image_tool_execution')) {assert.ok(saved);return Response.json(true);}
   if(url.pathname.endsWith('/claim_image_tool_result_submission')){assert.equal(JSON.parse(init.body).p_call_id,callId);const first=!resultClaimed;resultClaimed=true;return Response.json([{submission_id:submissionId,asset_id:assetId,state:'sending',is_new:first}]);}
   if(url.pathname.endsWith('/finish_image_tool_result_submission'))return Response.json(true);
   throw Error('unexpected');
 };
 const auth=async req=>req.headers.get('authorization')===`Bearer ${actor.token}`?actor:null;
 const reservations=createImageToolReservationStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:fakeFetch});
 const execute=createImageToolExecution({bindings,ownsVersion:async()=>true,reservations,imageHandler:createImageHandler({authenticate:auth,fetch:fakeFetch}),imageStorageHandler:createPrivateImageHandler({appOrigin:'https://example.test',supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate:auth,fetch:fakeFetch}),appOrigin:'https://example.test',fetch:fakeFetch});
 const result=await execute({actor,projectId,pieceId,version:1,attemptId,actionBinding:approved,apiKey:key,explicitApproval:true});
 assert.equal(result.status,'completed');assert.equal(images,1);assert.equal(result.toolResult.call_id,callId);assert.ok(saved);assert.ok(!JSON.stringify(result).includes(key));
 const send=createImageToolResultSender({bindings,ownsVersion:async()=>true,reservations,fetch:fakeFetch});const resume={actor,projectId,pieceId,version:1,attemptId,executionId,actionBinding:approved,apiKey:key};assert.equal((await send(resume)).status,'accepted');assert.equal((await send(resume)).status,'unknown');assert.equal(events,1);assert.equal(images,1);
});


test('aprovação assinada impede troca de peça ou versão e exige acesso atual',async()=>{
 const {createSessionBindings}=await import('../src/session-binding.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,5)});
 const signed=bindings.issueAction({...claim,prompt});
 let allowed=true;
 const approve=createImageToolApproval({bindings,ownsVersion:async()=>allowed});
 const input={actor,projectId,pieceId,version:1,attemptId,actionBinding:signed,explicitApproval:true};
 assert.equal(await approve({...input,explicitApproval:false}),null);
 const proof=await approve(input); assert.ok(proof);
 assert.ok(bindings.verifyApprovedAction({token:proof,userId,projectId,attemptId,pieceId,version:1}));
 assert.equal(bindings.verifyApprovedAction({token:proof,userId,projectId,attemptId,pieceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:1}),null);
 assert.equal(bindings.verifyApprovedAction({token:proof,userId,projectId,attemptId,pieceId,version:2}),null);
 allowed=false; assert.equal(await approve(input),null);
 for(const field of ['piece','version','revoked']) {const f=fixture({accessRevoked:field==='revoked'}); if(field==='piece') f.input.pieceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; if(field==='version') f.input.version=2; assert.equal((await f.fn(f.input)).status,'rejected'); assert.ok(!f.calls.includes('image')); assert.ok(!f.calls.includes('claim'));}
});


test('falha ao concluir após salvar preserva referência de imagem sem repetir geração',async()=>{
 const f=fixture({completeFail:true});const result=await f.fn(f.input);assert.equal(result.status,'unknown');assert.equal(result.assetId,assetId);assert.equal(result.retryAutomatically,false);assert.ok(f.calls.includes('unknown'));await f.fn(f.input);assert.equal(f.calls.filter(x=>x==='image').length,1);
});

test('edição aprovada vincula pixels, textos e origem; adulteração nunca reserva nem gera',async()=>{
 const {createSessionBindings}=await import('../src/session-binding.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,6)}),refId='88888888-8888-4888-8888-888888888888';
 const proposal={prompt:'Mude a composição mantendo a oferta',operation:'edit',baseImageId:pieceId,referenceIds:[refId]};
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB','base64');
 const artworkInput={literalText:{headline:'Oferta de hoje',price:'R$ 129,90',date:'12/12'},source:{pieceId,version:1},images:[{id:pieceId,role:'base',mime:'image/png',data:bytes.toString('base64')},{id:refId,role:'reference',mime:'image/png',data:bytes.toString('base64')}]};
 const signed=bindings.issueAction({...claim,proposal});
 let sourceAllowed=true,pendingProposal=proposal;
 const calls=[];
 const ownsVersion=async({pieceId:id,version})=>id===pieceId&&(version===2||version===1&&sourceAllowed);
 const approve=createImageToolApproval({bindings,ownsVersion});
 const approvalInput={actor,projectId,pieceId,version:2,attemptId,actionBinding:signed,explicitApproval:true,artworkInput};
 assert.equal(await approve({...approvalInput,version:1}),null,'origem não pode ser sobrescrita');
 assert.equal(await approve({...approvalInput,explicitApproval:false}),null);
 sourceAllowed=false;assert.equal(await approve(approvalInput),null);sourceAllowed=true;
 const proof=await approve(approvalInput);assert.ok(proof);
 const execute=createImageToolExecution({bindings,ownsVersion,appOrigin:'https://example.test',
  fetch:async()=>{calls.push('lookup');return Response.json({id:'sess_a',status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:'call_a',arguments:pendingProposal}]});},
  reservations:{reserve:async()=>{calls.push('reserve');return{id:reservationId,state:'reserved'};},declareConsent:async()=>{},claimExecution:async()=>({id:executionId,assetId,state:'running',isNew:true}),markExecutionUnknown:async()=>{},completeExecution:async()=>{}},
  imageHandler:async req=>{calls.push('image');const body=await req.json();assert.match(body.prompt,/Oferta de hoje/);assert.match(body.prompt,/R\$ 129,90/);assert.match(body.prompt,/Edite a primeira imagem/);assert.deepEqual(body.images,artworkInput.images.map(({mime,data})=>({mime,data})));return Response.json({imageBase64:bytes.toString('base64')});},
  imageStorageHandler:async req=>{assert.equal(new URL(req.url).searchParams.get('version'),'2');return Response.json({status:'stored',assetId},{status:201});},
 });
 const input={...approvalInput,actionBinding:proof,apiKey:key};
 const changed=[
  {...artworkInput,literalText:{...artworkInput.literalText,price:'R$ 1'}},
  {...artworkInput,images:artworkInput.images.slice(0,1)},
  {...artworkInput,images:[artworkInput.images[0],{...artworkInput.images[1],data:Buffer.concat([bytes,Buffer.from([1])]).toString('base64')}]},
  {...artworkInput,source:{pieceId,version:2}},
 ];
 for(const packet of changed)assert.equal((await execute({...input,artworkInput:packet})).status,'rejected');
 assert.deepEqual(calls,[]);
 sourceAllowed=false;assert.equal((await execute(input)).status,'rejected');sourceAllowed=true;
 pendingProposal={...proposal,referenceIds:[]};assert.equal((await execute(input)).status,'rejected');assert.ok(!calls.includes('reserve'));
 pendingProposal=proposal;assert.equal((await execute(input)).status,'completed');assert.equal(calls.filter(call=>call==='image').length,1);
});
