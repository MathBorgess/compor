import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCH_DELAY_MS,readBatchProgress,recordBatchCompletion,nextBatch,freezeBatchWait,resumeBatchWait,reviewBatchProgress,resumeAfterFeedback} from '../lib/exploration-batch.ts';

const projectId='00000000-0000-4000-8000-000000000001',batchId='00000000-0000-4000-8000-000000000002',nextId='00000000-0000-4000-8000-000000000003';
const makeStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const pending=(sequence,position)=>({projectId,requestId:crypto.randomUUID(),sequence,batchId,position});
test('três conclusões persistem intervalo e não contam duas vezes após recarga',()=>{
 const storage=makeStorage();storage.setItem('legacy','25');
 let progress=readBatchProgress(storage,'batch','legacy',()=>batchId);
 assert.equal(progress.sequence,25);
 for(let index=0;index<3;index++){
   const operation=pending(progress.sequence,index+1);
   progress=recordBatchCompletion(progress,operation,1000);
   storage.setItem('batch',JSON.stringify(progress));
   const restored=readBatchProgress(storage,'batch','legacy',()=>nextId);
   assert.deepEqual(recordBatchCompletion(restored,operation,1000),restored,'reconciliação não conta duas vezes');
 }
 assert.equal(progress.completed,3);assert.equal(progress.nextAt,1000+BATCH_DELAY_MS);
 assert.throws(()=>nextBatch(progress,progress.nextAt-1,()=>nextId));
 const next=nextBatch(progress,progress.nextAt,()=>nextId);
 assert.deepEqual(next,{sequence:28,batchId:nextId,completed:0,nextAt:null,remainingMs:null,reviewBatches:progress.reviewBatches,reviewedBatchId:null,awaitingFeedback:false});
 const frozen=freezeBatchWait(progress,5000);
 assert.equal(frozen.remainingMs,11000);assert.equal(frozen.nextAt,null);
 const resumed=resumeBatchWait(frozen,50000);
 assert.equal(resumed.nextAt,61000);assert.equal(resumed.remainingMs,null);
});

test('dois lotes sem interação pausam até retomada explícita e apenas IDs daqueles lotes contam',()=>{
 const storage=makeStorage();let progress=readBatchProgress(storage,'batch','legacy',()=>batchId);const ids=[];
 for(let i=0;i<3;i++){const p=pending(progress.sequence,i+1);ids.push(p.requestId);progress=recordBatchCompletion(progress,p,1000);}
 progress=reviewBatchProgress(progress,new Set([crypto.randomUUID()]));assert.equal(progress.awaitingFeedback,false);
 progress=nextBatch(progress,progress.nextAt,()=>nextId);
 for(let i=0;i<3;i++){const p={...pending(progress.sequence,i+1),batchId:nextId};ids.push(p.requestId);progress=recordBatchCompletion(progress,p,20000);}
 progress=reviewBatchProgress(progress,new Set([crypto.randomUUID()]));assert.equal(progress.awaitingFeedback,true);
 storage.setItem('batch',JSON.stringify(progress));progress=readBatchProgress(storage,'batch','legacy',()=>crypto.randomUUID());
 assert.equal(reviewBatchProgress(progress,new Set([ids[0]])).awaitingFeedback,true,'seleção após pausa não retoma automaticamente');
 progress=resumeAfterFeedback(progress);assert.equal(progress.awaitingFeedback,false);assert.deepEqual(progress.reviewBatches,[]);
});

test('interação em imagem de um lote reinicia a contagem inclusive em lote parcial',()=>{
 const storage=makeStorage();let progress=readBatchProgress(storage,'batch','legacy',()=>batchId);const first=pending(0,1);
 progress=recordBatchCompletion(progress,first,1000);
 progress=reviewBatchProgress(progress,new Set([first.requestId]));assert.deepEqual(progress.reviewBatches,[]);assert.equal(progress.reviewedBatchId,batchId);
 for(let i=1;i<3;i++)progress=recordBatchCompletion(progress,pending(progress.sequence,i+1),1000);
 progress=nextBatch(progress,progress.nextAt,()=>nextId);
 for(let i=0;i<3;i++)progress=recordBatchCompletion(progress,{...pending(progress.sequence,i+1),batchId:nextId},20000);
 assert.equal(reviewBatchProgress(progress,new Set()).awaitingFeedback,false);
});

test('comentário no intervalo não exclui o lote seguinte ainda não iniciado',()=>{
 const storage=makeStorage();let progress=readBatchProgress(storage,'batch','legacy',()=>batchId);const ids=[];
 for(let i=0;i<3;i++){const operation=pending(progress.sequence,i+1);ids.push(operation.requestId);progress=recordBatchCompletion(progress,operation,1000);}
 progress=nextBatch(progress,progress.nextAt,()=>nextId);
 progress=reviewBatchProgress(progress,new Set([ids[0]]));
 assert.equal(progress.reviewedBatchId,null);
 for(let i=0;i<3;i++)progress=recordBatchCompletion(progress,{...pending(progress.sequence,i+1),batchId:nextId},20000);
 assert.equal(progress.reviewBatches.length,1);assert.equal(progress.reviewBatches[0].imageIds.length,3);
});
test('marcador antigo preserva sequência; lote ou posição divergentes não avançam',()=>{
 const storage=makeStorage(),progress=readBatchProgress(storage,'batch','legacy',()=>batchId);
 assert.equal(recordBatchCompletion(progress,{projectId,requestId:crypto.randomUUID(),sequence:0},0).sequence,1);
 assert.throws(()=>recordBatchCompletion(progress,{...pending(0,1),batchId:nextId},0));
 assert.throws(()=>recordBatchCompletion(progress,pending(0,2),0));
});
