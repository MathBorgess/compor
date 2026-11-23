import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudioAction,AGENT_STUDIO_TOOLS,SHORT_PROJECT_TITLE_LENGTH,isCarouselSlideComposition} from '../src/studio-chat-tools.mjs';
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

test('planejador e rascunho aplicam o mesmo contrato dos diagramas semânticos', () => {
  const plan = compositionPlan();
  const frame = plan.frames[1];
  const category = { type: 'category_split', labels: ['Pedido de reparo', 'Dúvida'], items: ['Trocar a câmara', 'Medida do pneu'] };
  const orientation = { type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Cara ou coroa?' };
  const schema = AGENT_STUDIO_TOOLS.find(tool => tool.name === 'compor_definir_plano_laminas').parameters;
  const variants = schema.properties.frames.items.properties.composition.properties.diagram.anyOf;
  const categorySchema = variants.find(variant => variant.properties?.type.enum.includes('category_split'));
  const orientationSchema = variants.find(variant => variant.properties?.type.enum.includes('orientation'));
  assert.deepEqual(categorySchema.required, ['type', 'labels', 'items']);
  assert.equal(categorySchema.properties.items.items.maxLength, 18);
  assert.equal(categorySchema.properties.items.maxItems, 2);
  assert.deepEqual(orientationSchema.required, ['type', 'labels', 'sample']);
  assert.deepEqual(orientationSchema.properties.labels.items.enum, orientation.labels);

  for (const diagram of [category, orientation]) {
    const composition = { ...frame.composition, diagram };
    const input = { ...plan, frames: [plan.frames[0], { ...frame, composition }, plan.frames[2]] };
    assert.equal(isCarouselSlideComposition(composition), true);
    assert.deepEqual(parseStudioAction('compor_definir_plano_laminas', input), input);
  }

  for (const composition of [
    { ...frame.composition, diagram: { ...category, labels: ['Dúvida', 'DÚVIDA'] } },
    { ...frame.composition, diagram: { ...category, labels: ['Em pé no mural', 'Dúvida'] } },
    { ...frame.composition, diagram: { ...category, items: ['Medida', 'MEDIDA'] } },
    { ...frame.composition, diagram: { ...category, items: ['Um de a b c', 'Troca'] } },
    { ...frame.composition, diagram: { ...category, items: ['Ó'.repeat(19), 'Troca'] } },
    { ...frame.composition, diagram: { ...category, items: ['<svg>', 'Troca'] } },
    { ...frame.composition, diagram: { ...category, items: ['Troca'] } },
    { ...frame.composition, diagram: { ...category, sample: 'Outra' } },
    { ...frame.composition, diagram: { ...orientation, labels: [...orientation.labels].reverse() } },
    { ...frame.composition, diagram: { ...orientation, labels: ['Orientação certa', 'Orientação errada'] } },
    { ...frame.composition, diagram: { ...orientation, sample: 'Um de a b c' } },
    { ...frame.composition, diagram: { ...orientation, sample: 'À'.repeat(19) } },
    { ...frame.composition, diagram: { ...orientation, items: ['Uma', 'Duas'] } },
    { ...frame.composition, layout: 'hero_bleed', diagram: orientation },
    { ...frame.composition, diagram: 'category_split' },
  ]) {
    const input = { ...plan, frames: [plan.frames[0], { ...frame, composition }, plan.frames[2]] };
    assert.equal(isCarouselSlideComposition(composition), false);
    assert.throws(() => parseStudioAction('compor_definir_plano_laminas', input), /invalid_action/);
  }
});

test('fechamento aceita demonstrações governadas sem abrir um slot de raster', () => {
  const plan = compositionPlan();
  const closing = plan.frames.at(-1);
  const replaceClosing = composition => ({
    ...plan, frames: [...plan.frames.slice(0, -1), { ...closing, composition }],
  });
  const proofs = [
    { type: 'contrast', labels: ['Menos contraste', 'Mais contraste'], sample: 'Seu anúncio' },
    { type: 'type_scale', labels: ['Texto pequeno', 'Texto ampliado'], sample: 'Seu anúncio' },
    { type: 'hierarchy', labels: ['Tudo igual', 'Priorize o nome'], items: ['Nome', 'Preço', 'Local'] },
    { type: 'category_split', labels: ['Na etiqueta', 'No aviso'], items: ['Nome e preço', 'Pagamento'] },
    { type: 'orientation', labels: ['Em pé', 'De cabeça para baixo'], sample: 'Seu anúncio' },
  ];
  for (const diagram of proofs) {
    const composition = { ...closing.composition, diagram };
    const input = replaceClosing(composition);
    assert.equal(isCarouselSlideComposition(composition), true, diagram.type);
    assert.deepEqual(parseStudioAction('compor_definir_plano_laminas', input), input);
    assert.throws(() => parseStudioAction('compor_definir_plano_laminas', replaceClosing({
      ...composition, artSha256: 'a'.repeat(64),
    })), /invalid_action/);
  }
  assert.throws(() => parseStudioAction('compor_definir_plano_laminas', replaceClosing({
    ...closing.composition, diagram: proofs[0], art: 'data:image/png;base64,aQ==',
  })), /invalid_action/);
});

test('matriz de legibilidade tem uma receita fechada para notas seriadas', () => {
  const plan = compositionPlan();
  const frame = plan.frames[1];
  const composition = { layout: 'native_serial', alt: 'A oferta muda de tamanho, contraste e peso.', diagram: { type: 'readability_matrix' } };
  const native = { ...plan, compositionMode: 'native_serial', frames: [plan.frames[0], { ...frame, composition },
    { ...frame, position: 3 }, { ...plan.frames[2], position: 4 }] };
  const parse = value => parseStudioAction('compor_definir_plano_laminas', value);
  const schema = AGENT_STUDIO_TOOLS.find(tool => tool.name === 'compor_definir_plano_laminas').parameters;
  const variants = schema.properties.frames.items.properties.composition.properties.diagram.anyOf;
  const matrix = variants.find(variant => variant.properties?.type.enum.includes('readability_matrix'));
  assert.deepEqual(Object.keys(matrix.properties), ['type']);
  assert.equal(matrix.additionalProperties, false);
  assert.deepEqual(parse(native), native);
  assert.throws(() => parse({ ...native, compositionMode: 'editorial_art' }), /invalid_action/);
  assert.throws(() => parse({ ...native, frames: native.frames.slice(0, 3) }), /invalid_action/);
  for (const slots of [
    { layout: 'cta_closing' }, { diagram: 'readability_matrix' },
    { diagram: { ...composition.diagram, items: ['Oferta', 'Detalhes'] } },
  ]) {
    assert.equal(isCarouselSlideComposition({ ...composition, ...slots }), false);
  }
});
