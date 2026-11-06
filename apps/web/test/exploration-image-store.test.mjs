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
