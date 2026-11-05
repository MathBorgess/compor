import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionBindings} from '../src/session-binding.mjs';
import {createImageToolReservationStore} from '../src/image-tool-reservation.mjs';
import {createImageToolResultSender} from '../src/image-tool-result.mjs';
const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',executionId='55555555-5555-4555-8555-555555555555',submissionId='66666666-6666-4666-8666-666666666666',assetId='77777777-7777-4777-8777-777777777777';
const actor={userId,token:'fake-private-token'},apiKey='sk-abcdefghijklmnopqrstuvwxyz123456',prompt='imagem';
function setup({timeout=false,bodyMode=null,usage,sessionModel='gpt-6-astra',callId='call_a',pendingCallId=callId}={}) {
 const bindings=createSessionBindings({secret:Buffer.alloc(32,8)});
 const original=bindings.issueAction({userId,projectId,attemptId,sessionId:'sess_a',turnId:'turn_a',callId,prompt});
 const actionBinding=bindings.issueApprovedAction({actionBinding:original,userId,projectId,attemptId,pieceId,version:1});
 const trace=[];let claimed=false,state='sending';
 const fetch=async (target,options={})=>{
  const url=new URL(target);trace.push({path:url.pathname,body:options.body,auth:options.headers?.Authorization});
  if(url.pathname.endsWith('/claim_image_tool_result_submission')){const first=!claimed;claimed=true;return Response.json([{submission_id:submissionId,asset_id:assetId,state,is_new:first}]);}
  if(url.pathname.endsWith('/finish_image_tool_result_submission')){state=JSON.parse(options.body).p_state;return Response.json(true);}
  if(url.pathname.endsWith('/events')){
    if(timeout) return new Promise((_,reject)=>{if(options.signal.aborted)reject(Error(apiKey));else options.signal.addEventListener('abort',()=>reject(Error(apiKey)),{once:true});});
    if(bodyMode) return new Response(new ReadableStream({start(){},cancel(){trace.push({path:'/cancel'});if(bodyMode==='reject')return Promise.reject(Error(apiKey));return new Promise(()=>{});}}),{status:202});
    return Response.json({}, {status:202});
  }
  return Response.json({id:'sess_a',...(sessionModel===null?{}:{agent:{model:sessionModel}}),status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:pendingCallId,arguments:{prompt}}]});
 };
 const reservations=createImageToolReservationStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch});
 const send=createImageToolResultSender({bindings,ownsVersion:async()=>true,reservations,usage,fetch,sendTimeoutMs:timeout?20:15000});
 return {send,input:{actor,projectId,pieceId,version:1,attemptId,executionId,actionBinding,apiKey},trace};
}
test('continuação reserva medição antes de enviar e 202 não marca o turno concluído',async()=>{
 const measurements=[];const usage={start:async c=>{measurements.push({action:'start',part:c.part,partId:c.partId,model:c.model});return true;},finish:async c=>measurements.push({action:'finish',state:c.state})};
 const f=setup({usage});assert.equal((await f.send({...f.input,model:'gpt-6.1-terra'})).status,'accepted');assert.deepEqual(measurements,[{action:'start',part:'agent_resume',partId:submissionId,model:'gpt-6-astra'}]);
 assert.doesNotMatch(JSON.stringify(measurements),/imagem|sk-|fake-private-token/);
});
test('retomada Terra usa o modelo observado na sessão, sem reclassificar o histórico Astra',async()=>{
 const models=[];const f=setup({sessionModel:'gpt-6.1-terra',usage:{start:async context=>{models.push(context.model);return true;},finish:async()=>{}}});
 assert.equal((await f.send({...f.input,model:'gpt-6-astra'})).status,'accepted');assert.deepEqual(models,['gpt-6.1-terra']);
});
test('handoff exec envia o ID exato uma vez e nunca envia quando required_action diverge',async()=>{
 const callId='exec_'+ 'd'.repeat(56),f=setup({callId});assert.equal((await f.send(f.input)).status,'accepted');await f.send(f.input);const events=f.trace.filter(call=>call.path.endsWith('/events'));assert.equal(events.length,1);assert.equal(JSON.parse(events[0].body).events[0].call_id,callId);assert.equal(JSON.parse(f.trace.find(call=>call.path.endsWith('/claim_image_tool_result_submission')).body).p_call_id,callId);
 const changed=setup({callId,pendingCallId:'exec_different'});assert.equal((await changed.send(changed.input)).status,'rejected');assert.equal(changed.trace.filter(call=>call.path.endsWith('/events')||call.path.endsWith('/claim_image_tool_result_submission')).length,0);
});
test('modelo ausente ou desconhecido fica incerto antes do claim, medição e envio',async()=>{
 for(const sessionModel of [null,'','gpt-unknown']){
  let measured=0;const f=setup({sessionModel,usage:{start:async()=>{measured++;return true;},finish:async()=>{}}});
  assert.deepEqual(await f.send({...f.input,model:'gpt-6.1-terra'}),{status:'unknown',retryAutomatically:false});assert.equal(measured,0);
  assert.equal(f.trace.filter(item=>item.path.endsWith('/claim_image_tool_result_submission')||item.path.endsWith('/events')).length,0);
 }
});
test('falha ao reservar medição impede envio que poderia retomar cobrança',async()=>{
 const f=setup({usage:{start:async()=>false,finish:async()=>{}}});assert.equal((await f.send(f.input)).status,'unknown');assert.equal(f.trace.filter(c=>c.path.endsWith('/events')).length,0);
});
test('timeout da continuação registra apenas custo desconhecido e não repete envio',async()=>{
 const records=[];const f=setup({timeout:true,usage:{start:async()=>true,finish:async c=>records.push({state:c.state,usage:c.usage})}});
 assert.equal((await f.send(f.input)).status,'unknown');assert.deepEqual(records,[{state:'unknown',usage:null}]);
 await f.send(f.input);assert.equal(f.trace.filter(c=>c.path.endsWith('/events')).length,1);
});
test('envia resultado apenas uma vez e registra recebimento simulado',async()=>{
 const f=setup();assert.deepEqual(await f.send(f.input),{status:'accepted'});assert.deepEqual(await f.send(f.input),{status:'unknown',retryAutomatically:false});
 const events=f.trace.filter(c=>c.path.endsWith('/events'));assert.equal(events.length,1);const body=JSON.parse(events[0].body);assert.equal(body.events[0].type,'agent.session.input.tool_result');assert.equal(JSON.parse(body.events[0].output).assetId,assetId);assert.ok(!events[0].body.includes(apiKey));assert.equal(f.trace.filter(c=>c.path.endsWith('/finish_image_tool_result_submission')).length,1);
});
test('timeout do envio é desconhecido e não dispara reenvio',async()=>{
 const f=setup({timeout:true});const result=await f.send(f.input);assert.deepEqual(result,{status:'unknown',retryAutomatically:false});assert.doesNotMatch(JSON.stringify(result),/sk-/);await f.send(f.input);assert.equal(f.trace.filter(c=>c.path.endsWith('/events')).length,1);assert.equal(JSON.parse(f.trace.find(c=>c.path.endsWith('/finish_image_tool_result_submission')).body).p_state,'unknown');
});
test('outra conta, peça ou versão é recusada antes do envio',async()=>{
 for(const field of ['user','piece','version']){const f=setup();if(field==='user')f.input.actor={...actor,userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};if(field==='piece')f.input.pieceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';if(field==='version')f.input.version=2;assert.equal((await f.send(f.input)).status,'rejected');assert.equal(f.trace.length,0);}
});


test('202 aceita o evento sem esperar stream aberto ou cancelamento bloqueado',async()=>{
 const f=setup({bodyMode:'blocked'});const result=await Promise.race([f.send(f.input),new Promise((_,reject)=>setTimeout(()=>reject(Error('resposta bloqueada')),500))]);
 assert.deepEqual(result,{status:'accepted'});assert.equal(f.trace.filter(c=>c.path==='/cancel').length,1);
});
test('rejeição do cancelamento não vaza nem impede aceitação',async()=>{
 const f=setup({bodyMode:'reject'});const result=await f.send(f.input);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(result,{status:'accepted'});assert.equal(f.trace.filter(c=>c.path==='/cancel').length,1);assert.doesNotMatch(JSON.stringify(result),/sk-/);
});
