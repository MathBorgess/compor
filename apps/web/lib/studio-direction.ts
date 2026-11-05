import { directionSchema, type CreativeDirection, type CreativeCriterion, type CreativeDecision } from './studio-domain.ts';
export type { CreativeDirection, CreativeCriterion, CreativeDecision } from './studio-domain.ts';
export const DIRECTION_LIMITS = Object.freeze({ criteria: 16, decisions: 100, bytes: 14_000 });
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown, fields: string[]) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const text = (value: unknown, limit: number, required = false) => typeof value === 'string' && value.length <= limit && (!required || value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|sk-[^\s]+/i.test(value);
function invalid(): never { throw new Error('invalid_creative_direction'); }
const exampleValid = (value: CreativeCriterion["example"]) => object(value, ['description', 'referenceId']) && text(value.description, 500, true) && (value.referenceId === null || uuid(value.referenceId));
const iso = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function parseDirection(input: unknown = { criteria: [], decisions: [] }): CreativeDirection {
  const shape = directionSchema.safeParse(input);
  if (!shape.success) invalid();
  const value = shape.data;
  if (!object(value, ['criteria', 'decisions']) || !Array.isArray(value.criteria) || !Array.isArray(value.decisions) || value.criteria.length > DIRECTION_LIMITS.criteria || value.decisions.length > DIRECTION_LIMITS.decisions) invalid();
  const ids = new Set();
  for (const criterion of value.criteria) {
    if (!object(criterion, ['id', 'viewpoint', 'dimension', 'statement', 'example', 'counterexample', 'provenance', 'source', 'tension']) || !uuid(criterion.id) || ids.has(criterion.id) || !['creator', 'recipient'].includes(criterion.viewpoint) || !['visual', 'message'].includes(criterion.dimension) || !text(criterion.statement, 600, true) || !exampleValid(criterion.example) || !exampleValid(criterion.counterexample) || !['hypothesis', 'creator_report', 'buyer_report', 'public_source'].includes(criterion.provenance) || !text(criterion.source, 1000) || !text(criterion.tension, 600)) invalid();
    if (criterion.provenance === 'public_source') {
      let url;
      try { url = new URL(criterion.source); } catch { invalid(); }
      if (url.protocol !== 'https:' || url.username || url.password) invalid();
    }
    ids.add(criterion.id);
  }
  const decisions = new Set();
  for (const decision of value.decisions) {
    if (!object(decision, ['id', 'criterionId', 'choice', 'reason', 'at']) || !uuid(decision.id) || decisions.has(decision.id) || !ids.has(decision.criterionId) || !['accept', 'reject', 'reopen'].includes(decision.choice) || !text(decision.reason, 1000) || !iso(decision.at)) invalid();
    decisions.add(decision.id);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > DIRECTION_LIMITS.bytes) throw new Error('creative_direction_limit');
  return structuredClone(value);
}

export function proposeCriterion(direction: CreativeDirection, criterion: CreativeCriterion) {
  const next = parseDirection(direction);
  const previous = next.criteria.find(item => item.id === criterion.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(criterion)) throw new Error('creative_criterion_conflict');
    return next;
  }
  next.criteria.push(criterion);
  return parseDirection(next);
}

export function decideCriterion(direction: CreativeDirection, decision: CreativeDecision) {
  const next = parseDirection(direction);
  const previous = next.decisions.find(item => item.id === decision.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(decision)) throw new Error('creative_decision_conflict');
    return next;
  }
  next.decisions.push(decision);
  return parseDirection(next);
}

export function criterionChoice(direction: CreativeDirection, criterionId: string) {
  return direction.decisions.findLast(item => item.criterionId === criterionId)?.choice ?? 'reopen';
}

export function directionForAgent(direction: CreativeDirection) {
  const parsed = parseDirection(direction);
  return parsed.criteria.map(criterion => ({ ...criterion, creatorDecision: criterionChoice(parsed, criterion.id), decisionReason: parsed.decisions.findLast(item => item.criterionId === criterion.id)?.reason ?? '' }));
}
