import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,createPost,prepareAdjustment,settleAdjustment,addMessage,pendingSelectionQuestion,REFERENCE_SELECTION_EVENT} from '../lib/studio-state.ts';
import {conversationMessages,updateWorkflow,postIds,startPostPreparation,completePostPreparation,updatePostPreparation,cancelPostPreparation,removePostFromList,prepareReferenceWorkspace} from '../lib/studio-workflow.ts';
import {updatePostContext} from '../lib/studio-post-context.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial=()=>createStudioState({userId:id(1),projectId:id(2),prepare:true,projectIdea:'Uma oficina'});

test('preparação não gera posts e cada nova peça retoma suas respostas sem CTA obrigatório',()=>{
 let state=updateWorkflow(initial(),{phase:'ready',view:'posts'});
 assert.deepEqual(postIds(state),[]);assert.deepEqual(state.drafts,[]);
 state=startPostPreparation(state,id(3));state=updatePostPreparation(state,{name:'Autoridade — Matemática',objective:'Autoridade',message:'Uma dica de matemática'});
 state=parseStudioState(JSON.parse(JSON.stringify(state)));
 assert.equal(state.workflow.view,'prepare-post');assert.equal(state.workflow.pendingPost.name,'Autoridade — Matemática');assert.deepEqual(state.drafts,[]);assert.deepEqual(postIds(state),[]);
 state=completePostPreparation(state);assert.equal(state.workflow.view,'compose');assert.equal(state.posts[id(3)].prepared,true);assert.equal(state.posts[id(3)].action,'');assert.deepEqual(state.messages,[]);
 assert.throws(()=>startPostPreparation(state,id(3)));assert.equal(state.posts[id(3)].message,'Uma dica de matemática');
 state=startPostPreparation(state,id(4));assert.equal(state.workflow.pendingPost.objective,'');assert.equal(state.posts[id(3)].message,'Uma dica de matemática');
});

test('análise das referências conserva uma origem técnica sem criar post na lista',()=>{
 let state=prepareReferenceWorkspace(initial(),id(3));
 assert.deepEqual(postIds(state),[]);assert.equal(state.workflow.referencePieceId,id(3));
 state=prepareAdjustment(state,{requestId:id(30),messageId:id(31),instruction:REFERENCE_SELECTION_EVENT,origin:'system',conversationId:'references',createdAt:'2026-11-15T12:00:00.000Z',eventId:id(32)});
 assert.equal(state.adjustments[0].context.pieceId,id(3));
 assert.deepEqual(postIds(state),[]);
 state=startPostPreparation(state,id(4));assert.deepEqual(postIds(state),[]);
 assert.throws(()=>parseStudioState({...state,workflow:{...state.workflow,referencePieceId:id(9)}}));
});

test('posts anteriores não precisam repetir preparação',()=>{
 const state=createPost(initial(),{pieceId:id(3)}),old=structuredClone(updatePostContext(state,id(3),{objective:'Anterior'}));delete old.posts[id(3)].prepared;delete old.workflow.referencePieceId;old.workflow.view='studio';
 const restored=parseStudioState(old);assert.equal(restored.posts[id(3)].prepared,true);assert.equal(restored.workflow.referencePieceId,null);assert.equal(restored.workflow.view,'studio');
});
test('preparação é explícita e a ideia não é uma mensagem ou autorização',()=>{
 const state=initial();assert.equal(state.schemaVersion,3);assert.equal(state.workflow.phase,'context');assert.equal(state.workflow.aiPreference,'default');assert.deepEqual(state.messages,[]);
 const next=updateWorkflow(state,{phase:'ready'});assert.equal(next.workflow.phase,'ready');assert.equal(next.workflow.aiPreference,'default');assert.deepEqual(next.messages,[]);assert.equal(next.projectIdea,'Uma oficina');
 const skipped=updateWorkflow(state,{aiPreference:'none'});assert.equal(parseStudioState(skipped).workflow.aiPreference,'none','escolha explícita sem IA persiste');
});
test('conversas de posts e referências não compartilham mensagens e mantêm suas origens',()=>{
 let state=createPost(initial(),{pieceId:id(3)});
 state=prepareAdjustment(state,{requestId:id(10),messageId:id(11),instruction:'Primeiro post',createdAt:'2026-11-15T12:00:00.000Z',eventId:id(12),conversationId:id(3)});
 state=settleAdjustment(state,{requestId:id(10),status:'completed',result:{messageId:id(13),text:'Resposta do primeiro'},createdAt:'2026-11-15T12:00:01.000Z',eventId:id(14)});
 state=createPost(state,{pieceId:id(4)});
 state=addMessage(state,{id:id(15),role:'user',text:'Segundo post',createdAt:'2026-11-15T12:00:02.000Z',conversationId:id(4)});
 assert.deepEqual(conversationMessages(state,id(3)).map(m=>m.text),['Primeiro post','Resposta do primeiro']);assert.deepEqual(conversationMessages(state,id(4)).map(m=>m.text),['Segundo post']);assert.deepEqual(conversationMessages(state,'references'),[]);assert.deepEqual(conversationMessages(state,undefined),[]);
 assert.equal(state.workflow.selections[id(3)],0);assert.equal(state.workflow.selections[id(4)],0);
});
test('migração legada preserva conteúdo, não inventa post para mensagem sem contexto e é idempotente',()=>{
 const base=initial();const legacy={...base};delete legacy.workflow;legacy.schemaVersion=1;
 legacy.messages=[{id:id(20),role:'user',text:'Conversa antiga sem peça',createdAt:'2026-11-15T12:00:00.000Z',status:'completed',context:null}];
 const migrated=parseStudioState(legacy);assert.equal(migrated.workflow.phase,'ready');assert.equal(migrated.workflow.view,'posts');assert.equal(migrated.workflow.aiPreference,'none','migração não infere autorização');assert.deepEqual(migrated.messages,legacy.messages);assert.deepEqual(conversationMessages(migrated,id(3)),[]);assert.deepEqual(conversationMessages(migrated,undefined).map(m=>m.text),['Conversa antiga sem peça']);assert.deepEqual(parseStudioState(migrated),migrated);assert.equal(legacy.schemaVersion,1);
});
test('escopo inválido e campos desconhecidos são recusados sem descartar o estado anterior',()=>{
 const state=initial();assert.throws(()=>parseStudioState({...state,workflow:{...state.workflow,apiKey:'não armazenar'}}));assert.throws(()=>parseStudioState({...state,schemaVersion:99}));assert.equal(state.revision,0);
});


test('pergunta legada das referências espera resposta na mesma conversa',()=>{
 let state=createPost(initial(),{pieceId:id(3)});
 state=prepareAdjustment(state,{requestId:id(30),messageId:id(31),instruction:REFERENCE_SELECTION_EVENT,origin:'system',createdAt:'2026-11-15T12:00:00.000Z',eventId:id(32)});
 state=settleAdjustment(state,{requestId:id(30),status:'completed',result:{messageId:id(33),text:'Posso seguir?'},createdAt:'2026-11-15T12:00:01.000Z',eventId:id(34)});
 const legacy=JSON.parse(JSON.stringify(state));for(const message of legacy.messages)delete message.conversationId;for(const turn of legacy.adjustments)delete turn.context.conversationId;
 state=parseStudioState(legacy);assert.equal(pendingSelectionQuestion(state,'references'),id(33));assert.deepEqual(conversationMessages(state,'references').map(m=>m.id),[id(31),id(33)]);assert.deepEqual(conversationMessages(state,undefined),[]);
 state=addMessage(state,{id:id(35),role:'user',text:'Pedido de outro post',createdAt:'2026-11-15T12:00:02.000Z',conversationId:id(3)});assert.equal(pendingSelectionQuestion(state,'references'),id(33));
 state=addMessage(state,{id:id(36),role:'user',text:'Pode seguir',createdAt:'2026-11-15T12:00:03.000Z',conversationId:'references'});assert.equal(pendingSelectionQuestion(state,'references'),null);
});

test('cancelar não cria peça e confirmar exige nome válido',()=>{
 let state=startPostPreparation(initial(),id(8));assert.throws(()=>completePostPreparation(state));
 state=updatePostPreparation(state,{name:'   '});assert.throws(()=>completePostPreparation(state));
 state=cancelPostPreparation(state);assert.equal(state.workflow.pendingPost,null);assert.deepEqual(state.drafts,[]);
 state=startPostPreparation(state,id(8));state=updatePostPreparation(state,{name:'  Live gratuita  '});state=completePostPreparation(state);
 assert.equal(state.posts[id(8)].name,'Live gratuita');assert.equal(state.workflow.pendingPost,null);
 const removed=removePostFromList(state,id(8));assert.deepEqual(postIds(removed),[]);assert.deepEqual(removed.drafts,state.drafts);assert.equal(removed.selection,null);
});
test('exclusão preserva turnos e bloqueia resultados pendentes',()=>{
 let state=createPost(initial(),{pieceId:id(3)});state=prepareAdjustment(state,{requestId:id(30),messageId:id(31),instruction:'Uma peça',conversationId:id(3),createdAt:'2026-11-15T12:00:00.000Z',eventId:id(32)});
 assert.throws(()=>removePostFromList(state,id(3)));
 state=settleAdjustment(state,{requestId:id(30),status:'completed',result:{messageId:id(33),text:'Confirmado'},createdAt:'2026-11-15T12:00:01.000Z',eventId:id(34)});
 const removed=removePostFromList(state,id(3));assert.deepEqual(removed.messages,state.messages);assert.deepEqual(removed.adjustments,state.adjustments);
});
