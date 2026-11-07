import test from 'node:test';
import assert from 'node:assert/strict';
import {addCreativeCriterion,addReference,createPost,createStudioState,parseStudioState,prepareAdjustment} from '../lib/studio-state.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('referência gerada mantém identificação de origem na conversa e direção, restrita ao projeto',()=>{
 const source={kind:'generated',projectId:id(2),imageId:id(3)};
 const reference={id:id(4),name:'exploracao.png',mime:'image/png',size:100,width:10,height:10,source};
 let state=createPost(createStudioState({userId:id(1),projectId:id(2)}),{pieceId:id(5)});
 assert.throws(()=>addReference(state,{...reference,source:{...source,projectId:id(9)}}));
 state=addReference(state,reference);
 state=addCreativeCriterion(state,{id:id(6),viewpoint:'creator',dimension:'visual',statement:'Composição com contraste',example:{description:'Aproxima',referenceId:reference.id},counterexample:{description:'Afasta',referenceId:null},provenance:'hypothesis',source:'',tension:''});
 state=prepareAdjustment(state,{requestId:id(7),messageId:id(8),instruction:'Compare essa imagem',createdAt:'2026-11-06T12:00:00.000Z',eventId:id(10)});
 assert.deepEqual(state.adjustments[0].context.references[0].source,source);
 assert.equal(state.direction.criteria[0].example.referenceId,reference.id);
 assert.deepEqual(parseStudioState(JSON.parse(JSON.stringify(state))),state);
});
