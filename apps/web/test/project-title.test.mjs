import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionalTitle,isProvisionalTitle} from '../lib/project-title.ts';

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
test('título segue provisório enquanto for o recorte da primeira mensagem da pessoa',()=>{
 const messages=[{role:'system',text:'Seleção de referências'},{role:'user',text:'Quero divulgar minha oficina de cerâmica para iniciantes aos sábados'},{role:'assistant',text:'Para quem?'},{role:'user',text:'Iniciantes'}];
 assert.equal(isProvisionalTitle('Quero divulgar minha oficina de cerâmica para',messages),true);
 assert.equal(isProvisionalTitle('Cerâmica aos sábados',messages),false,'um título renomeado deixa de ser provisório');
 assert.equal(isProvisionalTitle('Iniciantes',messages),false,'só a primeira mensagem da pessoa conta');
 assert.equal(isProvisionalTitle('Seleção de referências',messages.slice(0,1)),false,'sem mensagem da pessoa não há título provisório');
});
