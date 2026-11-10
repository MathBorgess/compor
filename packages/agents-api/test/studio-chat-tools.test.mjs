import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioAction,AGENT_STUDIO_TOOLS,SHORT_PROJECT_TITLE_LENGTH} from '../src/studio-chat-tools.mjs';
const scope={projectId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222'};
test('contexto permite descobrir revisão; mutações exigem revisão e campos próprios',()=>{
 assert.deepEqual(parseStudioAction('compor_contexto',scope),scope);
 assert.throws(()=>parseStudioAction('compor_novo_post',scope));
 assert.throws(()=>parseStudioAction('compor_contexto',{...scope,constructor:'injetado'}));
 assert.throws(()=>parseStudioAction('compor_contexto',JSON.parse(JSON.stringify(scope).replace('}',',"__proto__":{}}'))));
 assert.throws(()=>parseStudioAction('compor_editar_briefing',{...scope,revision:1,field:'offer',value:'sk-do-not-transport'}));
 assert.equal(AGENT_STUDIO_TOOLS.filter(t=>t.name==='generate_image').length,1);
 assert.match(AGENT_STUDIO_TOOLS.find(t=>t.name==='generate_image').description,/generated_and_stored com assetId confirma geração e armazenamento/);
 assert.match(AGENT_STUDIO_TOOLS.find(t=>t.name==='generate_image').description,/aplicação no navegador é uma etapa separada/);
 assert.equal(AGENT_STUDIO_TOOLS.some(t=>t.name==='compor_propor_imagem'),false);
});
test('afirmações de persona preservam procedência e exigem HTTPS para fonte pública',()=>{
 const value={...scope,revision:1,text:'Talvez prefiram exercícios guiados.',provenance:'hypothesis'};
 assert.deepEqual(parseStudioAction('compor_registrar_afirmacao_persona',value),value);
 for(const source of [undefined,'javascript:alert(1)','http://site.test','https://user:secret@site.test'])assert.throws(()=>parseStudioAction('compor_registrar_afirmacao_persona',{...value,provenance:'public_source',source}));
 assert.equal(parseStudioAction('compor_registrar_afirmacao_persona',{...value,provenance:'public_source',source:'https://site.test/page'}).source,'https://site.test/page');
});
test('feedback visual exige referência e trecho literal limitado, sem aceitar segredo',()=>{
 const value={...scope,revision:1,referenceId:'33333333-3333-4333-8333-333333333333',action:'selected',quote:'Gostei da composição.'};
 assert.deepEqual(parseStudioAction('compor_registrar_feedback_visual',value),value);
 assert.throws(()=>parseStudioAction('compor_registrar_feedback_visual',{...value,referenceId:'desconhecida'}));
 assert.throws(()=>parseStudioAction('compor_registrar_feedback_visual',{...value,quote:''}));
 assert.throws(()=>parseStudioAction('compor_registrar_feedback_visual',{...value,quote:'sk-nao-registrar'}));
});

test('comentário sobre imagem gerada exige número válido e trecho literal',()=>{
 const value={...scope,revision:1,ordinal:42,quote:'Gostei do contraste'};
 assert.deepEqual(parseStudioAction('compor_comentar_imagem_gerada',value),value);
 assert.throws(()=>parseStudioAction('compor_comentar_imagem_gerada',{...value,ordinal:0}));
 assert.throws(()=>parseStudioAction('compor_comentar_imagem_gerada',{...value,ordinal:2147483648}));
 assert.throws(()=>parseStudioAction('compor_comentar_imagem_gerada',{...value,quote:'sk-nao-registrar'}));
 assert.ok(AGENT_STUDIO_TOOLS.some(tool=>tool.name==='compor_comentar_imagem_gerada'));
});

test('IA pode estruturar um campo vazio, sem fornecer um valor inventado',()=>{
 const value={...scope,revision:1,pieceId:'33333333-3333-4333-8333-333333333333',baseVersion:0,label:'Local'};
 assert.deepEqual(parseStudioAction('compor_adicionar_campo',value),value);
 assert.throws(()=>parseStudioAction('compor_adicionar_campo',{...value,label:' '}));
 assert.throws(()=>parseStudioAction('compor_adicionar_campo',{...value,value:'local inventado'}));
 assert.ok(AGENT_STUDIO_TOOLS.some(tool=>tool.name==='compor_adicionar_campo'));
});

test('agente renomeia o projeto com título curto de até 48 caracteres',()=>{
 const value={...scope,revision:1,title:'a'.repeat(48)};
 assert.equal(SHORT_PROJECT_TITLE_LENGTH,48);
 assert.deepEqual(parseStudioAction('compor_renomear_projeto',value),value);
 assert.throws(()=>parseStudioAction('compor_renomear_projeto',{...value,title:'a'.repeat(49)}),/invalid_action/);
 assert.throws(()=>parseStudioAction('compor_renomear_projeto',{...value,title:'  '}),/invalid_action/);
 assert.equal(AGENT_STUDIO_TOOLS.find(tool=>tool.name==='compor_renomear_projeto').parameters.properties.title.maxLength,48,'o modelo vê o limite no esquema da ferramenta');
});
