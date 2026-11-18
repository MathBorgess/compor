import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchReservedExplorationBatch,ExplorationBatchRejected} from '../lib/exploration-batch-coordinator.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const plans=()=>[1,2,3].map(n=>({requestId:id(n),prompt:`Caminho visual ${n}`,proof:`private-proof-${n}`}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const fixture=()=>{const calls=[],pending=new Map(),stored=new Map();return {calls,pending,stored,ports:{
 generate:(item)=>{calls.push(['generate',item.requestId]);const d=deferred();pending.set(item.requestId,d);return d.promise;},
 put:async(item,bytes)=>{calls.push(['put',item.requestId]);stored.set(item.requestId,bytes);},
 finish:async(item,state)=>{calls.push(['finish',item.requestId,state]);},
 reject:async(item)=>{calls.push(['reject',item.requestId]);},
 }};};

test('inicia três filhos antes da primeira resposta e confirma cada um fora de ordem',async()=>{
 const f=fixture(),items=plans();const resultPromise=dispatchReservedExplorationBatch(items,f.ports);
 assert.deepEqual(f.calls,items.map(item=>['generate',item.requestId]));
 f.pending.get(id(3)).resolve(new Uint8Array([3]));f.pending.get(id(1)).resolve(new Uint8Array([1]));f.pending.get(id(2)).resolve(new Uint8Array([2]));
 const result=await resultPromise;
 assert.deepEqual(result,items.map(item=>({requestId:item.requestId,status:'completed'})));
 assert.equal(f.stored.size,3);assert.equal(f.calls.filter(call=>call[0]==='generate').length,3);
 for(const item of items){assert.ok(f.calls.some(call=>call[0]==='put'&&call[1]===item.requestId));assert.ok(f.calls.some(call=>call[0]==='finish'&&call[1]===item.requestId&&call[2]==='completed'));}
});

test('recusa e resultado incerto de filhos diferentes não apagam sucesso nem disparam repetição',async()=>{
 const f=fixture(),items=plans();const resultPromise=dispatchReservedExplorationBatch(items,f.ports);
 f.pending.get(id(1)).resolve(new Uint8Array([1]));f.pending.get(id(2)).reject(new ExplorationBatchRejected());f.pending.get(id(3)).reject(new Error('private provider detail'));
 const result=await resultPromise;
 assert.deepEqual(result,[{requestId:id(1),status:'completed'},{requestId:id(2),status:'rejected'},{requestId:id(3),status:'unknown'}]);
 assert.equal(f.calls.filter(call=>call[0]==='generate').length,3);assert.ok(f.calls.some(call=>call[0]==='reject'&&call[1]===id(2)));
 assert.ok(f.calls.some(call=>call[0]==='finish'&&call[1]===id(3)&&call[2]==='unknown'));
 assert.doesNotMatch(JSON.stringify(result),/private|Caminho visual/);
});

test('falha ao armazenar ou confirmar deixa aquele filho desconhecido sem afetar os demais',async()=>{
 const f=fixture(),items=plans(),put=f.ports.put,finish=f.ports.finish;
 f.ports.put=async(item,bytes)=>{if(item.requestId===id(2))throw Error('storage');return put(item,bytes);};
 f.ports.finish=async(item,state)=>{if(item.requestId===id(3)&&state==='completed')throw Error('commit response lost');return finish(item,state);};
 const promise=dispatchReservedExplorationBatch(items,f.ports);for(const item of items)f.pending.get(item.requestId).resolve(new Uint8Array([1]));
 assert.deepEqual(await promise,[{requestId:id(1),status:'completed'},{requestId:id(2),status:'unknown'},{requestId:id(3),status:'unknown'}]);
 assert.ok(f.calls.some(call=>call[0]==='finish'&&call[1]===id(2)&&call[2]==='unknown'));
 assert.ok(f.calls.some(call=>call[0]==='finish'&&call[1]===id(3)&&call[2]==='unknown'));
});

test('recusa sem recibo confirmado continua desconhecida e não interrompe os outros filhos',async()=>{
 const f=fixture(),items=plans();f.ports.reject=async()=>{throw Error('receipt lost');};
 const promise=dispatchReservedExplorationBatch(items,f.ports);
 f.pending.get(id(1)).reject(new ExplorationBatchRejected());f.pending.get(id(2)).resolve(new Uint8Array([2]));f.pending.get(id(3)).resolve(new Uint8Array([3]));
 assert.deepEqual(await promise,[{requestId:id(1),status:'unknown'},{requestId:id(2),status:'completed'},{requestId:id(3),status:'completed'}]);
 assert.ok(f.calls.some(call=>call[0]==='finish'&&call[1]===id(1)&&call[2]==='unknown'));
 assert.equal(f.calls.filter(call=>call[0]==='generate').length,3);
});

test('manifesto inválido é recusado antes de qualquer geração',async()=>{
 for(const items of [plans().slice(0,2),[plans()[0],plans()[0],plans()[2]],[{...plans()[0],prompt:''},...plans().slice(1)]]){
  const f=fixture();await assert.rejects(dispatchReservedExplorationBatch(items,f.ports));assert.deepEqual(f.calls,[]);
 }
});
