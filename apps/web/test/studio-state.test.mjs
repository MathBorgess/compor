import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,updateBrief,updatePersona,createPost,selectVersion,selectDraft,getCurrentDraft,editDraft,addMessage,addMark,addReference,removeReference,prepareAdjustment,settleAdjustment,approveDraft,recordSavedVersion} from '../lib/studio-state.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-11-05T12:00:00.000Z';
const content={headline:'Peça sintética',price:'R$ 20',date:'10/11',caption:'Legenda sintética',captionOrigin:'user'};
const initial=()=>createStudioState({userId:id(1),projectId:id(2)});
const selected=()=>selectVersion(initial(),{pieceId:id(3),version:2,latestVersion:5,content});
const reference={id:id(8),name:'sintetica.png',mime:'image/png',size:200,width:10,height:10};

test('state local é segregado, versionado e imutável, sem campo ou conteúdo de chave',()=>{
 const state=updateBrief(initial(),{offer:'Curso fictício'});
 assert.equal(initial().brief.offer,'');
 assert.equal(state.revision,1);assert.equal(state.projectId,id(2));
 assert.throws(()=>{state.brief.offer='Outra';},TypeError);
 assert.deepEqual(parseStudioState(JSON.parse(JSON.stringify(state))),state);
 assert.throws(()=>parseStudioState({...state,apiKey:'qualquer'}));
 assert.throws(()=>updateBrief(state,{offer:`Não guardar sk-${'a'.repeat(30)}`}));
 assert.throws(()=>updatePersona(state,{claims:[{id:id(9),text:'Hipótese',provenance:'certeza_inventada',source:''}]}));
 assert.throws(()=>parseStudioState({...state,schemaVersion:99}));
});

test('navegar preserva rascunhos separados e base anterior não vira latest silenciosamente',()=>{
 let state=editDraft(selected(),{field:'headline',value:'Alteração local'});
 state=selectVersion(state,{pieceId:id(3),version:5,latestVersion:5,content});
 assert.equal(getCurrentDraft(state).baseVersion,5);
 state=selectVersion(state,{pieceId:id(3),version:2,latestVersion:6,content});
 assert.equal(getCurrentDraft(state).content.headline,'Alteração local');
 assert.equal(getCurrentDraft(state).expectedLatestVersion,5);
 const created=createPost(state,{pieceId:id(4)});
 assert.equal(created.drafts.length,3);
 assert.equal(createPost(created,{pieceId:id(4)}),created,'mesma criação não cria outro rascunho');
});

test('retoma um rascunho local existente sem substituir seu conteúdo nem seleção em erro',()=>{
 let state=createPost(selected(),{pieceId:id(10)});
 state=editDraft(state,{field:'headline',value:'Ainda não salvo'});
 state=selectVersion(state,{pieceId:id(3),version:5,latestVersion:5,content});
 state=selectDraft(state,{pieceId:id(10),baseVersion:0});
 assert.equal(getCurrentDraft(state).content.headline,'Ainda não salvo');
 assert.equal(getCurrentDraft(state).dirty,true);
 const before=state;
 assert.throws(()=>selectDraft(state,{pieceId:id(11),baseVersion:0}),error=>error.code==='studio_draft_unavailable');
 assert.equal(state,before);assert.equal(state.selection.pieceId,id(10));
});

test('pedido congela mensagem, base, marcações e referências mesmo após mudar seleção',()=>{
 let state=addReference(selected(),reference);
 state=addMark(state,{id:id(10),kind:'area',x:.1,y:.2,width:.3,height:.4,note:'Ajustar cor'});
 state=addMark(state,{id:id(11),kind:'element',elementId:'headline',note:'Dar destaque'});
 state=prepareAdjustment(state,{requestId:id(20),messageId:id(21),instruction:'Ajuste somente a área indicada',createdAt:at,eventId:id(22)});
 const frozen=state.adjustments[0].context;
 state=createPost(state,{pieceId:id(4)});
 state=removeReference(state,id(8));
 assert.equal(frozen.pieceId,id(3));assert.equal(frozen.baseVersion,2);assert.equal(frozen.expectedLatestVersion,5);
 assert.equal(frozen.marks.length,2);assert.equal(frozen.references[0].id,id(8));
 assert.equal(state.references.length,0);assert.equal(state.adjustments[0].context.references.length,1);
 assert.throws(()=>{frozen.marks[0].x=.9;},TypeError);
 state=settleAdjustment(state,{requestId:id(20),status:'completed',result:{messageId:id(23),text:'Proposta da mesma base'},eventId:id(24),createdAt:at});
 assert.equal(state.messages[1].context.pieceId,id(3));assert.equal(getCurrentDraft(state).pieceId,id(4));
 assert.equal(state.messages[1].context.baseVersion,2);
});

test('resultado desconhecido impede novo pedido e consulta não é tratada como nova execução',()=>{
 let state=prepareAdjustment(selected(),{requestId:id(20),messageId:id(21),instruction:'Alterar o título',createdAt:at,eventId:id(22)});
 state=settleAdjustment(state,{requestId:id(20),status:'unknown',result:{assetId:id(99)},eventId:id(23)});
 assert.throws(()=>prepareAdjustment(state,{requestId:id(30),messageId:id(31),instruction:'Repetir',createdAt:at,eventId:id(32)}),error=>error.code==='studio_operation_active');
 state=settleAdjustment(state,{requestId:id(20),status:'completed',result:{messageId:id(24),text:'Concluído após consulta'},createdAt:at,eventId:id(25)});
 assert.equal(state.adjustments.length,1);assert.equal(state.messages.filter(m=>m.role==='assistant').length,1);
 assert.equal(state.adjustments[0].result.assetId,id(99),'artefato conhecido não se perde com resultado do turno incerto');
 assert.throws(()=>settleAdjustment(state,{requestId:id(20),status:'in_progress',eventId:id(26)}),error=>error.code==='studio_operation_terminal');
});

test('marcas fora da arte e vínculos de mensagem adulterados são rejeitados',()=>{
 assert.throws(()=>addMark(selected(),{id:id(9),kind:'area',x:.9,y:0,width:.2,height:.2,note:''}));
 assert.throws(()=>addMark(selected(),{id:id(9),kind:'element',elementId:'',note:''}));
 let state=prepareAdjustment(selected(),{requestId:id(20),messageId:id(21),instruction:'Alterar',createdAt:at,eventId:id(22)});
 const changed=JSON.parse(JSON.stringify(state));changed.messages[0].context.pieceId=id(4);
 assert.throws(()=>parseStudioState(changed));
 const foreign=JSON.parse(JSON.stringify(state));foreign.adjustments[0].context.projectId=id(7);
 assert.throws(()=>parseStudioState(foreign));
 assert.throws(()=>addMessage(state,{id:id(9),role:'assistant',text:'Mensagem',createdAt:'ontem'}));
});

test('nova versão a partir da antiga fica atual e herda aprovação com origem real',()=>{
 let state=approveDraft(selected(),{at,eventId:id(40)});
 state=editDraft(state,{field:'caption',value:'Ajuste da base antiga'});
 const saved={...content,caption:'Ajuste da base antiga'};
 state=recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:saved,eventId:id(41)});
 const current=getCurrentDraft(state);
 assert.equal(current.baseVersion,6);assert.equal(current.expectedLatestVersion,6);
 assert.deepEqual(current.approval,{status:'approved',kind:'inherited',sourceVersion:2,at});
 assert.equal(state.drafts.find(item=>item.baseVersion===2).content.caption,'Ajuste da base antiga');
 assert.equal(recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:saved,eventId:id(41)}),state);
 assert.throws(()=>recordSavedVersion(state,{pieceId:id(3),baseVersion:6,version:8,content:saved,eventId:id(42)}),error=>error.code==='studio_version_conflict');
});

test('resposta de salvamento preserva alterações feitas enquanto aguardava',()=>{
 let state=editDraft(selected(),{field:'headline',value:'Versão submetida'});
 const submitted={...getCurrentDraft(state).content};
 state=editDraft(state,{field:'headline',value:'Mais uma alteração local'});
 state=recordSavedVersion(state,{pieceId:id(3),baseVersion:2,version:6,content:submitted,eventId:id(41)});
 assert.equal(getCurrentDraft(state).baseVersion,2);
 assert.equal(getCurrentDraft(state).content.headline,'Mais uma alteração local');
 assert.equal(getCurrentDraft(state).dirty,true);
 assert.equal(state.drafts.find(item=>item.baseVersion===6).content.headline,'Versão submetida');
 assert.throws(()=>approveDraft(state,{at,eventId:id(42)}),error=>error.code==='studio_unsaved_draft');
 const fresh=createPost(initial(),{pieceId:id(9)});
 assert.throws(()=>approveDraft(fresh,{at,eventId:id(43)}),error=>error.code==='studio_unsaved_draft');
});
