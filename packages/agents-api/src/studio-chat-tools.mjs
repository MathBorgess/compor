import { IMAGE_PROPOSAL_SCHEMA } from './image-proposal.mjs';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const string = maxLength => ({ type: 'string', maxLength });
const fields = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const scopeProperties = { projectId: string(36), revision: { type: 'integer', minimum: 0 }, requestId: string(36) };
const commands = [
  ['compor_contexto', 'Consulta o projeto, a peça e a versão abertas e informa quais alterações ainda são locais.', {}, false, true],
  ['compor_editar_briefing', 'Atualiza um campo do briefing local e mostra a alteração na interface.', { field: { enum: ['offer', 'audience', 'action', 'direction'] }, value: string(4000) }, false],
  ['compor_editar_persona', 'Atualiza o rascunho local da persona compradora. Não transforma hipóteses em fatos.', { field: { enum: ['audience', 'situation', 'need', 'culturalReferences'] }, value: string(4000) }, false],
  ['compor_registrar_afirmacao_persona', 'Registra uma afirmação local da persona com sua procedência declarada. public_source exige source com URL HTTPS consultada; a fonte não autentica a afirmação.', { text: string(2000), provenance: {enum:['hypothesis','creator_report','buyer_report','public_source']}, source: string(2000) }, false],
  ['compor_propor_criterio', 'Propõe um critério criativo com exemplo e contraexemplo para uma ambiguidade relevante. A pessoa decide na interface; esta ferramenta não adota nem rejeita critérios. Use campos vazios quando não houver fonte, referência ou tensão.', { viewpoint: {enum:['creator','recipient']}, dimension: {enum:['visual','message']}, statement:string(600), example:string(500), counterexample:string(500), exampleReferenceId:string(36), counterexampleReferenceId:string(36), provenance:{enum:['hypothesis','creator_report','buyer_report','public_source']}, source:string(1000), tension:string(600) }, false],
  ['compor_registrar_feedback_visual', 'Registra somente uma avaliação expressa pela pessoa na mensagem atual sobre uma referência selecionada e identificada. quote deve ser trecho literal da mensagem; se não for claro qual imagem, pergunte antes. Não trate seleção como aprovação ou invente avaliação.', {referenceId:string(36),action:{enum:['selected','rejected','comment']},quote:string(1000)}, false],
  ['compor_comentar_imagem_gerada', 'Registra um comentário literal da pessoa sobre uma imagem gerada que ela identificou pelo número exibido, mesmo sem selecioná-la. Use ordinal exatamente como escrito e quote como trecho literal do comentário. Se ela mencionar mais de um número ou a imagem não estiver clara, peça esclarecimento; não invente opinião.', {ordinal:{type:'integer',minimum:1,maximum:2147483647},quote:string(1000)}, false],
  ['compor_novo_post', 'Inicia um post em rascunho no projeto. O rascunho anterior é preservado no navegador.', {}, false],
  ['compor_editar_peca', 'Edita um campo do post em rascunho na aba.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, field: { enum: ['headline', 'price', 'date', 'caption'] }, value: string(4000) }, false],
  ['compor_adicionar_campo', 'Acrescenta ao rascunho um campo vazio relevante para o tipo de post. Nomeie apenas a informação necessária; não invente seu valor. A pessoa pode preenchê-lo ou removê-lo.', {pieceId:string(36),baseVersion:{type:'integer',minimum:0},label:string(80)}, false],
  ['compor_abrir_versao', 'Abre uma versão existente como base sem sobrescrever o rascunho anterior.', { pieceId: string(36), version: { type: 'integer', minimum: 1 } }, false],
  ['compor_salvar_versao', 'Solicita confirmação na interface antes de salvar uma versão nova no projeto.', {pieceId:string(36),baseVersion:{type:'integer',minimum:0},expectedLatestVersion:{type:'integer',minimum:0}}, true],
  ['compor_renomear_projeto', 'Solicita confirmação na interface antes de alterar o nome persistido do projeto.', { title: string(200) }, true],
  ['compor_propor_imagem', 'Apresenta uma proposta de imagem para a conversa.', { prompt: string(4000) }, false],
];

export const STUDIO_TOOLS = Object.freeze(commands.map(([name, description, properties, consequential, readOnly]) => Object.freeze({
  name, description, inputSchema: fields({ ...scopeProperties, ...properties }, readOnly ? ['projectId','requestId'] : name==='compor_registrar_afirmacao_persona'?['projectId','revision','requestId','text','provenance']:undefined),
  annotations: { readOnlyHint: Boolean(readOnly), consequentialHint: Boolean(consequential) },
})));

function parse(tool, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_action');
  const schema = tool.inputSchema;
  if (Object.keys(value).some(key => !Object.hasOwn(schema.properties,key)) || schema.required.some(key => !Object.hasOwn(value,key))) throw Error('invalid_action');
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in value)) continue;
    const item = value[key];
    if (spec.type === 'string' && (typeof item !== 'string' || item.length > spec.maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item) || /sk-[^\s]+/i.test(item))) throw Error('invalid_action');
    if (spec.type === 'integer' && (!Number.isSafeInteger(item) || item < spec.minimum)) throw Error('invalid_action');
    if (spec.enum && !spec.enum.includes(item)) throw Error('invalid_action');
  }
  if (!uuid(value.projectId) || !uuid(value.requestId) || ('pieceId' in value && !uuid(value.pieceId))) throw Error('invalid_action');
  if ('title' in value && !value.title.trim()) throw Error('invalid_action');
  if (tool.name==='compor_adicionar_campo' && (!value.label.trim() || /[\u0000-\u001f\u007f]/.test(value.label))) throw Error('invalid_action');
  if ('prompt' in value && !value.prompt.trim()) throw Error('invalid_action');
  if(tool.name==='compor_registrar_afirmacao_persona'||tool.name==='compor_propor_criterio'){
    if(tool.name==='compor_registrar_afirmacao_persona'&&!value.text.trim())throw Error('invalid_action');
    if(value.provenance==='public_source'){
      try{const source=new URL(value.source);if(source.protocol!=='https:'||source.username||source.password||/\s/.test(value.source))throw Error();}catch{throw Error('invalid_action');}
    }
  }
  if(tool.name==='compor_propor_criterio'){
    if(!value.statement.trim()||!value.example.trim()||!value.counterexample.trim())throw Error('invalid_action');
    for(const id of [value.exampleReferenceId,value.counterexampleReferenceId])if(id!==''&&!uuid(id))throw Error('invalid_action');
  }
  if(tool.name==='compor_registrar_feedback_visual'&&(!uuid(value.referenceId)||!value.quote.trim()))throw Error('invalid_action');
  if(tool.name==='compor_comentar_imagem_gerada'&&(!Number.isSafeInteger(value.ordinal)||value.ordinal<1||value.ordinal>2147483647||!value.quote.trim()))throw Error('invalid_action');
  return value;
}


export function parseStudioAction(name,value) {
 const tool=STUDIO_TOOLS.find(item=>item.name===name);
 if(!tool)throw Error('invalid_action');
 return parse(tool,value);
}
export const AGENT_STUDIO_TOOLS=Object.freeze([...STUDIO_TOOLS.filter(tool=>tool.name!=='compor_propor_imagem').map(tool=>({type:'function',name:tool.name,description:tool.description,parameters:tool.inputSchema})),{type:'function',name:'generate_image',description:'Prepara uma arte integral com imagem e textos. operation=create produz nova composição; operation=edit exige baseImageId da imagem selecionada. referenceIds identifica referências visuais fornecidas no contexto. Inclua no prompt a direção e os textos desejados. A chave conectada autoriza a geração guiada durante a sessão, sem confirmação por imagem. O resultado generated_and_stored com assetId confirma geração e armazenamento na versão indicada; a aplicação no navegador é uma etapa separada.',parameters:IMAGE_PROPOSAL_SCHEMA}]);
