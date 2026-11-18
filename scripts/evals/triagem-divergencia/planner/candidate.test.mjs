import assert from 'node:assert/strict';
import test from 'node:test';
import {assessDivergence, buildDivergenceReview, parseCandidateOutput, plannerInstructions} from './candidate.mjs';

const context = {
  idea:'Uma mostra de encadernação', offer:'Mostra de encadernação', audience:'Leitores', goal:'Visitar',
  direction:'Preserve o papel cru, a tinta azul e a borda na capa.', offerFacts:[], accepted:[], rejected:[], feedback:[],
};
const items = [
  {position:1, creativePrompt:'Na tinta azul sobre papel cru, um caderno imenso domina as miniaturas na margem. Preserve a borda na capa.',
    composition:'Foco no caderno grande', contrast:'Escala do grande contra os pequenos', differenceFromOthers:'Abrir pelo volume'},
  {position:2, creativePrompt:'Na tinta azul sobre papel cru, uma coluna de letras densas dá lugar a uma página vazia. Preserve a borda na capa.',
    composition:'Percurso na coluna à esquerda', contrast:'Densidade em confronto com o vazio', differenceFromOthers:'Abrir pela escrita'},
  {position:3, creativePrompt:'Na tinta azul sobre papel cru, faixas diagonais cruzam a borda na capa e conduzem ao caderno embaixo.',
    composition:'Percurso diagonal até a peça', contrast:'Direção das faixas contra a horizontal da capa', differenceFromOthers:'Abrir pelo movimento'},
];
const clone = value => structuredClone(value);
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
const file = {mime:'image/png', byteLength:90, sha256:'a'.repeat(64)};
function entry(n, inputOrigin) {
  return {id:uuid(n), ordinal:n, inputOrigin, role:'reference', source:inputOrigin === 'local-upload' ? null :
    {projectId:uuid(11),imageId:uuid(12)}, original:file, transport:{...file,width:2,height:2}, transformation:'none'};
}
const visual = {version:2, policy:'optimized-v1', externalConsent:false, entries:[entry(1,'local-upload'), entry(2,'generated')]};
const plan = {version:2, referenceIds:[uuid(1)], items};
function candidateOutput() {
  return {plan:clone(plan), referenceReadings:[
    {referenceId:uuid(1), decision:'include', characteristic:'borda na capa', intent:'manter moldura', intentBasis:'declared',
      sourceQuote:'borda na capa', location:'capa do caderno', reason:'moldura do briefing'},
    {referenceId:uuid(2), decision:'omit', characteristic:'faixa laranja', intent:'estudo de paleta', intentBasis:'inferred',
      sourceQuote:null, location:null, reason:'conflito com a tinta azul declarada'},
  ]};
}

// Test receipts exercise the admission policy. They are never reported as independent judge results.
function receipt(p) {
  const {subject} = buildDivergenceReview(context,p);
  return {subject, slots:p.items.map(item => ({position:item.position, direction:'preserved',
    evidence:'tinta azul', reason:'a paleta e o material continuam no prompt'})),
  pairs:[[1,2],[1,3],[2,3]].map(([left,right])=>({left,right,contrast:'distinct',structure:'distinct',
    leftEvidence:p.items[left-1].creativePrompt, rightEvidence:p.items[right-1].creativePrompt,
    choice:'diferenças observáveis de foco, mecanismo e percurso'}))};
}

test('mantém o contrato v2 de produção e audita a leitura de cada arquivo da seleção', () => {
  assert.match(plannerInstructions(),/referências incluídas/);
  assert.ok(plannerInstructions('Reveja a legibilidade').endsWith('Reveja a legibilidade'));
  const raw = candidateOutput(), parsed = parseCandidateOutput(raw,context,visual);
  assert.deepEqual(parsed.plan.referenceIds,[uuid(1)]);
  assert.ok(parsed.plan.items[0].prompt.includes('Fatos declarados'));
  assert.equal('referenceReadings' in parsed.plan,false);
  assert.deepEqual(parsed.referenceReadings,raw.referenceReadings);
});
test('recusa trocar IDs, omitir leitura, omitir upload ou inventar fala do criador', () => {
  const corruptions = [
    raw => raw.referenceReadings.reverse(),
    raw => raw.referenceReadings.pop(),
    raw => {raw.plan.referenceIds=[]; raw.referenceReadings[0].decision='omit'; raw.referenceReadings[0].location=null;},
    raw => {raw.referenceReadings[0].sourceQuote='referência linda';},
    raw => {raw.referenceReadings[1].decision='include';},
    raw => {raw.referenceReadings[1].sourceQuote='tinta azul';},
    raw => {raw.plan.referenceIds.push(uuid(3));},
  ];
  for (const corrupt of corruptions) {
    const raw = candidateOutput();
    corrupt(raw);
    assert.equal(parseCandidateOutput(raw,context,visual),null);
  }
});
test('mantém a direção comum de papel cru e azul ao admitir três contrastes e estruturas distintos', () => {
  const judgement=receipt(plan);
  assert.equal(assessDivergence(context,plan,judgement).decision,'admit');
  const reversed={...plan,items:[...plan.items].reverse()};
  assert.equal(assessDivergence(context,reversed,judgement).decision,'admit');
});
test('bloqueia mecanismo de escala equivalente sob palavras novas; mudança de layout sozinha não libera', () => {
  const p=clone(plan);
  Object.assign(p.items[1],{creativePrompt:'Na tinta azul e papel cru, abre com peças minúsculas em arco e fecha num único exemplar monumental.',
    composition:'Arco de peças conduz ao gigante',contrast:'Proporção do monumental diante das miniaturas'});
  const judgement=receipt(p);
  Object.assign(judgement.pairs[0],{contrast:'equivalent',structure:'distinct',choice:'As duas rotas opõem um exemplar grande a outros pequenos.'});
  const result=assessDivergence(context,p,judgement);
  assert.equal(result.decision,'hold');
  assert.equal(result.reason,'insufficient_divergence');
  assert.deepEqual([result.details.left,result.details.right],[1,2]);
});
test('distingue campo estrutural repetido, equivalência incerta e perda da direção fixa', () => {
  const equal=clone(plan); equal.items[2].contrast='  '+equal.items[1].contrast.toUpperCase()+' ';
  assert.equal(assessDivergence(context,equal,null).reason,'literal_duplicate');
  const uncertain=receipt(plan); uncertain.pairs[1].structure='uncertain';
  assert.equal(assessDivergence(context,plan,uncertain).reason,'insufficient_divergence');
  const drift=receipt(plan); drift.slots[1].direction='drift';
  assert.equal(assessDivergence(context,plan,drift).reason,'direction');
});
test('recusa recibo anterior, pares ausentes e citações ausentes do prompt efetivo', () => {
  const original=receipt(plan);
  const changed=clone(plan); changed.items[0].creativePrompt+=' Outra hierarquia.';
  assert.equal(assessDivergence(context,changed,original).reason,'unverified_review');
  assert.equal(assessDivergence(context,{...plan,referenceIds:[]},original).reason,'unverified_review');
  const duplicated=clone(original); duplicated.pairs[1]=duplicated.pairs[2];
  assert.equal(assessDivergence(context,plan,duplicated).reason,'unverified_pair');
  const fakeQuote=clone(original); fakeQuote.pairs[0].rightEvidence='Agitar a textura com areia.';
  assert.equal(assessDivergence(context,plan,fakeQuote).reason,'unverified_pair');
  const fakeSlot=clone(original); fakeSlot.slots[0].evidence='contexto indisponível';
  assert.equal(assessDivergence(context,plan,fakeSlot).reason,'unverified_direction');
});
test('prepara os dados cegos pela composição real, sem expor declarações da candidata ou expectativa', () => {
  const labelled={...plan,expected:'reject', items:plan.items.map(item=>({...item,differenceFromOthers:'oculto'}))};
  const a=buildDivergenceReview(context,labelled);
  assert.equal(a.input.subject,a.subject);
  assert.ok(!JSON.stringify(a.input).includes('oculto'));
  assert.ok(!JSON.stringify(a.input).includes('expected'));
  const reordered=Object.fromEntries(Object.entries(context).reverse());
  assert.equal(buildDivergenceReview(reordered,plan).subject,a.subject);
  assert.throws(()=>buildDivergenceReview(context,{items:[items[0],items[1],items[1]]}),/invalid_divergence_subject/);
});

test('exige uma leitura vinculada por ID em cada tamanho de seleção aceito pelo estúdio',()=>{
  // Structural coverage complements the visual study, whose evaluated selections contain 1–6 files.
  for(let count=0;count<=21;count++){
    const entries=Array.from({length:count},(_,i)=>({...visual.entries[0],id:uuid(i+1),ordinal:i+1}));
    const input={...visual,entries};
    const raw=candidateOutput();
    raw.plan.referenceIds=entries.map(ref=>ref.id);
    raw.referenceReadings=entries.map(ref=>({...raw.referenceReadings[0],referenceId:ref.id}));
    const accepted=parseCandidateOutput(raw,context,input);
    if(count>20){assert.equal(accepted,null);continue;}
    assert.equal(accepted?.referenceReadings.length,count);
    if(count){
      assert.equal(parseCandidateOutput({...raw,referenceReadings:raw.referenceReadings.slice(1)},context,input),null);
    }
  }
});
