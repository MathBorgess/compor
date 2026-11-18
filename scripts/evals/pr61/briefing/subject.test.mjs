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

test('grupos 3, 4 e 5 conservam as duas reservas nos dois marcos e rejeitam contagens ambíguas',async()=>{
  const {selectCases}=await import('./group-selection.mjs');
  const {scenarios:briefing}=await import('./group-cases.mjs');
  const {scenarios:references}=await import('../referencias/group-cases.mjs');
  for (const scenarios of [briefing,references]){
    assert.deepEqual(selectCases(scenarios),scenarios);
    for (const count of [3,4,5]){
      const chosen=selectCases(scenarios,['--count',String(count)]);
      assert.equal(chosen.length,count);
      assert.deepEqual(chosen.slice(-2),scenarios.slice(-2));
      assert.deepEqual(chosen.slice(0,-2),scenarios.slice(0,count-2));
    }
    assert.throws(()=>selectCases(scenarios,['--count','2']));
    assert.throws(()=>selectCases(scenarios,['--count','05']));
  }
});
