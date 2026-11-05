const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const string = maxLength => ({ type: 'string', maxLength });
const fields = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const scopeProperties = { projectId: string(36), revision: { type: 'integer', minimum: 0 }, requestId: string(36) };
const commands = [
  ['compor_contexto', 'Consulta o projeto, a peça e a versão abertas e informa quais alterações ainda são locais.', {}, false, true],
  ['compor_editar_briefing', 'Atualiza um campo do briefing local e mostra a alteração na interface.', { field: { enum: ['offer', 'audience', 'action', 'direction'] }, value: string(4000) }, false],
  ['compor_editar_persona', 'Atualiza o rascunho local da persona compradora. Não transforma hipóteses em fatos.', { field: { enum: ['audience', 'situation', 'need', 'culturalReferences'] }, value: string(4000) }, false],
  ['compor_registrar_afirmacao_persona', 'Registra uma afirmação local da persona com sua procedência declarada. public_source exige source com URL HTTPS consultada; a fonte não autentica a afirmação.', { text: string(2000), provenance: {enum:['hypothesis','creator_report','buyer_report','public_source']}, source: string(2000) }, false],
  ['compor_novo_post', 'Inicia um post em rascunho no projeto. O rascunho anterior é preservado no navegador.', {}, false],
  ['compor_editar_peca', 'Edita um campo do post em rascunho na aba.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, field: { enum: ['headline', 'price', 'date', 'caption'] }, value: string(4000) }, false],
  ['compor_abrir_versao', 'Abre uma versão existente como base sem sobrescrever o rascunho anterior.', { pieceId: string(36), version: { type: 'integer', minimum: 1 } }, false],
  ['compor_salvar_versao', 'Solicita confirmação na interface antes de salvar uma versão nova no projeto.', {pieceId:string(36),baseVersion:{type:'integer',minimum:0},expectedLatestVersion:{type:'integer',minimum:0}}, true],
  ['compor_renomear_projeto', 'Solicita confirmação na interface antes de alterar o nome persistido do projeto.', { title: string(200) }, true],
  ['compor_propor_imagem', 'Apresenta uma proposta de imagem. A geração paga depende de confirmação separada na interface.', { prompt: string(4000) }, false],
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
  if ('prompt' in value && !value.prompt.trim()) throw Error('invalid_action');
  if(tool.name==='compor_registrar_afirmacao_persona'){
    if(!value.text.trim())throw Error('invalid_action');
    if(value.provenance==='public_source'){
      try{const source=new URL(value.source);if(source.protocol!=='https:'||source.username||source.password||/\s/.test(value.source))throw Error();}catch{throw Error('invalid_action');}
    }
  }
  return value;
}


export function parseStudioAction(name,value) {
 const tool=STUDIO_TOOLS.find(item=>item.name===name);
 if(!tool)throw Error('invalid_action');
 return parse(tool,value);
}
export const AGENT_STUDIO_TOOLS=Object.freeze([...STUDIO_TOOLS.filter(tool=>tool.name!=='compor_propor_imagem').map(tool=>({type:'function',name:tool.name,description:tool.description,parameters:tool.inputSchema})),{type:'function',name:'generate_image',description:'Prepara uma proposta de imagem. A Images API só será acionada após a confirmação explícita da pessoa no aplicativo.',parameters:fields({prompt:string(4000)})}]);
