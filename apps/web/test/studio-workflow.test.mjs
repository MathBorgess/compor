import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,createPost,prepareAdjustment,settleAdjustment,addMessage} from '../lib/studio-state.ts';
import {conversationMessages,updateWorkflow} from '../lib/studio-workflow.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial=()=>createStudioState({userId:id(1),projectId:id(2),prepare:true,projectIdea:'Uma oficina'});
test('preparação é explícita e a ideia não é uma mensagem ou autorização',()=>{
 const state=initial();assert.equal(state.schemaVersion,2);assert.equal(state.workflow.phase,'context');assert.equal(state.workflow.aiPreference,'none');assert.deepEqual(state.messages,[]);
 const next=updateWorkflow(state,{phase:'ready',aiPreference:'default'});assert.equal(next.workflow.phase,'ready');assert.deepEqual(next.messages,[]);assert.equal(next.projectIdea,'Uma oficina');
});
test('conversas de posts e referências não compartilham mensagens e mantêm suas origens',()=>{
 let state=createPost(initial(),{pieceId:id(3)});
 state=prepareAdjustment(state,{requestId:id(10),messageId:id(11),instruction:'Primeiro post',createdAt:'2026-11-15T12:00:00.000Z',eventId:id(12),conversationId:id(3)});
 state=settleAdjustment(state,{requestId:id(10),status:'completed',result:{messageId:id(13),text:'Resposta do primeiro'},createdAt:'2026-11-15T12:00:01.000Z',eventId:id(14)});
 state=createPost(state,{pieceId:id(4)});
 state=addMessage(state,{id:id(15),role:'user',text:'Segundo post',createdAt:'2026-11-15T12:00:02.000Z',conversationId:id(4)});
 assert.deepEqual(conversationMessages(state,id(3)).map(m=>m.text),['Primeiro post','Resposta do primeiro']);assert.deepEqual(conversationMessages(state,id(4)).map(m=>m.text),['Segundo post']);assert.deepEqual(conversationMessages(state,'references'),[]);
 assert.equal(state.workflow.selections[id(3)],0);assert.equal(state.workflow.selections[id(4)],0);
});
test('migração legada preserva conteúdo, não inventa post para mensagem sem contexto e é idempotente',()=>{
 const base=initial();const {workflow,...legacy}=base;legacy.schemaVersion=1;
 legacy.messages=[{id:id(20),role:'user',text:'Conversa antiga sem peça',createdAt:'2026-11-15T12:00:00.000Z',status:'completed',context:null}];
 const migrated=parseStudioState(legacy);assert.equal(migrated.workflow.phase,'ready');assert.equal(migrated.workflow.view,'posts');assert.deepEqual(migrated.messages,legacy.messages);assert.deepEqual(conversationMessages(migrated,id(3)),[]);assert.deepEqual(parseStudioState(migrated),migrated);assert.equal(legacy.schemaVersion,1);
});
test('escopo inválido e campos desconhecidos são recusados sem descartar o estado anterior',()=>{
 const state=initial();assert.throws(()=>parseStudioState({...state,workflow:{...state.workflow,apiKey:'não armazenar'}}));assert.throws(()=>parseStudioState({...state,schemaVersion:99}));assert.equal(state.revision,0);
});
