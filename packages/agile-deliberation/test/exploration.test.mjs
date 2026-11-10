import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationPrompt } from '../src/exploration.js';

const input = {offer:'Oficina de cerâmica',audience:'Pessoas iniciantes',goal:'Conhecer a oficina',direction:'Tom acolhedor',accepted:['Materiais táteis'],rejected:['Estética luxuosa'],sequence:0};
test('contexto e escolhas explícitas orientam a referência, sem inventar preferências',()=>{
 const {prompt}=createExplorationPrompt(input);
 for(const text of [input.offer,input.audience,input.goal,input.direction,...input.accepted,...input.rejected])assert.ok(prompt.includes(text));
 assert.ok(prompt.includes('"publico":"Pessoas iniciantes"'));
 assert.equal(prompt.includes('publico_da_persona'),false);assert.equal(prompt.includes('publico_ou_observacoes_do_briefing'),false);
 assert.match(prompt,/Orientações aceitas pela pessoa/);assert.match(prompt,/Orientações rejeitadas/);assert.match(prompt,/campos vazios como desconhecidos/);
});
test('a sequência varia composição e pedido, sem repetir a mesma composição em chamadas consecutivas',()=>{
 const ideas=Array.from({length:100},(_,sequence)=>createExplorationPrompt({...input,sequence}));
 assert.equal(new Set(ideas.map(idea=>idea.prompt)).size,ideas.length);
 for(let i=1;i<ideas.length;i++)assert.notEqual(ideas[i].composition,ideas[i-1].composition);
});
test('não gera proposta sem contexto ou com credencial no contexto',()=>{
 assert.throws(()=>createExplorationPrompt({...input,offer:'',direction:''}),/exploration_context_required/);
 assert.throws(()=>createExplorationPrompt({...input,offer:`sk-${'x'.repeat(30)}`}));
 assert.throws(()=>createExplorationPrompt({...input,sequence:-1}));
});
test('a ideia basta para a primeira proposta e não se transforma em fato de oferta',()=>{
 const idea='Quero apresentar minha oficina de cerâmica';
 const {prompt}=createExplorationPrompt({...input,idea,offer:'',direction:'',audience:'',goal:''});
 assert.ok(prompt.includes(`"ideia":${JSON.stringify(idea)}`));
 assert.ok(prompt.includes('"oferta":""'));
 assert.ok(prompt.includes('"publico":""'));
 assert.ok(prompt.length<=8000);
 assert.throws(()=>createExplorationPrompt({...input,idea:`${'x'.repeat(9000)} sk-secret`}));
});
test('o planejador recebe um público e exige escolha quando entradas legadas divergem',()=>{
 const brief='Pessoas que trabalham à noite',persona='Pessoas que estudam pela manhã';
 assert.throws(()=>createExplorationPrompt({...input,briefAudience:brief,audience:persona}),/exploration_audience_conflict/);
 for(const value of [{audience:'',briefAudience:brief},{audience:brief,briefAudience:''},{audience:brief,briefAudience:brief}]){
  const prompt=createExplorationPrompt({...input,...value}).prompt;
  assert.ok(prompt.includes(`"publico":${JSON.stringify(brief)}`));
  assert.equal(prompt.includes('publico_da_persona'),false);assert.equal(prompt.includes('publico_ou_observacoes_do_briefing'),false);
  assert.match(prompt,/não invente a origem dos dados/);assert.match(prompt,/Hipóteses não são evidência de público real/);
 }
 assert.throws(()=>createExplorationPrompt({...input,briefAudience:`Texto com sk-${'abc'.repeat(8)} embutida`}));
 assert.throws(()=>createExplorationPrompt({...input,briefAudience:`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`}));
});
test('fatos preservam seu texto literal e distinguem confirmação, pendência e omissão',()=>{
 const facts=[{label:'Preço',value:' R$ 180\nMaterial incluído ',status:'confirmed'},{label:'Data',value:'18/11',status:'pending'},{label:'Local',value:'Endereço reservado',status:'omitted'}];
 const {prompt}=createExplorationPrompt({...input,facts});
 assert.ok(prompt.includes(JSON.stringify(facts)));assert.match(prompt,/Preserve literalmente os confirmados/);assert.match(prompt,/Não apresente pendentes como fatos nem inclua os omitidos/);
 assert.throws(()=>createExplorationPrompt({...input,facts:[{...facts[0],status:'inferred'}]}));
 assert.throws(()=>createExplorationPrompt({...input,facts:[{...facts[0],value:'sk-synthetic-key'}]}));
});
test('aceita briefing multilinha e longo sem perder conteúdo que cabe no prompt',()=>{
 const offer=`Uma oficina para iniciantes.\n${'Detalhe sobre a oferta. '.repeat(60)}\nÚltima informação.`;
 const {prompt}=createExplorationPrompt({...input,offer});
 assert.ok(offer.length>1000);
 assert.ok(prompt.includes(JSON.stringify(offer)));
 assert.ok(!prompt.includes('[trecho omitido]'));
});
test('limita o contexto ao orçamento preservando decisões e sinalizando trechos omitidos',()=>{
 const long='Linha "citada" com uma barra \\ e contexto.\n'.repeat(110);
 const feedback=Array.from({length:8},()=>({action:'comment',comment:'Comentário',composition:'Plano',contrast:'Contraste'}));
 const result=createExplorationPrompt({...input,offer:long,audience:`PERSONA ${long}`,briefAudience:`PERSONA ${long}`,goal:long,direction:long,feedback});
 assert.ok(result.prompt.length<=8000);
 assert.match(result.prompt,/\[trecho omitido\]/);
 assert.ok(result.prompt.includes('Materiais táteis'));
 assert.ok(result.prompt.includes('Estética luxuosa'));
 assert.ok(result.prompt.includes('Comentário'));
 assert.ok(result.prompt.includes('PERSONA'));assert.equal(result.prompt.includes('BRIEFING'),false);
});
test('valida credenciais e controles em todo o texto, mesmo em contexto que seria truncado',()=>{
 assert.throws(()=>createExplorationPrompt({...input,offer:`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`}));
 assert.throws(()=>createExplorationPrompt({...input,offer:'Texto\u0000inválido'}));
});

test('campos de briefing aceitam hífens comuns e verificam chaves antes de truncar',()=>{
 for(const field of ['idea','offer','audience','briefAudience','goal','direction']){
  const ordinary='task-flow e mask-black e másk-flow';
  assert.ok(createExplorationPrompt({...input,...(field==='briefAudience'?{audience:''}:{}),[field]:ordinary}).prompt.includes(ordinary),field);
  for(const value of ['sk-x','Veja (sk-x)',`tasksk-${'x'.repeat(20)}`,`${'x'.repeat(9000)} sk-x`,`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`,'texto\u0000inválido'])
   assert.throws(()=>createExplorationPrompt({...input,[field]:value}),field);
 }
 // Feedback/decisões mantêm seu contrato anterior.
 assert.throws(()=>createExplorationPrompt({...input,accepted:['task-flow']}));
});
