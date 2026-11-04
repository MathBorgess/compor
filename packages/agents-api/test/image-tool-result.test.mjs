import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionBindings} from '../src/session-binding.mjs';
import {createImageToolReservationStore} from '../src/image-tool-reservation.mjs';
import {createImageToolResultSender} from '../src/image-tool-result.mjs';
const userId='11111111-1111-4111-8111-111111111111',projectId='22222222-2222-4222-8222-222222222222',pieceId='33333333-3333-4333-8333-333333333333',attemptId='44444444-4444-4444-8444-444444444444',executionId='55555555-5555-4555-8555-555555555555',submissionId='66666666-6666-4666-8666-666666666666',assetId='77777777-7777-4777-8777-777777777777';
const actor={userId,token:'fake-private-token'},apiKey='sk-abcdefghijklmnopqrstuvwxyz123456',prompt='imagem';
function setup({timeout=false}={}) {
 const bindings=createSessionBindings({secret:Buffer.alloc(32,8)});
 const original=bindings.issueAction({userId,projectId,attemptId,sessionId:'sess_a',turnId:'turn_a',callId:'call_a',prompt});
 const actionBinding=bindings.issueApprovedAction({actionBinding:original,userId,projectId,attemptId,pieceId,version:1});
 const trace=[];let claimed=false,state='sending';
 const fetch=async (target,options={})=>{
  const url=new URL(target);trace.push({path:url.pathname,body:options.body,auth:options.headers?.Authorization});
  if(url.pathname.endsWith('/claim_image_tool_result_submission')){const first=!claimed;claimed=true;return Response.json([{submission_id:submissionId,asset_id:assetId,state,is_new:first}]);}
  if(url.pathname.endsWith('/finish_image_tool_result_submission')){state=JSON.parse(options.body).p_state;return Response.json(true);}
  if(url.pathname.endsWith('/events')){if(timeout)throw Error(apiKey);return Response.json({});}
  return Response.json({id:'sess_a',status:'requires_action',required_actions:[{type:'function_call',name:'generate_image',turn_id:'turn_a',call_id:'call_a',arguments:{prompt}}]});
 };
 const reservations=createImageToolReservationStore({url:'https://project.supabase.co',anonKey:'sb_publishable_test',fetch});
 const send=createImageToolResultSender({bindings,ownsVersion:async()=>true,reservations,fetch});
 return {send,input:{actor,projectId,pieceId,version:1,attemptId,executionId,actionBinding,apiKey},trace};
}
test('envia resultado apenas uma vez e registra recebimento simulado',async()=>{
 const f=setup();assert.deepEqual(await f.send(f.input),{status:'sent'});assert.deepEqual(await f.send(f.input),{status:'unknown',retryAutomatically:false});
 const events=f.trace.filter(c=>c.path.endsWith('/events'));assert.equal(events.length,1);const body=JSON.parse(events[0].body);assert.equal(body.events[0].type,'agent.session.input.tool_result');assert.equal(JSON.parse(body.events[0].output).assetId,assetId);assert.ok(!events[0].body.includes(apiKey));assert.equal(f.trace.filter(c=>c.path.endsWith('/finish_image_tool_result_submission')).length,1);
});
test('timeout do envio é desconhecido e não dispara reenvio',async()=>{
 const f=setup({timeout:true});const result=await f.send(f.input);assert.deepEqual(result,{status:'unknown',retryAutomatically:false});assert.doesNotMatch(JSON.stringify(result),/sk-/);await f.send(f.input);assert.equal(f.trace.filter(c=>c.path.endsWith('/events')).length,1);assert.equal(JSON.parse(f.trace.find(c=>c.path.endsWith('/finish_image_tool_result_submission')).body).p_state,'unknown');
});
test('outra conta, peça ou versão é recusada antes do envio',async()=>{
 for(const field of ['user','piece','version']){const f=setup();if(field==='user')f.input.actor={...actor,userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};if(field==='piece')f.input.pieceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';if(field==='version')f.input.version=2;assert.equal((await f.send(f.input)).status,'rejected');assert.equal(f.trace.length,0);}
});
