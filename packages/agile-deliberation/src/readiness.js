import { z } from 'zod';

const text = z.string().optional().default('');
const criterion = z.object({
  id: z.string(),
  viewpoint: z.enum(['creator', 'recipient']),
  statement: text,
  tension: text,
  example: z.object({ referenceId: z.string().nullable().optional() }).optional(),
  counterexample: z.object({ referenceId: z.string().nullable().optional() }).optional(),
});
const inputSchema = z.object({
  brief: z.object({ offer: text, audience: text, action: text, direction: text }).optional().prefault({}),
  persona: z.object({ audience: text, situation: text, need: text }).optional().prefault({}),
  direction: z.object({
    criteria: z.array(criterion).optional().default([]),
    decisions: z.array(z.object({
      criterionId: z.string(),
      choice: z.enum(['accept', 'reject', 'reopen']),
      reason: text,
    })).optional().default([]),
  }).optional().prefault({}),
  references: z.array(z.object({ id: z.string() })).optional().default([]),
  referenceFeedback: z.array(z.object({ referenceId: z.string(), text: z.string() })).optional().default([]),
  explicitRequest: z.boolean().optional().default(false),
});

const hasText = (value) => value.trim().length > 0;

/** Evaluate only supplied evidence. Reference feedback must be an explicit human statement. */
export function assessReadiness(input) {
  const { brief, persona, direction, references, referenceFeedback, explicitRequest } = inputSchema.parse(input);
  const decisions = new Map(direction.decisions.map((decision) => [decision.criterionId, decision]));
  const acceptedCriteria = direction.criteria.filter((item) => decisions.get(item.id)?.choice === 'accept');
  const creatorDecision = direction.criteria.some((item) => {
    const decision = decisions.get(item.id);
    return item.viewpoint === 'creator' && hasText(item.statement) &&
      (decision?.choice === 'accept' || (decision?.choice === 'reject' && hasText(decision.reason)));
  });
  const recipientCriterion = direction.criteria.some((item) => item.viewpoint === 'recipient' && hasText(item.statement));
  const selected = new Set(references.map((reference) => reference.id));
  const explained = new Set(referenceFeedback.filter((item) => hasText(item.text) && selected.has(item.referenceId)).map((item) => item.referenceId));
  for (const item of acceptedCriteria) {
    for (const id of [item.example?.referenceId, item.counterexample?.referenceId]) {
      if (id && selected.has(id)) explained.add(id);
    }
  }
  const unresolvedTension = direction.criteria.some((item) => {
    const decision = decisions.get(item.id);
    return hasText(item.tension) && (!decision || decision.choice === 'reopen');
  });
  const evidence = {
    offer: hasText(brief.offer) ? 'registered' : 'missing',
    action: hasText(brief.action) ? 'registered' : 'missing',
    creatorPerspective: creatorDecision ? 'decided' : hasText(brief.direction) ? 'registered' : 'missing',
    recipientPerspective: [brief.audience, persona.audience, persona.situation, persona.need].some(hasText) || recipientCriterion ? 'hypothesis' : 'missing',
    referenceMeaning: selected.size === 0 ? 'not_applicable' : explained.size === selected.size ? 'discussed' : 'unknown',
    unresolvedTension,
  };
  const gaps = [];
  if (evidence.offer === 'missing') gaps.push('offer');
  if (evidence.action === 'missing') gaps.push('action');
  if (evidence.creatorPerspective === 'missing') gaps.push('creator_perspective');
  if (evidence.recipientPerspective === 'missing') gaps.push('recipient_perspective');
  if (evidence.referenceMeaning === 'unknown') gaps.push('reference_meaning');
  if (unresolvedTension) gaps.push('unresolved_tension');

  const level = evidence.offer === 'missing' ||
    (evidence.creatorPerspective === 'missing' && evidence.recipientPerspective === 'missing')
    ? 'low' : gaps.length === 0 ? 'high' : 'medium';
  const next = explicitRequest ? 'proceed_with_assumptions' :
    level === 'low' ? 'ask' : level === 'medium' ? 'offer_alternatives' : 'propose_piece';
  return {
    level,
    next,
    evidence,
    gaps,
    limitations: ['heuristic_not_statistically_calibrated', 'recipient_perspective_is_not_verified'],
  };
}
