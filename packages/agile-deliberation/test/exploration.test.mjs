import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorationPrompt } from '../src/exploration.js';

const input = {offer:'Oficina de cerâmica',audience:'Pessoas iniciantes',goal:'Conhecer a oficina',direction:'Tom acolhedor',accepted:['Materiais táteis'],rejected:['Estética luxuosa'],sequence:0};
test('contexto e escolhas explícitas orientam a referência, sem inventar preferências',()=>{
 const {prompt}=createExplorationPrompt(input);
 for(const text of [input.offer,input.audience,input.goal,input.direction,...input.accepted,...input.rejected])assert.ok(prompt.includes(text));
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
