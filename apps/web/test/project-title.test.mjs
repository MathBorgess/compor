import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalTitle} from '../lib/project-title.ts';
import {createStudioState,parseStudioState,resolveProjectTitle} from '../lib/studio-state.ts';

test('título provisório é o começo da ideia cortado numa palavra inteira',()=>{
 assert.equal(provisionalTitle('Oficina de cerâmica aos sábados'),'Oficina de cerâmica aos sábados');
 assert.equal(provisionalTitle('Quero divulgar minha mentoria com uma mensagem próxima, sem parecer mais uma promessa de resultado.'),'Quero divulgar minha mentoria com uma mensagem');
 assert.equal(provisionalTitle('  Oficina\n\nde   cerâmica\t'),'Oficina de cerâmica','espaços e quebras de linha viram um espaço');
});
test('título provisório tem no máximo 48 caracteres e não acrescenta reticências',()=>{
 const words=`${'x'.repeat(43)} abcd`;
 assert.equal(words.length,48);
 assert.equal(provisionalTitle(`${words} fim`),words,'a palavra que termina no 48º caractere fica');
 assert.equal(provisionalTitle(`${'x'.repeat(43)} abcde fim`),'x'.repeat(43),'a palavra que passaria do limite sai inteira');
});
test('primeira palavra maior que 48 caracteres é cortada no limite',()=>{
 assert.equal(provisionalTitle(`${'y'.repeat(60)} fim`),'y'.repeat(48));
});
test('a oportunidade de sugerir título é explícita e persiste sem depender das mensagens',()=>{
 const scope={userId:'00000000-0000-4000-8000-000000000001',projectId:'00000000-0000-4000-8000-000000000002'};
 const initial=createStudioState({...scope,projectTitleProvisional:true});
 assert.equal(parseStudioState(JSON.parse(JSON.stringify(initial))).projectTitleProvisional,true);
 const resolved=resolveProjectTitle(initial);
 assert.equal(parseStudioState(JSON.parse(JSON.stringify(resolved))).projectTitleProvisional,false,'uma proposta aceita ou recusada encerra a oportunidade entre sessões');
 assert.equal(resolveProjectTitle(resolved),resolved,'não reabre a oportunidade nem avança revisão ao resolver outra vez');
 const {projectTitleProvisional,...legacy}=initial;
 assert.equal(parseStudioState(legacy).projectTitleProvisional,false,'estado histórico não autoriza renomeação por iniciativa do agente');
 assert.throws(()=>parseStudioState({...initial,projectTitleProvisional:'true'}));
});
