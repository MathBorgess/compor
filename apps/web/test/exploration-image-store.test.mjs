import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationImageStore} from '../lib/exploration-image-store.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={userId:id(1),token:'session-token'},config={service:'https://example.supabase.co',app:'http://localhost:3000',key:'sb_publishable_test'};
test('leitura privada usa token do ator e devolve imagem PNG limitada',async()=>{
 const png=Buffer.from('89504e470d0a1a0a01020304','hex');
 const store=createExplorationImageStore(config,async(url,init)=>{assert.match(String(url),new RegExp(`${id(1)}/${id(2)}/${id(3)}\\.png$`));assert.equal(init.headers.authorization,'Bearer session-token');return new Response(png,{headers:{'content-type':'image/png'}});});
 const response=await store.read(actor,id(2),id(3));assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('stream sem tamanho declarado é interrompido no limite antes de acumular resposta ilimitada',async()=>{
 let chunks=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 const store=createExplorationImageStore(config,async()=>new Response(stream,{headers:{'content-type':'image/png'}}));
 await assert.rejects(()=>store.read(actor,id(2),id(3)),/invalid image/);assert.ok(chunks<=10);assert.equal(cancelled,true);
});
test('reserva vincula hash e finalização comprovada usa segredo apenas na RPC correspondente',async()=>{
 const calls=[];
 const store=createExplorationImageStore(config,async(url,init)=>{calls.push({path:new URL(url).pathname,body:JSON.parse(init.body),auth:init.headers.authorization});return Response.json(calls.length===1?[{state:'running',is_new:true}]:true);});
 const digest='a'.repeat(64),proof='b'.repeat(64),secret='c'.repeat(64);
 assert.deepEqual(await store.reserve(actor,id(2),id(3),digest,proof,{id:id(4),position:2}),{state:'running',isNew:true});
 await store.finish(actor,id(2),id(3),'completed',secret);
 assert.equal(calls[0].path,'/rest/v1/rpc/reserve_exploration_image_batched_proven');
 assert.equal(calls[0].body.p_rejection_digest,proof);assert.equal('p_rejection_secret' in calls[0].body,false);
 assert.equal(calls[1].path,'/rest/v1/rpc/complete_exploration_image_proven');assert.equal(calls[1].body.p_rejection_secret,secret);
 assert.ok(calls.every(call=>call.auth==='Bearer session-token'));
});

test('encerramento local conserva o resultado incerto no contrato serial',async()=>{
 const entry={id:id(3),project_id:id(2),state:'closed_unknown',created_at:'2026-11-17T09:45:07Z',ordinal:15,batch_id:id(4),batch_position:1};
 const store=createExplorationImageStore(config,async(url,options)=>{
  assert.equal(options.headers.authorization,'Bearer session-token');
  if(url.pathname==='/rest/v1/exploration_images')return Response.json([entry]);
  assert.equal(url.pathname,'/rest/v1/rpc/reserve_exploration_image_batched_proven');
  return Response.json([{state:'closed_unknown',is_new:false}]);
 });
 assert.deepEqual(await store.list(actor,id(2)),[{...entry,state:'unknown'}]);
 assert.deepEqual(await store.reserve(actor,id(2),id(3),'a'.repeat(64),'b'.repeat(64),{id:id(4),position:1}),{state:'unknown',isNew:false});
});
