import test from 'node:test';
import assert from 'node:assert/strict';
import {observeParallelChild,replaceRejectedParallelChild,parallelWaitElapsed,pauseParallelWait,resumeParallelWait,restoreParallelWait,reconcileParallelGates} from '../lib/parallel-exploration-progress.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial=()=>({children:[1,2,3].map(position=>({requestId:id(position),position,status:'unconfirmed',revision:0,confirmedAt:null})),wait:{mode:'none'}});
const receipt=(progress,position,time,visible=true)=>observeParallelChild(progress,{requestId:id(position),position,status:'completed',revision:1},time,visible);
const gates={visible:true,sessionActive:true,originalCredential:true,generationAllowed:true,questionResolved:true,feedbackAllowed:true,noOtherPending:true};

test('recibos em qualquer ordem contam uma vez e espera começa somente após terceiro',()=>{
 for(const order of [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]){
  let state=initial();state=receipt(state,order[0],10);state=receipt(state,order[1],20);
  assert.deepEqual(state.wait,{mode:'none'});state=receipt(state,order[2],30);
  assert.deepEqual(state.wait,{mode:'running',nextAt:15030});
  assert.deepEqual(receipt(state,order[2],800),state);
  assert.equal(parallelWaitElapsed(state,15029,gates),false);
  assert.equal(parallelWaitElapsed(state,15030,gates),true);
  for(const gate of Object.keys(gates))assert.equal(parallelWaitElapsed(state,16000,{...gates,[gate]:false}),false,gate);
 }
});
test('pausa, recarga e conclusão fora da tela preservam espera e nunca liberam efeito',()=>{
 let state=initial();state=receipt(state,3,10);state=receipt(state,1,20);state=receipt(state,2,30,false);
 assert.deepEqual(state.wait,{mode:'paused',remainingMs:15000});
 assert.deepEqual(resumeParallelWait(state,100,{...gates,originalCredential:false}),state);
 state=resumeParallelWait(state,100,gates);state=pauseParallelWait(state,5100);assert.deepEqual(state.wait,{mode:'paused',remainingMs:10000});
 state=resumeParallelWait(state,90000,gates);assert.equal(parallelWaitElapsed(state,99999,gates),false);
 assert.deepEqual(reconcileParallelGates(state,91000,{...gates,originalCredential:false}).wait,{mode:'paused',remainingMs:9000});
 assert.throws(()=>parallelWaitElapsed(state,100000,{visible:true}),'gates incompletos não liberam continuação');
 assert.deepEqual(restoreParallelWait(state).wait,{mode:'paused',remainingMs:15000});
});
test('incerteza, recusa, mensagens atrasadas e conflitos não inventam recibos',()=>{
 let state=initial();state=receipt(state,1,10);
 state=observeParallelChild(state,{requestId:id(2),position:2,status:'unknown',revision:2},20,true);
 assert.deepEqual(observeParallelChild(state,{requestId:id(2),position:2,status:'running',revision:1},30,true),state);
 assert.deepEqual(observeParallelChild(state,{requestId:id(2),position:2,status:'running',revision:3},30,true),state);
 state=observeParallelChild(state,{requestId:id(3),position:3,status:'rejected',revision:1},30,true);
 assert.deepEqual(state.wait,{mode:'none'});assert.equal(parallelWaitElapsed(state,999999,gates),false);
 assert.throws(()=>observeParallelChild(state,{requestId:id(3),position:3,status:'completed',revision:2},40,true));
 assert.throws(()=>observeParallelChild(state,{requestId:id(2),position:1,status:'completed',revision:3},40,true));
 assert.throws(()=>observeParallelChild(state,{requestId:id(2),position:2,status:'completed',revision:2},40,true));
});
test('somente um recibo de reposição vinculado a recusa substitui o filho',()=>{
 let state=initial();state=observeParallelChild(state,{requestId:id(2),position:2,status:'rejected',revision:2},1,false);
 const replaced=replaceRejectedParallelChild(state,{position:2,previousId:id(2),requestId:id(9),status:'running',revision:1},10,false);
 assert.equal(replaced.children[1].requestId,id(9));assert.equal(replaced.children[1].status,'running');assert.deepEqual(replaced.wait,{mode:'none'});
 for(const bad of [{position:1,previousId:id(1),requestId:id(9),status:'running',revision:1},{position:2,previousId:id(2),requestId:id(1),status:'running',revision:1},{position:2,previousId:id(2),requestId:id(9),status:'running',revision:0}])assert.throws(()=>replaceRejectedParallelChild(state,bad,10,false));
});
test('retenção preserva o parecer sem contar como confirmação e admite uma reposição vinculada',()=>{
 const held={requestId:id(2),position:2,status:'quality_held',qualityReason:'image_quality_inconclusive',revision:2};
 const before=receipt(receipt(initial(),1,10),3,20);
 const progress=observeParallelChild(before,held,30,true);
 assert.equal(progress.children[1].qualityReason,held.qualityReason);
 assert.deepEqual(progress.wait,{mode:'none'});
 assert.equal(parallelWaitElapsed(progress,20000,gates),false);
 assert.throws(()=>observeParallelChild(progress,{...held,qualityReason:'image_quality_rejected'},40,true));
 assert.throws(()=>observeParallelChild(progress,{requestId:id(2),position:2,status:'completed',revision:3},40,true));
 const replacement=replaceRejectedParallelChild(progress,{position:2,previousId:id(2),requestId:id(9),status:'completed',revision:2},50,true);
 assert.equal(replacement.children[1].requestId,id(9));
 assert.deepEqual(replacement.wait,{mode:'running',nextAt:15050});
});
