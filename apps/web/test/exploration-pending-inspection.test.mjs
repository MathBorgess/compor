import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSerialPending} from '../lib/exploration-pending.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('consulta sequencial usa apenas GET e preserva recibo, inclusive entre projetos',async()=>{
 const marker=JSON.stringify({projectId:id(2),requestId:id(3),sequence:0,conversationId:'references'}),data=new Map([[`compor-exploration-pending:${id(1)}`,marker]]),calls=[];
 const storage={getItem:key=>data.get(key)??null},fetchApi=async(url,options)=>{calls.push({url,options});return Response.json({images:[{id:id(3),project_id:id(2),state:'completed'}]});};
 const scope={storage,userId:id(1),projectId:id(2),conversationId:'references',fetchApi};
 assert.match(await inspectSerialPending(scope),/confirmada/);assert.equal(data.values().next().value,marker);assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);
 assert.match(await inspectSerialPending({...scope,projectId:id(4)}),/projeto de origem/);assert.match(await inspectSerialPending({...scope,conversationId:id(5)}),/conversa de origem/);assert.equal(calls.length,1);
});
