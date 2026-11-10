import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioState,parseStudioState,addMessage,updateBrief,updateOfferFacts,REFERENCE_SELECTION_EVENT} from '../lib/studio-state.ts';
import {studioProjectIdea} from '../lib/studio-project-idea.ts';
const userId='00000000-0000-4000-8000-000000000001',projectId='00000000-0000-4000-8000-000000000002';
test('ideia pertence ao projeto e continua disponível antes da primeira mensagem',()=>{
 const first=createStudioState({userId,projectId,projectIdea:'Oficina de cerâmica'});
 const second=createStudioState({userId,projectId:'00000000-0000-4000-8000-000000000003',projectIdea:'Aula de gravura'});
 assert.equal(studioProjectIdea(parseStudioState(JSON.parse(JSON.stringify(first)))),'Oficina de cerâmica');
 assert.equal(studioProjectIdea(parseStudioState(JSON.parse(JSON.stringify(second)))),'Aula de gravura');
 assert.equal(first.brief.offer,'','a ideia não se torna um fato de oferta');
});
test('estado antigo não inventa ideia e ignora o marcador da seleção ao recuperar mensagem humana',()=>{
 const {projectIdea,...legacy}=createStudioState({userId,projectId});
 let state=parseStudioState(legacy);assert.equal(state.projectIdea,'');assert.equal(studioProjectIdea(state),'');
 state=addMessage(state,{id:crypto.randomUUID(),role:'user',text:REFERENCE_SELECTION_EVENT,createdAt:new Date().toISOString()});
 assert.equal(studioProjectIdea(state),'');
 state=addMessage(state,{id:crypto.randomUUID(),role:'user',text:'Quero apresentar meu ateliê',createdAt:new Date().toISOString()});
 assert.equal(studioProjectIdea(state),'Quero apresentar meu ateliê');
});
test('ideia local valida tipo, limite e credencial antes de persistir',()=>{
 for(const projectIdea of [123,'x'.repeat(4001),`sk-${'x'.repeat(30)}`])assert.throws(()=>createStudioState({userId,projectId,projectIdea}));
});
test('ideia, título provisório e fatos persistem juntos com público canônico',()=>{
 let state=createStudioState({userId,projectId,projectIdea:'Oficina de cerâmica',projectTitleProvisional:true});
 state=updateBrief(state,{audience:'Pessoas iniciantes'});
 state=updateOfferFacts(state,[{id:crypto.randomUUID(),label:'Material',value:'Incluído',status:'confirmed'}]);
 const restored=parseStudioState(JSON.parse(JSON.stringify(state)));
 assert.equal(restored.projectTitleProvisional,true);assert.equal(studioProjectIdea(restored),'Oficina de cerâmica');
 assert.equal(restored.brief.audience,restored.persona.audience);assert.deepEqual(restored.offerFacts,state.offerFacts);
});
