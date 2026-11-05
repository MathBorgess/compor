const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const string = maxLength => ({ type: 'string', maxLength });
const fields = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const scopeProperties = { projectId: string(36), revision: { type: 'integer', minimum: 0 }, requestId: string(36) };
const commands = [
  ['compor_contexto', 'Consulta o projeto, a peça e a versão abertas e informa quais alterações ainda são locais.', {}, false, true],
  ['compor_editar_briefing', 'Atualiza um campo do briefing local e mostra a alteração na interface.', { field: { enum: ['offer', 'audience', 'action', 'direction'] }, value: string(4000) }, false],
  ['compor_editar_persona', 'Atualiza o rascunho local da persona compradora. Não transforma hipóteses em fatos.', { field: { enum: ['audience', 'situation', 'need', 'culturalReferences'] }, value: string(4000) }, false],
  ['compor_novo_post', 'Inicia um post em rascunho no projeto. O rascunho anterior é preservado no navegador.', {}, false],
  ['compor_editar_peca', 'Edita um campo do post em rascunho na aba.', { pieceId: string(36), baseVersion: { type: 'integer', minimum: 0 }, field: { enum: ['headline', 'price', 'date', 'caption'] }, value: string(4000) }, false],
  ['compor_abrir_versao', 'Abre uma versão existente como base sem sobrescrever o rascunho anterior.', { pieceId: string(36), version: { type: 'integer', minimum: 1 } }, false],
  ['compor_salvar_versao', 'Solicita confirmação na interface antes de salvar uma versão nova no projeto.', {}, true],
  ['compor_renomear_projeto', 'Solicita confirmação na interface antes de alterar o nome persistido do projeto.', { title: string(200) }, true],
  ['compor_propor_imagem', 'Apresenta uma proposta de imagem. A geração paga depende de confirmação separada na interface.', { prompt: string(4000) }, false],
];

export const STUDIO_TOOLS = Object.freeze(commands.map(([name, description, properties, consequential, readOnly]) => Object.freeze({
  name, description, inputSchema: fields({ ...scopeProperties, ...properties }),
  annotations: { readOnlyHint: Boolean(readOnly), consequentialHint: Boolean(consequential) },
})));

function parse(tool, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_action');
  const schema = tool.inputSchema;
  if (Object.keys(value).some(key => !(key in schema.properties)) || schema.required.some(key => !(key in value))) throw Error('invalid_action');
  for (const [key, spec] of Object.entries(schema.properties)) {
    const item = value[key];
    if (spec.type === 'string' && (typeof item !== 'string' || item.length > spec.maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item) || /sk-[^\s]+/i.test(item))) throw Error('invalid_action');
    if (spec.type === 'integer' && (!Number.isSafeInteger(item) || item < spec.minimum)) throw Error('invalid_action');
    if (spec.enum && !spec.enum.includes(item)) throw Error('invalid_action');
  }
  if (!uuid(value.projectId) || !uuid(value.requestId) || ('pieceId' in value && !uuid(value.pieceId))) throw Error('invalid_action');
  if ('title' in value && !value.title.trim()) throw Error('invalid_action');
  if ('prompt' in value && !value.prompt.trim()) throw Error('invalid_action');
  return value;
}

/** The same command handlers serve native WebMCP and the chat fallback. */
export function createStudioTools({ getScope, handlers, confirm = async () => false } = {}) {
  if (typeof getScope !== 'function' || !handlers || typeof confirm !== 'function') throw TypeError('invalid studio tools');
  const receipts = new Map();
  let busy = false, disposed = false;
  async function execute(name, input, { signal } = {}) {
    const tool = STUDIO_TOOLS.find(item => item.name === name);
    if (!tool || disposed || signal?.aborted) throw Error('action_unavailable');
    const args = parse(tool, input), scope = getScope();
    if (!uuid(scope?.userId) || !uuid(scope?.projectId) || scope.projectId !== args.projectId) throw Error('context_unavailable');
    const fingerprint = JSON.stringify([name, ...Object.keys(tool.inputSchema.properties).sort().map(key => [key, args[key]])]);
    const receiptKey = `${scope.userId}:${args.projectId}:${args.requestId}`;
    const previous = receipts.get(receiptKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw Error('action_conflict');
      return previous.result;
    }
    if (scope.revision !== args.revision) throw Error('context_changed');
    if (busy) throw Error('action_in_progress');
    const handler = handlers[name];
    if (typeof handler !== 'function') throw Error('action_unavailable');
    busy = true;
    try {
      if (tool.annotations.consequentialHint && await confirm({ name, args }) !== true) {
        const result = { status: 'declined' };
        receipts.set(receiptKey, { fingerprint, result });
        return result;
      }
      const latest = getScope();
      if (disposed || signal?.aborted || latest?.userId !== scope.userId || latest?.projectId !== scope.projectId || latest?.revision !== args.revision) throw Error('context_changed');
      receipts.set(receiptKey, { fingerprint, result: { status: 'unknown' } });
      const result = await handler(args, { signal });
      if (!result || !['completed', 'pending_confirmation', 'unknown'].includes(result.status)) throw Error('invalid_action_result');
      receipts.set(receiptKey, { fingerprint, result });
      if (receipts.size > 200) receipts.delete(receipts.keys().next().value);
      return result;
    } finally { busy = false; }
  }
  function dispose() { disposed = true; receipts.clear(); }
  async function register(modelContext) {
    if (!modelContext || typeof modelContext.registerTool !== 'function') return { native: false, dispose() {} };
    const controller = new AbortController();
    try {
      for (const definition of STUDIO_TOOLS) await modelContext.registerTool({ ...definition, execute: (args, context) => execute(definition.name, args, context) }, { signal: controller.signal });
    } catch { controller.abort(); return { native: false, dispose() {} }; }
    return { native: true, dispose: () => controller.abort() };
  }
  return { execute, register, dispose, definitions: STUDIO_TOOLS };
}
