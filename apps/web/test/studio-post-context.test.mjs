import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,createPost,prepareAdjustment,settleAdjustment,updateBrief,recordSavedVersion,getCurrentDraft} from '../lib/studio-state.ts';
import {postContext,effectiveReferences,conversationContext,selectScopedReference,unselectScopedReference,updatePostContext,freezeCreationContext} from '../lib/studio-post-context.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const reference=n=>({id:id(n),name:`Imagem ${n}`,mime:'image/png',size:100,width:100,height:100});
function initial(){return createPost(createPost(createStudioState({userId:id(1),projectId:id(2)}),{pieceId:id(3)}),{pieceId:id(4)});}
test('migra schema 2 sem atribuir a ação antiga aos posts, mantendo todas as referências globais',()=>{
 const current=updateBrief(initial(),{action:'Compre o curso'}),{posts,projectReferenceIds,...legacy}=structuredClone(current);
 legacy.schemaVersion=2;legacy.references=[reference(10)];
 const next=parseStudioState(legacy);
 assert.equal(next.schemaVersion,4);assert.equal(next.brief.action,'Compre o curso');assert.deepEqual(postContext(next,id(3)),{objective:'',message:'',action:''});
 assert.deepEqual(effectiveReferences(next,id(4)),legacy.references);assert.deepEqual(parseStudioState(next),next);assert.equal(legacy.schemaVersion,2);
 assert.equal(conversationContext(next,id(3)).brief.action,'');
});
test('objetivos de live, venda e autoridade ficam independentes, com CTA opcional',()=>{
 let state=updatePostContext(initial(),id(3),{objective:'Live gratuita',message:'Inscrições abertas',action:'Inscreva-se'});
 state=updatePostContext(state,id(4),{objective:'Autoridade',message:'Minha experiência'});
 assert.equal(postContext(state,id(3)).action,'Inscreva-se');assert.equal(postContext(state,id(4)).action,'');
 assert.equal(postContext(parseStudioState(JSON.parse(JSON.stringify(state))),id(4)).objective,'Autoridade');
 assert.throws(()=>updatePostContext(state,id(8),{action:'Outra'}));assert.throws(()=>updatePostContext(state,id(3),{message:'sk-private-key'}));
});
test('seleção efetiva combina globais e locais, deduplica e desmarca sem afetar outro post',()=>{
 let state=selectScopedReference(initial(),reference(10));state=selectScopedReference(state,reference(11),id(3));
 assert.deepEqual(effectiveReferences(state,id(3)).map(item=>item.id),[id(10),id(11)]);
 assert.deepEqual(effectiveReferences(state,id(4)).map(item=>item.id),[id(10)]);
 state=selectScopedReference(state,reference(10),id(3));assert.equal(effectiveReferences(state,id(3)).length,2);
 state=unselectScopedReference(state,id(10),id(3));assert.deepEqual(effectiveReferences(state,id(3)).map(item=>item.id),[id(11)]);
 assert.equal(effectiveReferences(state,'references').length,1);assert.equal(effectiveReferences(state,id(4)).length,1);
 state=selectScopedReference(state,reference(11),id(4));state=unselectScopedReference(state,id(11),id(3));
 assert.equal(state.references.some(item=>item.id===id(11)),true);assert.equal(effectiveReferences(state,id(4)).length,2);
 state=unselectScopedReference(state,id(11),id(4));assert.equal(state.references.some(item=>item.id===id(11)),false);
});
test('compartilhar é explícito e mantém os limites e a integridade dos vínculos',()=>{
 const local=selectScopedReference(initial(),reference(10),id(3));const global=selectScopedReference(local,reference(10));
 assert.equal(effectiveReferences(local,id(4)).length,0);assert.equal(effectiveReferences(global,id(4)).length,1);assert.equal(global.references.length,1);
 assert.throws(()=>parseStudioState({...global,projectReferenceIds:[id(99)]}));
 assert.throws(()=>parseStudioState({...global,projectReferenceIds:[id(10),id(10)]}));
 assert.throws(()=>selectScopedReference(global,{...reference(10),name:'Substituição'}));
});
test('reativar referência herdada não cria uma associação local implícita',()=>{
 let state=selectScopedReference(initial(),reference(10));
 state=unselectScopedReference(state,id(10),id(3));state=selectScopedReference(state,reference(10),id(3));
 assert.deepEqual(state.posts[id(3)].referenceIds,[]);assert.equal(effectiveReferences(state,id(3)).length,1);
 state=unselectScopedReference(state,id(10),'references');assert.equal(effectiveReferences(state,id(3)).length,0);
});
test('turnos e versões congelam apenas o contexto e as referências usados',()=>{
 let state=selectScopedReference(selectScopedReference(initial(),reference(10)),reference(11),id(3));
 state=updatePostContext(state,id(4),{objective:'Autoridade'});
 state=prepareAdjustment(state,{requestId:id(20),messageId:id(21),instruction:'Conte minha trajetória sem vender',createdAt:'2026-11-15T10:00:00.000Z',eventId:id(22),conversationId:id(4)});
 const snapshot=state.adjustments[0].context;
 assert.deepEqual(snapshot.references,[reference(10)]);assert.equal(snapshot.postContext.action,'');assert.equal(snapshot.postContext.message,'Conte minha trajetória sem vender');
 state=settleAdjustment(state,{requestId:id(20),status:'completed',eventId:id(23)});
 state=recordSavedVersion(state,{pieceId:id(4),baseVersion:0,version:1,content:getCurrentDraft(state).content,eventId:id(24)});
 state=freezeCreationContext(state,id(4),1,{postContext:snapshot.postContext,references:snapshot.references});
 state=updatePostContext(state,id(4),{action:'Nova ação'});state=unselectScopedReference(state,id(10),id(4));
 assert.deepEqual(state.adjustments[0].context,snapshot);assert.deepEqual(getCurrentDraft(state).creationContext,{postContext:snapshot.postContext,references:[reference(10)]});
 assert.equal(effectiveReferences(state,id(4)).length,0);
});
