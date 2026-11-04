import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createImageToolExecution, createImageToolApproval } from '../src/image-tool-execution.mjs';

const userId = '11111111-1111-4111-8111-111111111111', projectId = '22222222-2222-4222-8222-222222222222', pieceId = '33333333-3333-4333-8333-333333333333', attemptId = '44444444-4444-4444-8444-444444444444', reservationId = '55555555-5555-4555-8555-555555555555', executionId = '66666666-6666-4666-8666-666666666666', assetId = '77777777-7777-4777-8777-777777777777';
const key = 'sk-abcdefghijklmnopqrstuvwxyz123456', actor = { userId, token: 'private-user-token' }, prompt = 'imagem de teste';
const claim = { userId, projectId, attemptId, sessionId:'sess_a', turnId:'turn_a', callId:'call_a', promptDigest:createHash('sha256').update(prompt).digest('hex') };
const approvedClaim = {...claim,pieceId,version:1};
function fixture(options = {}) {
  const calls = [], state = { claimed: false };
  const fn = createImageToolExecution({
    bindings: { verifyApprovedAction: ({userId: u, pieceId: p, version: v}) => u === userId && p === pieceId && v === 1 ? approvedClaim : null },
    ownsVersion: async () => !options.accessRevoked,
    fetch: async () => { calls.push('lookup'); return Response.json({ id:'sess_a', status:'requires_action', required_actions:[{ type:'function_call', name:'generate_image', turn_id:'turn_a', call_id:'call_a', arguments:{prompt:options.prompt ?? prompt} }] }); },
    reservations: {
      reserve: async () => { calls.push('reserve'); return {id:reservationId,state:'reserved'}; },
      declareConsent: async () => { calls.push('consent'); },
      claimExecution: async () => { calls.push('claim'); if (state.claimed) return {id:executionId,assetId,state:'unknown',isNew:false}; state.claimed=true; return {id:executionId,assetId,state:'running',isNew:true}; },
      markExecutionUnknown: async () => {calls.push('unknown');},
      completeExecution: async () => {calls.push('complete'); if(options.completeFail) throw Error(key);},
    },
    imageHandler: async req => { calls.push('image'); assert.equal((await req.json()).apiKey,key); if(options.imageFail) throw Error(key); return Response.json({imageBase64:Buffer.from('image').toString('base64'),usage:options.imageUsage??null}); },
    imageStorageHandler: async req => {calls.push('storage'); assert.equal(new URL(req.url).searchParams.get('assetId'),assetId); if(options.storageFail) throw Error(key); return Response.json({status:'stored',assetId},{status:201});},
    usage: options.usage,
    appOrigin:'https://example.test',
  });
  const input = {actor,projectId,pieceId,version:1,attemptId,actionBinding:'signed',apiKey:key,explicitApproval:true};
  return {fn,input,calls};
}
test('atendimento único vincula sessão, declaração e asset e devolve tool_result', async()=>{
 const {fn,input,calls}=fixture(); const result=await fn(input); assert.equal(result.status,'completed'); assert.equal(result.toolResult.success,true); assert.equal(JSON.parse(result.toolResult.output).assetId,assetId); assert.deepEqual(calls,['lookup','reserve','consent','claim','image','storage','complete']); assert.ok(!JSON.stringify(result).includes(key));
 const second=await fn(input); assert.equal(second.status,'unknown'); assert.equal(calls.filter(x=>x==='image').length,1);
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
test('falhas após claim preservam resultado desconhecido sem repetir imagem',async()=>{
 for(const option of ['imageFail','storageFail','completeFail']) {const f=fixture({[option]:true}); const result=await f.fn(f.input); assert.equal(result.status,'unknown'); assert.ok(f.calls.includes('unknown')); assert.ok(!JSON.stringify(result).includes(key)); await f.fn(f.input); assert.equal(f.calls.filter(x=>x==='image').length,1);}
});

test('adaptadores HTTP concretos cooperam com provedores simulados',async()=>{
 const {createImageHandler}=await import('../../images-api/src/index.mjs');
 const {createPrivateImageHandler}=await import('../../private-images/src/index.mjs');
 const {createImageToolReservationStore}=await import('../src/image-tool-reservation.mjs');
 const {createSessionBindings}=await import('../src/session-binding.mjs');
 const bindings=createSessionBindings({secret:Buffer.alloc(32,4)});
 const signed=bindings.issueAction({...claim,prompt});
 const approve=createImageToolApproval({bindings,ownsVersion:async()=>true});
 const approved=await approve({actor,projectId,pieceId,version:1,attemptId,actionBinding:signed,explicitApproval:true});
 assert.ok(approved);
 const png=Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(13,8); png.write('IHDR',12); png.writeUInt32BE(1,16); png.writeUInt32BE(1,20);
 let images=0, saved=false, claimed=false;
 const fakeFetch=async (target,init={})=>{
   const url=new URL(target);
   if(url.hostname==='api.openai.com' && url.pathname.includes('/agents/')) return Response.json({id:'sess_a',status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:'call_a',arguments:{prompt}}]});
   if(url.hostname==='api.openai.com') {images++;return Response.json({data:[{b64_json:png.toString('base64')}]});}
   if(url.pathname.endsWith('/piece_versions')) return Response.json([{project_id:projectId,piece_id:pieceId,version:1,projects:{owner_id:userId}}]);
   if(url.pathname.includes('/storage/')) {saved=true;return Response.json({});}
   if(url.pathname.endsWith('/reserve_image_tool_call')) return Response.json([{reservation_id:reservationId,state:'reserved',is_new:true}]);
   if(url.pathname.endsWith('/declare_image_generation_consent')) return Response.json([{declaration_id:reservationId,is_new:true}]);
   if(url.pathname.endsWith('/claim_image_tool_execution')) {const first=!claimed;claimed=true;return Response.json([{execution_id:executionId,asset_id:assetId,state:'running',is_new:first}]);}
   if(url.pathname.endsWith('/complete_image_tool_execution')) {assert.ok(saved);return Response.json(true);}
   throw Error('unexpected');
 };
 const auth=async req=>req.headers.get('authorization')===`Bearer ${actor.token}`?actor:null;
 const execute=createImageToolExecution({bindings,ownsVersion:async()=>true,reservations:createImageToolReservationStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch:fakeFetch}),imageHandler:createImageHandler({authenticate:auth,fetch:fakeFetch}),imageStorageHandler:createPrivateImageHandler({appOrigin:'https://example.test',supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test',authenticate:auth,fetch:fakeFetch}),appOrigin:'https://example.test',fetch:fakeFetch});
 const result=await execute({actor,projectId,pieceId,version:1,attemptId,actionBinding:approved,apiKey:key,explicitApproval:true});
 assert.equal(result.status,'completed');assert.equal(images,1);assert.ok(saved);assert.ok(!JSON.stringify(result).includes(key));
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
