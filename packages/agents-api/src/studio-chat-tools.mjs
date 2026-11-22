import { IMAGE_PROPOSAL_SCHEMA } from './image-proposal.mjs';
import { POST_FORMATS, FORMAT_SPECS } from './creative-skills/formats.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const string = maxLength => ({ type: 'string', maxLength });
const fields = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const scopeProperties = { projectId: string(36), revision: { type: 'integer', minimum: 0 }, requestId: string(36) };
export const SHORT_PROJECT_TITLE_LENGTH = 48;

const framePlanItemSchema = fields({
  id: string(36),
  position: { type: 'integer', minimum: 1, maximum: 10 },
  role: string(80),
  headline: string(500),
  body: string(1000),
  visualCue: string(500),
}, ['position', 'role', 'headline', 'body', 'visualCue']);

const commands = [
  ['compor_contexto', 'Consulta o projeto, a peça e a versão abertas e informa quais alterações ainda são locais.', {}, false, true],
  ['compor_editar_briefing', 'Atualiza um campo do briefing local e mostra a alteração na interface.', { field: { enum: ['offer', 'audience', 'action', 'direction'] }, value: string(4000) }, false],
  ['compor_editar_voz', 'Atualiza o perfil de voz e linguagem da marca no projeto (tone = tom/registro, examples = frases reais do criador, avoid = palavras ou clichês a evitar). Não invente exemplos sem base na conversa.', { field: { enum: ['tone', 'examples', 'avoid'] }, value: string(1000) }, false],
  ['compor_editar_persona', 'Atualiza o rascunho local da persona compradora. Não transforma hipóteses em fatos.', { field: { enum: ['audience', 'situation', 'need', 'culturalReferences'] }, value: string(4000) }, false],
  ['compor_registrar_afirmacao_persona', 'Registra uma afirmação local da persona com sua procedência declarada. public_source exige source com URL HTTPS consultada; a fonte não autentica a afirmação.', { text: string(2000), provenance: {enum:['hypothesis','creator_report','buyer_report','public_source']}, source: string(2000) }, false],
  ['compor_propor_criterio', 'Propõe um critério criativo com exemplo e contraexemplo para uma ambiguidade relevante. A pessoa decide na interface; esta ferramenta não adota nem rejeita critérios. Use campos vazios quando não houver fonte, referência ou tensão.', { viewpoint: {enum:['creator','recipient']}, dimension: {enum:['visual','message']}, statement:string(600), example:string(500), counterexample:string(500), exampleReferenceId:string(36), counterexampleReferenceId:string(36), provenance:{enum:['hypothesis','creator_report','buyer_report','public_source']}, source:string(1000), tension:string(600) }, false],
  ['compor_registrar_feedback_visual', 'Registra somente uma avaliação expressa pela pessoa na mensagem atual sobre uma referência selecionada e identificada. quote deve ser trecho literal da mensagem; se não for claro qual imagem, pergunte antes. Não trate seleção como aprovação ou invente avaliação.', {referenceId:string(36),action:{enum:['selected','rejected','comment']},quote:string(1000)}, false],
  ['compor_comentar_imagem_gerada', 'Registra um comentário literal da pessoa sobre uma imagem gerada que ela identificou pelo número exibido, mesmo sem selecioná-la. Use ordinal exatamente como escrito e quote como trecho literal do comentário. Se ela mencionar mais de um número ou a imagem não estiver clara, peça esclarecimento; não invente opinião.', {ordinal:{type:'integer',minimum:1,maximum:2147483647},quote:string(1000)}, false],
  ['compor_novo_post', 'Inicia um post em rascunho no projeto. O rascunho anterior é preservado no navegador.', {}, false],
  ['compor_definir_formato', 'Altera o formato do post atual (single = Post único 4:5, carousel = Carrossel 4:5 de 3 a 10 lâminas, collection = Coleção 4:5 de 2 a 10 fotos, story = Story vertical 9:16). Não inicia geração de imagem.', { pieceId: string(36), format: { enum: [...POST_FORMATS] }, frameCount: { type: 'integer', minimum: 1, maximum: 10 } }, false],
  ['compor_definir_plano_laminas', 'Define ou atualiza o plano ordenado das lâminas de um Carrossel (3..10) ou Coleção (2..10), incluindo invariantes visuais compartilhados e texto/papel de cada lâmina. Atualiza a interface para revisão humana sem gerar imagens.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, visualInvariants: string(1000), frames: { type: 'array', minItems: 2, maxItems: 10, items: framePlanItemSchema } }, false],
  ['compor_editar_lamina', 'Edita cirurgicamente um único campo de uma lâmina específica do Carrossel ou Coleção (role, headline, body ou visualCue), preservando as demais lâminas intactas.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, frameId: string(36), field: { enum: ['role', 'headline', 'body', 'visualCue'] }, value: string(1000) }, false],
  ['compor_editar_peca', 'Edita um campo do post em rascunho na aba.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, field: { enum: ['headline', 'price', 'date', 'caption'] }, value: string(4000) }, false],
  ['compor_adicionar_campo', 'Acrescenta ao rascunho um campo vazio relevante para o tipo de post. Nomeie apenas a informação necessária; não invente seu valor. A pessoa pode preenchê-lo ou removê-lo.', {pieceId:string(36),baseVersion:{type:'integer',minimum:0},label:string(80)}, false],
  ['compor_abrir_versao', 'Abre uma versão existente como base sem sobrescrever o rascunho anterior.', { pieceId: string(36), version: { type: 'integer', minimum: 1 } }, false],
  ['compor_salvar_versao', 'Solicita confirmação na interface antes de salvar uma versão nova no projeto.', {pieceId:string(36),baseVersion:{type:'integer',minimum:0},expectedLatestVersion:{type:'integer',minimum:0}}, true],
  ['compor_renomear_projeto', 'Solicita confirmação na interface antes de alterar o nome persistido do projeto.', { title: string(SHORT_PROJECT_TITLE_LENGTH) }, true],
  ['compor_propor_imagem', 'Apresenta uma proposta de imagem para a conversa.', { prompt: string(4000) }, false],
];

const customRequired = {
  compor_registrar_afirmacao_persona: ['projectId', 'revision', 'requestId', 'text', 'provenance'],
  compor_definir_formato: ['projectId', 'revision', 'requestId', 'pieceId', 'format'],
};

export const STUDIO_TOOLS = Object.freeze(commands.map(([name, description, properties, consequential, readOnly]) => Object.freeze({
  name,
  description,
  inputSchema: fields(
    { ...scopeProperties, ...properties },
    readOnly ? ['projectId', 'requestId'] : customRequired[name],
  ),
  annotations: { readOnlyHint: Boolean(readOnly), consequentialHint: Boolean(consequential) },
})));

const safeString = (value, max, allowNewline = true) => {
  const forbidden = allowNewline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  return typeof value === 'string' && value.length <= max && !forbidden.test(value) && !/sk-[^\s]+/i.test(value);
};

function validateFramePlan(frames) {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 10) throw Error('invalid_action');
  const positions = new Set(), ids = new Set();
  for (const frame of frames) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw Error('invalid_action');
    const keys = Object.keys(frame);
    if (keys.some(k => !['id', 'position', 'role', 'headline', 'body', 'visualCue'].includes(k))) throw Error('invalid_action');
    if (!['position', 'role', 'headline', 'body', 'visualCue'].every(k => Object.hasOwn(frame, k))) throw Error('invalid_action');
    if (frame.id !== undefined) {
      if (!uuid(frame.id) || ids.has(frame.id.toLowerCase())) throw Error('invalid_action');
      ids.add(frame.id.toLowerCase());
    }
    if (!Number.isSafeInteger(frame.position) || frame.position < 1 || frame.position > frames.length || positions.has(frame.position)) throw Error('invalid_action');
    positions.add(frame.position);
    if (!safeString(frame.role, 80, false) || !safeString(frame.headline, 500, true) || !safeString(frame.body, 1000, true) || !safeString(frame.visualCue, 500, true)) {
      throw Error('invalid_action');
    }
  }
}

function parse(tool, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_action');
  const schema = tool.inputSchema;
  if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key)) || schema.required.some(key => !Object.hasOwn(value, key))) throw Error('invalid_action');
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in value)) continue;
    const item = value[key];
    if (spec.type === 'string' && !safeString(item, spec.maxLength, true)) throw Error('invalid_action');
    if (spec.type === 'integer' && (!Number.isSafeInteger(item) || item < spec.minimum || (spec.maximum !== undefined && item > spec.maximum))) throw Error('invalid_action');
    if (spec.enum && !spec.enum.includes(item)) throw Error('invalid_action');
    if (spec.type === 'array' && key === 'frames') validateFramePlan(item);
  }
  if (!uuid(value.projectId) || !uuid(value.requestId) || ('pieceId' in value && !uuid(value.pieceId))) throw Error('invalid_action');
  if ('title' in value && !value.title.trim()) throw Error('invalid_action');
  if (tool.name === 'compor_adicionar_campo' && (!value.label.trim() || /[\u0000-\u001f\u007f]/.test(value.label))) throw Error('invalid_action');
  if ('prompt' in value && !value.prompt.trim()) throw Error('invalid_action');
  if (tool.name === 'compor_definir_formato' && value.frameCount !== undefined) {
    const spec = FORMAT_SPECS[value.format];
    if (value.frameCount < spec.minFrames || value.frameCount > spec.maxFrames) throw Error('invalid_action');
  }
  if (tool.name === 'compor_editar_lamina') {
    if (!uuid(value.frameId)) throw Error('invalid_action');
    const maxByField = { role: 80, headline: 500, body: 1000, visualCue: 500 };
    if (!safeString(value.value, maxByField[value.field], value.field !== 'role')) throw Error('invalid_action');
  }
  if (tool.name === 'compor_registrar_afirmacao_persona' || tool.name === 'compor_propor_criterio') {
    if (tool.name === 'compor_registrar_afirmacao_persona' && !value.text.trim()) throw Error('invalid_action');
    if (value.provenance === 'public_source') {
      try { const source = new URL(value.source); if (source.protocol !== 'https:' || source.username || source.password || /\s/.test(value.source)) throw Error(); } catch { throw Error('invalid_action'); }
    }
  }
  if (tool.name === 'compor_propor_criterio') {
    if (!value.statement.trim() || !value.example.trim() || !value.counterexample.trim()) throw Error('invalid_action');
    for (const id of [value.exampleReferenceId, value.counterexampleReferenceId]) if (id !== '' && !uuid(id)) throw Error('invalid_action');
  }
  if (tool.name === 'compor_registrar_feedback_visual' && (!uuid(value.referenceId) || !value.quote.trim())) throw Error('invalid_action');
  if (tool.name === 'compor_comentar_imagem_gerada' && (!Number.isSafeInteger(value.ordinal) || value.ordinal < 1 || value.ordinal > 2147483647 || !value.quote.trim())) throw Error('invalid_action');
  return value;
}

export function parseStudioAction(name, value) {
  const tool = STUDIO_TOOLS.find(item => item.name === name);
  if (!tool) throw Error('invalid_action');
  return parse(tool, value);
}

function agentStudioTools() {
  return Object.freeze([
    ...STUDIO_TOOLS.filter(tool => tool.name !== 'compor_propor_imagem').map(tool => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
    {
      type: 'function',
      name: 'generate_image',
      description: 'Prepara uma arte integral com imagem e textos. operation=create produz nova composição; operation=edit exige baseImageId da imagem selecionada. referenceIds identifica referências visuais fornecidas no contexto. Informe format (single, carousel, collection ou story) conforme o post ativo; em carousel e collection informe também frameId e frameIndex da lâmina alvo (gere a Lâmina 1 âncora primeiro antes das demais). Declare changedDimension (style, composition ou hook) quando mudar a dimensão criativa: isso abre uma variante sem aprovação. Omita changedDimension nos retoques; operation create/edit não decide a classificação. Inclua no prompt a direção e os textos desejados. A chave conectada autoriza a geração guiada durante a sessão, sem confirmação por imagem. O resultado generated_and_stored com assetId confirma geração e armazenamento na versão indicada; a aplicação no navegador é uma etapa separada.',
      parameters: IMAGE_PROPOSAL_SCHEMA,
    },
  ]);
}
export const AGENT_STUDIO_TOOLS = /*#__PURE__*/agentStudioTools();
