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

function compositionPlan() {
  return {
    ...scope,
    revision: 1,
    pieceId: '33333333-3333-4333-8333-333333333333',
    baseVersion: 0,
    visualInvariants: 'Areia e grafite',
    compositionMode: 'editorial_art',
    compositionTokens: { accent: '#FFF3A4' },
    frames: [
      { position: 1, role: 'capa', headline: 'Seu anúncio some no feed?', body: '', visualCue: 'Tensão no título',
        composition: { layout: 'hero_bleed', alt: 'A capa pergunta se o anúncio some no feed.', bridge: 'hairline_thread' } },
      { position: 2, role: 'comparação', headline: 'Texto pequeno perde leitura', body: 'Leia antes de publicar.', visualCue: 'Compare escalas',
        composition: { layout: 'comparison_dual', alt: 'Dois tamanhos de texto ilustram a diferença de leitura.',
          diagram: { type: 'type_scale', labels: ['Texto pequeno', 'Texto ampliado'], sample: 'Seu anúncio' } } },
      { position: 3, role: 'fechamento', headline: 'Salve para a próxima edição', body: '', visualCue: 'Texto amplo',
        composition: { layout: 'cta_closing', alt: 'O fechamento pede que a pessoa salve as orientações.', polarity: 'inverted' } },
    ],
  };
}

test('plano de composição valida receitas completas e preserva a forma anterior da ação', () => {
  const parsePlan = value => parseStudioAction('compor_definir_plano_laminas', value);
  const plan = compositionPlan();
  assert.deepEqual(parsePlan(plan), plan);

  const legacy = compositionPlan();
  delete legacy.compositionMode;
  delete legacy.compositionTokens;
  legacy.frames.pop();
  for (const frame of legacy.frames) delete frame.composition;
  assert.deepEqual(parsePlan(legacy), legacy);
  assert.throws(() => parsePlan({ ...legacy, compositionTokens: { dark: '#222222' } }), /invalid_action/);
  assert.throws(() => parsePlan({ ...legacy, compositionMode: 'native_serial' }), /invalid_action/);

  const schema = AGENT_STUDIO_TOOLS.find(tool => tool.name === 'compor_definir_plano_laminas').parameters;
  assert.equal(schema.required.includes('compositionMode'), false);
  assert.equal(schema.required.includes('compositionTokens'), false);
  assert.deepEqual(schema.properties.frames.items.properties.composition.required, ['layout', 'alt']);
});

test('contrato de composição rejeita receitas parciais, slots inválidos e segunda capa dependente', () => {
  const plan = compositionPlan();
  const parsePlan = value => parseStudioAction('compor_definir_plano_laminas', value);
  const foreground = composition => ({ ...plan, frames: [plan.frames[0], { ...plan.frames[1], composition }, plan.frames[2]] });
  const base = plan.frames[1].composition;
  for (const invalid of [
    { ...plan, compositionMode: undefined },
    { ...plan, compositionTokens: {} },
    { ...plan, compositionTokens: { light: '#FFF' } },
    { ...plan, compositionTokens: { primary: '#FFFFFF' } },
    { ...plan, frames: plan.frames.slice(0, 2) },
    { ...plan, frames: [plan.frames[0], { ...plan.frames[1], headline: 'Por isso faz diferença' }, plan.frames[2]] },
    foreground(undefined),
    foreground({ ...base, html: '<div />' }),
    foreground({ ...base, alt: '   ' }),
    foreground({ ...base, alt: 'sk-segredo-sintetico' }),
    foreground({ ...base, layout: 'inventado' }),
    foreground({ ...base, bridge: 'foto_cruzada' }),
    foreground({ ...base, diagram: { type: 'flow', sample: 'slot desconhecido' } }),
    foreground({ ...base, diagram: { ...base.diagram, labels: ['A', 'a'] } }),
    foreground({ ...base, layout: 'svg_diagram', diagram: undefined }),
    foreground({ ...base, layout: 'stat_monument', diagram: 'flow', figure: '70%' }),
    foreground({ ...base, layout: 'bento_grid', diagram: 'flow', listItems: ['A', 'B', 'C', 'D', 'E'] }),
  ]) assert.throws(() => parsePlan(invalid), /invalid_action/);

  const proof = foreground({ layout: 'stat_monument', figure: '70%', source: 'Pesquisa citada no briefing.', alt: 'Percentual da pesquisa.' });
  assert.deepEqual(parsePlan(proof), proof);
});
