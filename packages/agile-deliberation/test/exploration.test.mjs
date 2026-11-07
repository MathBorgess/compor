import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationPrompt } from '../src/exploration.js';

const input = {offer:'Oficina de cerâmica',audience:'Pessoas iniciantes',goal:'Conhecer a oficina',direction:'Tom acolhedor',accepted:['Materiais táteis'],rejected:['Estética luxuosa'],sequence:0};
test('contexto e escolhas explícitas orientam a referência, sem inventar preferências',()=>{
 const {prompt}=createExplorationPrompt(input);
 for(const text of [input.offer,input.audience,input.goal,input.direction,...input.accepted,...input.rejected])assert.ok(prompt.includes(text));
 assert.ok(prompt.includes('"publico_ou_observacoes_do_briefing":""'),'chamada legada sem campo opcional continua válida');
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
test('conserva separadamente o campo do briefing e o público da persona, sem inventar uma reconciliação',()=>{
 const brief='Pessoas que trabalham à noite',persona='Pessoas que estudam pela manhã';
 const separate=createExplorationPrompt({...input,briefAudience:brief,audience:persona}).prompt;
 assert.ok(separate.includes(`"publico_da_persona":${JSON.stringify(persona)}`));
 assert.ok(separate.includes(`"publico_ou_observacoes_do_briefing":${JSON.stringify(brief)}`));
 assert.match(separate,/não invente a origem dos dados/);assert.match(separate,/Hipóteses não são evidência de público real/);assert.match(separate,/divergências não devem ser resolvidas por suposição/);
 assert.match(separate,/Respeite essas escolhas acima da proposta de variação/);
 const noPersona=createExplorationPrompt({...input,briefAudience:brief,audience:''}).prompt;
 assert.ok(noPersona.includes('"publico_da_persona":""'));assert.ok(noPersona.includes(`"publico_ou_observacoes_do_briefing":${JSON.stringify(brief)}`));
 const fact=createExplorationPrompt({...input,briefAudience:'A peça precisa mencionar acessibilidade'}).prompt;
 assert.ok(fact.includes('A peça precisa mencionar acessibilidade'));
 const ordinary=createExplorationPrompt({...input,briefAudience:'task-flow e mask-black são estilos'}).prompt;
 assert.ok(ordinary.includes('task-flow e mask-black'));
 assert.throws(()=>createExplorationPrompt({...input,briefAudience:`Texto com sk-${'abc'.repeat(8)} embutida`}));
 assert.throws(()=>createExplorationPrompt({...input,briefAudience:`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`}));
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
 const result=createExplorationPrompt({...input,offer:long,audience:`PERSONA ${long}`,briefAudience:`BRIEFING ${long}`,goal:long,direction:long,feedback});
 assert.ok(result.prompt.length<=8000);
 assert.match(result.prompt,/\[trecho omitido\]/);
 assert.ok(result.prompt.includes('Materiais táteis'));
 assert.ok(result.prompt.includes('Estética luxuosa'));
 assert.ok(result.prompt.includes('Comentário'));
 assert.ok(result.prompt.includes('PERSONA'));assert.ok(result.prompt.includes('BRIEFING'));
});
test('valida credenciais e controles em todo o texto, mesmo em contexto que seria truncado',()=>{
 assert.throws(()=>createExplorationPrompt({...input,offer:`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`}));
 assert.throws(()=>createExplorationPrompt({...input,offer:'Texto\u0000inválido'}));
});

test('campos de briefing aceitam hífens comuns e verificam chaves antes de truncar',()=>{
 for(const field of ['offer','audience','briefAudience','goal','direction']){
  const ordinary='task-flow e mask-black e másk-flow';
  assert.ok(createExplorationPrompt({...input,[field]:ordinary}).prompt.includes(ordinary),field);
  for(const value of ['sk-x','Veja (sk-x)',`tasksk-${'x'.repeat(20)}`,`${'x'.repeat(9000)} sk-x`,`${'x'.repeat(9000)} sk-${'x'.repeat(30)}`,'texto\u0000inválido'])
   assert.throws(()=>createExplorationPrompt({...input,[field]:value}),field);
 }
 // Feedback/decisões mantêm seu contrato anterior.
 assert.throws(()=>createExplorationPrompt({...input,accepted:['task-flow']}));
});
