import test from 'node:test';
import assert from 'node:assert/strict';
import {observeParallelBatch} from '../lib/parallel-exploration-observer.ts';

test('primeira confirmação é apresentada enquanto comando pago ainda aguarda os demais',async()=>{
 let releaseExecute,releaseSleep,notifyFirst,active=true,executeDone=false;
 const execute=new Promise(resolve=>{releaseExecute=()=>{executeDone=true;resolve();};});
 const firstSeen=new Promise(resolve=>{notifyFirst=resolve;});let reads=0;
 const pendingSleep=new Promise(resolve=>{releaseSleep=resolve;});const observations=[];
 const observing=observeParallelBatch({inspect:async()=>{reads++;return{snapshot:{state:'running',images:[{status:'completed'},{status:'running'},{status:'unknown'}]},journal:{}};},isActive:()=>active,onObservation:value=>{observations.push(value);notifyFirst();},onUnavailable:()=>{throw Error('unexpected');},sleep:()=>pendingSleep,intervalMs:1000});
 await firstSeen;assert.equal(executeDone,false);assert.equal(reads,1);assert.equal(observations.length,1);
 active=false;releaseSleep();await observing;assert.equal(executeDone,false,'parar leitura não cancela nem repete efeito');
 releaseExecute();await execute;
});
test('falha de leitura é informada e só a leitura pode ser repetida',async()=>{
 let reads=0,failures=0,seen=0;
 await observeParallelBatch({inspect:async()=>{reads++;if(reads===1)throw Error('offline');return{snapshot:{state:'partial',images:[{status:'completed'},{status:'rejected'},{status:'completed'}]},journal:{}};},isActive:()=>true,onObservation:()=>{seen++;},onUnavailable:()=>{failures++;},sleep:async()=>{},intervalMs:1000});
 assert.equal(reads,2);assert.equal(failures,1);assert.equal(seen,1);
});
test('resultado desconhecido interrompe observação automática sem repetir efeito',async()=>{
 let reads=0,seen=0;
 await observeParallelBatch({inspect:async()=>{reads++;return{snapshot:{state:'unknown',images:[{status:'completed'},{status:'unknown'},{status:'running'}]},journal:{}};},isActive:()=>true,onObservation:()=>{seen++;},onUnavailable:()=>{throw Error('unexpected');},sleep:async()=>{throw Error('não deveria agendar');},intervalMs:1000});
 assert.equal(reads,1);assert.equal(seen,1);
});
test('falha persistida termina a observação do lote parcial sem nova consulta',async()=>{
 let reads=0,sleeps=0;
 const images=[{status:'completed'},{status:'failed'},{status:'completed'}];
 await observeParallelBatch({
  inspect:async()=>{reads++;return{snapshot:{state:'partial',images},journal:{}};},
  isActive:()=>reads<2,
  onObservation:({snapshot})=>assert.deepEqual(snapshot.images,images),
  onUnavailable:()=>assert.fail('a consulta deveria funcionar'),
  sleep:async()=>{sleeps++;},
  intervalMs:1000,
 });
 assert.equal(reads,1);
 assert.equal(sleeps,0);
});
