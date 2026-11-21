import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationBatchStore} from '../lib/exploration-batch-store.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'synthetic-session'},config={service:'https://example.supabase.co',app:'http://localhost:3000',key:'sb_publishable_test'};
const reserve={projectId:id(2),batchId:id(3),pieceId:null,intentId:id(10),intentSecret:'9'.repeat(64),planDigest:'a'.repeat(64),imageIds:[id(4),id(5),id(6)],promptDigests:['b','c','d'].map(x=>x.repeat(64)),rejectionDigests:['e','f','0'].map(x=>x.repeat(64))};
test('reserva usa JWT da pessoa, parâmetros exatos e valida a resposta',async()=>{
 const calls=[],store=createExplorationBatchStore(config,async(url,init)=>{calls.push({path:new URL(url).pathname,headers:init.headers,body:JSON.parse(init.body)});return Response.json([{state:'running',is_new:true}]);});
 assert.deepEqual(await store.reserveBatch(actor,reserve),{state:'running',isNew:true});
 assert.equal(calls[0].path,'/rest/v1/rpc/reserve_exploration_batch_proven');assert.equal(calls[0].headers.authorization,'Bearer synthetic-session');
 assert.deepEqual(calls[0].body,{p_project_id:id(2),p_batch_id:id(3),p_piece_id:null,p_plan_digest:'a'.repeat(64),p_image_ids:reserve.imageIds,p_prompt_digests:reserve.promptDigests,p_rejection_digests:reserve.rejectionDigests,p_intent_id:reserve.intentId,p_intent_secret:reserve.intentSecret});
});
test('resposta inválida ou falha do banco não autoriza reserva',async()=>{
 for(const response of [Response.json([{state:'running',is_new:'yes'}]),new Response('unavailable',{status:503})]){
  const store=createExplorationBatchStore(config,async()=>response);await assert.rejects(()=>store.reserveBatch(actor,reserve));
 }
});
test('a transição de resultado incerto envia a prova do filho pela RPC autenticada',async()=>{
 const secret='a'.repeat(64);
 const store=createExplorationBatchStore(config,async(url,init)=>{
  assert.equal(new URL(url).pathname,'/rest/v1/rpc/mark_exploration_image_unknown_proven');
  assert.equal(init.headers.authorization,'Bearer synthetic-session');
  assert.deepEqual(JSON.parse(init.body),{p_project_id:id(2),p_id:id(5),p_rejection_secret:secret});
  return Response.json(true);
 });
 await store.finish(actor,id(2),id(5),'unknown',secret);
});
test('reposição de recusada usa nova capacidade e escopo exatos',async()=>{
 let body;const store=createExplorationBatchStore(config,async(url,init)=>{assert.equal(new URL(url).pathname,'/rest/v1/rpc/replace_rejected_exploration_batch_slot_proven');body=JSON.parse(init.body);return Response.json([{state:'running',is_new:true}]);});
 const value={projectId:id(2),batchId:id(3),position:2,previousId:id(5),requestId:id(7),intentId:id(10),intentSecret:'9'.repeat(64),promptDigest:'b'.repeat(64),rejectionDigest:'d'.repeat(64)};
 assert.deepEqual(await store.replaceRejected(actor,value),{state:'running',isNew:true});
 assert.deepEqual(body,{p_project_id:id(2),p_batch_id:id(3),p_position:2,p_previous_id:id(5),p_id:id(7),p_prompt_digest:'b'.repeat(64),p_rejection_digest:'d'.repeat(64),p_intent_id:value.intentId,p_intent_secret:value.intentSecret});
});
test('consulta autenticada projeta somente estado e revisões do lote correto',async()=>{
 const date='2026-11-17T12:00:00Z';
 const row={batch_id:id(3),project_id:id(2),piece_id:null,plan_digest:'a'.repeat(64),state:'running',created_at:date,updated_at:date,completed_at:null,next_at:null,closed_at:null,images:[4,5,6].map((n,i)=>({id:id(n),project_id:id(2),prompt_digest:'b'.repeat(64),state:'running',ordinal:i+1,revision:1,batch_position:i+1,replaces_image_id:null,created_at:date,updated_at:date}))};
 let called;const store=createExplorationBatchStore(config,async(url,init)=>{called={path:new URL(url).pathname,authorization:init.headers.authorization,body:JSON.parse(init.body)};return Response.json(row);});
 const result=await store.getBatch(actor,id(2),id(3));
 assert.deepEqual(called,{path:'/rest/v1/rpc/get_exploration_batch',authorization:'Bearer synthetic-session',body:{p_project_id:id(2),p_batch_id:id(3)}});
 assert.deepEqual(result,{batchId:id(3),projectId:id(2),pieceId:null,state:'running',completedAt:null,nextAt:null,closedAt:null,images:[4,5,6].map((n,i)=>({requestId:id(n),status:'running',ordinal:i+1,revision:1,position:i+1,replacesImageId:null}))});
 row.images[0].project_id=id(9);await assert.rejects(()=>store.getBatch(actor,id(2),id(3)));
});
