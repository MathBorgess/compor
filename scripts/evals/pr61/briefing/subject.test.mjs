import assert from 'node:assert/strict';
import test from 'node:test';
import {createStudioState,updateBrief} from '../../../../apps/web/lib/studio-state.ts';
import {referenceDiscoverySubject,studioProjectIdea} from '../../../../apps/web/lib/studio-project-idea.ts';
test('o assunto usa a oferta sem transformar o público ou a oferta na ideia original',()=>{
  const state=updateBrief(createStudioState({userId:crypto.randomUUID(),projectId:crypto.randomUUID(),prepare:true}),{offer:'Oficina de desenho',audience:'Público privado'});
  assert.equal(referenceDiscoverySubject(state,''),'Oficina de desenho');
  assert.equal(referenceDiscoverySubject(state,'Pedido do post'),'Pedido do post');
  assert.equal(studioProjectIdea(state),'');
  assert.equal(referenceDiscoverySubject(updateBrief(state,{offer:''}),''),'');
});
