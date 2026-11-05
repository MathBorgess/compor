import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioAction,AGENT_STUDIO_TOOLS} from '../src/studio-chat-tools.mjs';
const scope={projectId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222'};
test('contexto permite descobrir revisão; mutações exigem revisão e campos próprios',()=>{
 assert.deepEqual(parseStudioAction('compor_contexto',scope),scope);
 assert.throws(()=>parseStudioAction('compor_novo_post',scope));
 assert.throws(()=>parseStudioAction('compor_contexto',{...scope,constructor:'injetado'}));
 assert.throws(()=>parseStudioAction('compor_contexto',JSON.parse(JSON.stringify(scope).replace('}',',"__proto__":{}}'))));
 assert.throws(()=>parseStudioAction('compor_editar_briefing',{...scope,revision:1,field:'offer',value:'sk-do-not-transport'}));
 assert.equal(AGENT_STUDIO_TOOLS.filter(t=>t.name==='generate_image').length,1);
 assert.equal(AGENT_STUDIO_TOOLS.some(t=>t.name==='compor_propor_imagem'),false);
});
test('afirmações de persona preservam procedência e exigem HTTPS para fonte pública',()=>{
 const value={...scope,revision:1,text:'Talvez prefiram exercícios guiados.',provenance:'hypothesis'};
 assert.deepEqual(parseStudioAction('compor_registrar_afirmacao_persona',value),value);
 for(const source of [undefined,'javascript:alert(1)','http://site.test','https://user:secret@site.test'])assert.throws(()=>parseStudioAction('compor_registrar_afirmacao_persona',{...value,provenance:'public_source',source}));
 assert.equal(parseStudioAction('compor_registrar_afirmacao_persona',{...value,provenance:'public_source',source:'https://site.test/page'}).source,'https://site.test/page');
});
