import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,recordActionReceipt,updateBrief,STUDIO_LIMITS} from '../lib/studio-state.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial=()=>createStudioState({userId:id(1),projectId:id(2)});
const receipt=(n=3,result={status:'completed',local:true})=>({requestId:id(n),fingerprint:'a'.repeat(64),result});

test('recibo e efeito local passam pelo mesmo snapshot persistível; legados recebem lista vazia',()=>{
 const legacy={...initial()};delete legacy.actionReceipts;
 assert.deepEqual(parseStudioState(legacy).actionReceipts,[]);
 const state=recordActionReceipt(updateBrief(legacy,{offer:'Oferta sintética'}),receipt());
 const restored=parseStudioState(JSON.parse(JSON.stringify(state)));
 assert.equal(restored.brief.offer,'Oferta sintética');
 assert.deepEqual(restored.actionReceipts,[receipt()]);
 assert.throws(()=>{restored.actionReceipts[0].result.status='unknown';},TypeError);
 assert.equal(recordActionReceipt(restored,{...receipt(),result:{local:true,status:'completed'}}),restored);
});

test('reuso de requestId exige mesma impressão e um resultado terminal não pode ser reescrito',()=>{
 let state=recordActionReceipt(initial(),receipt(3,{status:'unknown'}));
 state=recordActionReceipt(state,receipt(3,{status:'pending_confirmation'}));
 state=recordActionReceipt(state,receipt(3,{status:'completed',pieceId:id(4),version:2}));
 assert.equal(state.actionReceipts.length,1);
 assert.equal(state.actionReceipts[0].result.version,2);
 assert.throws(()=>recordActionReceipt(state,{...receipt(),fingerprint:'b'.repeat(64)}),error=>error.code==='studio_action_conflict');
 assert.throws(()=>recordActionReceipt(state,receipt(3,{status:'unknown'})),error=>error.code==='studio_action_conflict');
 const declined=recordActionReceipt(initial(),receipt(3,{status:'declined'}));
 assert.throws(()=>recordActionReceipt(declined,receipt()),error=>error.code==='studio_action_conflict');
});

test('recibos recusam argumentos, conteúdo inesperado, chaves e resultados de outro projeto',()=>{
 const invalid=[
  {...receipt(),fingerprint:'JSON com argumentos'},
  {...receipt(),apiKey:'secret'},
  receipt(3,{status:'completed',apiKey:'secret'}),
  receipt(3,{status:'completed',text:'Texto criativo não pertence ao recibo'}),
  receipt(3,{status:'completed',projectId:id(8)}),
  receipt(3,{status:'completed',title:`sk-${'a'.repeat(30)}`}),
  receipt(3,{status:'completed',version:0}),
  receipt(3,{status:'completed',expectedLatestVersion:-1}),
 ];
 for(const value of invalid)assert.throws(()=>recordActionReceipt(initial(),value),error=>error.code==='studio_action_receipt_invalid');
 const valid=recordActionReceipt(initial(),receipt(3,{status:'completed',projectId:id(2),revision:3,pieceId:null,baseVersion:null,expectedLatestVersion:0,unsaved:false,title:'Título local'}));
 assert.equal(valid.actionReceipts[0].result.title,'Título local');
 assert.throws(()=>parseStudioState({...valid,actionReceipts:[...valid.actionReceipts,...valid.actionReceipts]}));
});

test('limite de 200 recibos preserva os anteriores e a repetição existente continua válida',()=>{
 let state=initial();
 for(let n=0;n<STUDIO_LIMITS.actionReceipts;n++)state=recordActionReceipt(state,receipt(n+10));
 const previous=state;
 assert.throws(()=>recordActionReceipt(state,receipt(500)),error=>error.code==='studio_action_receipt_limit');
 assert.equal(state,previous);assert.equal(state.actionReceipts[0].requestId,id(10));
 assert.equal(recordActionReceipt(state,receipt(10)),state);
});
