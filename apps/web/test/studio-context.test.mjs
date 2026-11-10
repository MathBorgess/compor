import test from 'node:test';
import assert from 'node:assert/strict';
import {audienceResolution,offerFactsFromInterview,offerContext} from '../lib/studio-context.ts';
import {createStudioState,parseStudioState,updateBrief,updatePersona,updateOfferFacts} from '../lib/studio-state.ts';
import {recordFromStudio} from '../lib/brief-interview.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const initial=()=>createStudioState({userId:id(1),projectId:id(2)});
function oldState(brief,persona){const state=structuredClone(initial());state.brief.audience=brief;state.persona.audience=persona;return state;}

test('público antigo vazio cede à descrição que existe, sem truncar o conteúdo',()=>{
  for(const [brief,persona,value] of [['','Quem trabalha à noite','Quem trabalha à noite'],['Quem estuda cedo','','Quem estuda cedo'],['','', ''],['A'.repeat(3000),'','A'.repeat(3000)]]){
    const migrated=parseStudioState(oldState(brief,persona));
    assert.equal(migrated.brief.audience,value);assert.equal(migrated.persona.audience,value);
    assert.deepEqual(audienceResolution(migrated),{status:'resolved',value});
    assert.equal(migrated.revision,0,'normalização não inventa uma edição da pessoa');
  }
});

test('descrições antigas iguais se fundem e persistem um público único',()=>{
  const state=parseStudioState(oldState(' Pessoas iniciantes ','Pessoas iniciantes'));
  assert.deepEqual(audienceResolution(state),{status:'resolved',value:'Pessoas iniciantes'});
  assert.equal(state.brief.audience,state.persona.audience);
  assert.deepEqual(parseStudioState(JSON.parse(JSON.stringify(state))),state);
});

test('descrições antigas diferentes são preservadas até a escolha explícita',()=>{
  const legacy=oldState('Público descrito no briefing','Público descrito na persona'),state=parseStudioState(legacy);
  assert.deepEqual(audienceResolution(state),{status:'conflict',brief:legacy.brief.audience,persona:legacy.persona.audience});
  assert.equal(state.brief.audience,legacy.brief.audience);assert.equal(state.persona.audience,legacy.persona.audience);
  assert.equal(recordFromStudio(state).persona,undefined,'entrevista também não escolhe uma origem por suposição');
  const chosen=updateBrief(state,{audience:state.persona.audience});
  assert.equal(chosen.brief.audience,legacy.persona.audience);assert.equal(chosen.persona.audience,legacy.persona.audience);
  assert.equal(audienceResolution(parseStudioState(JSON.parse(JSON.stringify(chosen)))).status,'resolved');
  assert.equal(state.brief.audience,legacy.brief.audience,'estado anterior continua imutável');
});

test('edição do público por qualquer adaptador mantém as duas representações sincronizadas',()=>{
  const brief=updateBrief(initial(),{audience:'Criadores locais'});
  assert.equal(brief.persona.audience,'Criadores locais');
  const persona=updatePersona(brief,{audience:'Pessoas que buscam lazer'});
  assert.equal(persona.brief.audience,'Pessoas que buscam lazer');
  assert.equal(updatePersona(persona,{need:'Uma atividade manual'}).brief.audience,'Pessoas que buscam lazer');
  assert.equal(updateBrief(persona,{audience:''}).persona.audience,'');
});

test('registro de entrevista preserva origem dos fatos, sugestões e omissões sem usar público como fato',()=>{
  let sequence=3;
  const facts=offerFactsFromInterview({fatos:{text:'Material incluído\nSem custo extra',origin:'informado'},preco:{text:'R$ 180',origin:'sugerido'},data:{text:'',origin:'informado',skipped:true}},()=>id(sequence++));
  assert.deepEqual(facts.map(({label,value,status})=>({label,value,status})),[
    {label:'Fato informado',value:'Material incluído\nSem custo extra',status:'confirmed'},
    {label:'Preço',value:'R$ 180',status:'pending'},
    {label:'Data',value:'',status:'omitted'},
  ]);
  const state=updateOfferFacts(updateBrief(initial(),{audience:'Pessoas do bairro'}),facts);
  assert.deepEqual(parseStudioState(JSON.parse(JSON.stringify(state))).offerFacts,facts);
  assert.equal(recordFromStudio(state).fatos,undefined);
  assert.equal(recordFromStudio(state).persona.text,'Pessoas do bairro');
});

test('fatos locais rejeitam origem inventada, IDs duplicados, credenciais e campos extras',()=>{
  const fact={id:id(3),label:'Preço',value:'R$ 180',status:'confirmed'};
  for(const facts of [[{...fact,status:'approved'}],[fact,fact],[{...fact,value:'sk-synthetic-private-key'}],[{...fact,source:'inferred'}]])
    assert.throws(()=>updateOfferFacts(initial(),facts));
  assert.deepEqual(updateOfferFacts(initial(),[]).offerFacts,[],'lista vazia registra a importação sem reaparecer após remoção');
});

test('contexto da oferta preserva título provisório, fatos e conflito de público na composição cumulativa',()=>{
  let state=createStudioState({userId:id(1),projectId:id(2),projectTitleProvisional:true});
  state=updateOfferFacts(state,[{id:id(3),label:'Preço',value:'R$ 180',status:'confirmed'}]);
  const conflicting=structuredClone(state);conflicting.brief.audience='Criadores';conflicting.persona.audience='Estudantes';
  const restored=parseStudioState(JSON.parse(JSON.stringify(conflicting)));
  assert.equal(restored.projectTitleProvisional,true);
  const before=offerContext(restored);
  assert.equal(before.offerFacts[0].status,'confirmed');assert.equal(before.audienceResolution.status,'conflict');
  const changed=updateOfferFacts(restored,[{...restored.offerFacts[0],value:'R$ 200'}]);
  assert.notEqual(JSON.stringify(offerContext(changed)),JSON.stringify(before),'editar um fato invalida o contexto de uma leitura pendente');
});
