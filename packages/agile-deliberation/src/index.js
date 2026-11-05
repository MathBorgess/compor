import { z } from 'zod';
import { collectLeafSignals, criterionDefinition } from './definition.js';
import { methodology, methodologyInstructions } from './methodology.js';

const text = max => z.string().trim().max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value), 'Texto inválido.');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u);
const example = z.object({ description: text(500), referenceId: z.string().uuid().nullable().default(null) }).strict();
const signalShape = z.object({
  necessary: z.array(text(400).min(1)).max(8).default([]),
  positive: z.array(text(400).min(1)).max(8).default([]),
  negative: z.array(text(400).min(1)).max(8).default([]),
}).strict();
const signals = signalShape.default({ necessary: [], positive: [], negative: [] });

function publicSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

const criterionSchema = z.object({
  id, viewpoint: z.enum(['creator', 'recipient']), dimension: z.enum(['visual', 'message']),
  statement: text(600).min(1), signals,
  example: example.default({ description: '', referenceId: null }),
  counterexample: example.default({ description: '', referenceId: null }),
  borderline: example.nullable().default(null), ambiguity: text(600).default(''), tension: text(600).default(''),
  provenance: z.enum(['hypothesis', 'creator_report', 'buyer_report', 'public_source']).default('hypothesis'),
  source: text(1000).default(''),
}).strict().refine(value => value.provenance !== 'public_source' || publicSource(value.source), 'Fonte pública precisa de URL HTTPS.');

const decision = z.object({
  id, criterionId: id, choice: z.enum(['accept', 'reject', 'reopen']), reason: text(1000), at: z.string().datetime(),
}).strict();

const deliberationSchema = z.object({
  objective: text(500).min(1), criteria: z.array(criterionSchema).max(16).default([]),
  decisions: z.array(decision).max(100).default([]),
}).strict();

const refinementSchema = z.object({
  criterion: criterionSchema,
  clarification: text(1000).min(1),
  proposedStatement: text(600).min(1),
  proposedSignals: signalShape.optional(),
}).strict();

function bounded(schema, input) {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 48 * 1024) throw new Error('Contexto de deliberação excede 48 KiB.');
  return schema.parse(input);
}

export function prepareDeliberation(input) {
  const { objective, criteria, decisions } = bounded(deliberationSchema, input);
  const byId = new Map(criteria.map(criterion => [criterion.id, criterion]));
  if (byId.size !== criteria.length) throw new Error('Critérios precisam de identificadores distintos.');
  const decisionIds = new Set();
  const latest = new Map();
  for (const item of decisions) {
    if (decisionIds.has(item.id) || !byId.has(item.criterionId)) throw new Error('Histórico incompatível com os critérios.');
    decisionIds.add(item.id);
    latest.set(item.criterionId, item);
  }
  const definitions = criteria.map(criterion => {
    const definition = criterionDefinition(criterion);
    return { criterionId: criterion.id, definition, leafSignals: collectLeafSignals(definition) };
  });
  const focus = criteria.find(criterion => (criterion.ambiguity || criterion.tension)
    && !['accept', 'reject'].includes(latest.get(criterion.id)?.choice));
  const next = focus ? {
    criterionId: focus.id,
    stage: focus.example.description && focus.counterexample.description ? 'reflect' : 'scope',
    viewpoint: focus.viewpoint, dimension: focus.dimension,
    question: focus.tension
      ? `Há uma tensão nesta direção: ${focus.tension}. Qual caminho você prefere para este post, e por quê?`
      : `O que separa o exemplo do contraexemplo em “${focus.statement}”? ${focus.ambiguity}`,
    example: focus.example, counterexample: focus.counterexample, borderline: focus.borderline,
    needsExamples: !focus.example.description || !focus.counterexample.description,
    decisionOwner: 'creator',
  } : null;
  return {
    methodology, objective, status: next ? 'clarification_suggested' : 'no_open_ambiguity',
    criteria, definitions, reportedDecisions: decisions, next,
    coverage: ['creator', 'recipient'].flatMap(viewpoint => ['visual', 'message'].map(dimension => ({
      viewpoint, dimension, count: criteria.filter(c => c.viewpoint === viewpoint && c.dimension === dimension).length,
    }))),
    instructions: methodologyInstructions,
    persistsData: false, generationAuthorized: false, requiresClarificationBeforeGeneration: false,
    audienceEvidenceVerified: false,
  };
}

export function proposeRefinement(input) {
  const { criterion, clarification, proposedStatement, proposedSignals } = bounded(refinementSchema, input);
  const proposed = { ...criterion, statement: proposedStatement, signals: proposedSignals ?? criterion.signals };
  return {
    methodology, status: 'proposal', criterionId: criterion.id,
    before: criterion, proposed, reportedClarification: clarification,
    changes: ['statement', 'signals'].filter(key => JSON.stringify(criterion[key]) !== JSON.stringify(proposed[key])),
    definition: criterionDefinition(proposed),
    decisionOwner: 'creator', persistsData: false, accepted: false,
    instructions: 'Mostre a proposta e sua relação com o esclarecimento recebido. Registre a escolha explícita pelo cliente; esta ferramenta não confirma nem grava preferências. Ao aceitar, preserve o critério anterior e atribua outro identificador ao revisado.',
  };
}

export function registerDeliberationTools(server) {
  for (const [name, description, schema, execute] of [
    ['prepare_deliberation', 'Organiza critérios subjetivos e escolhe uma ambiguidade para esclarecer com exemplo e contraexemplo. Recebe somente o contexto autorizado desta conversa. Não classifica imagens, consulta fontes, confirma escolhas nem persiste dados.', deliberationSchema, prepareDeliberation],
    ['propose_criterion_refinement', 'Compara o critério anterior com uma revisão proposta após esclarecimento reportado da pessoa. Não deduz a escolha nem altera o histórico. A proposta continua pendente da pessoa criadora.', refinementSchema, proposeRefinement],
  ]) {
    server.registerTool(name, {
      description, inputSchema: schema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async input => {
      try {
        const result = execute(input);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch {
        return { isError: true, content: [{ type: 'text', text: 'Contexto de deliberação inválido ou excessivo. Confira os critérios, fontes e histórico.' }] };
      }
    });
  }
}
