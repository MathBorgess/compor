import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {visualInputDigest} from '../../../../packages/agents-api/src/visual-input.mjs';
import {assessDivergence, buildDivergenceReview} from '../planner/candidate.mjs';
import {hash} from './group.mjs';

export function buildContextualDivergenceReview(context, plan, visualInput) {
  if (visualInput?.version !== 2 || !validateCompletedExplorationPlan(plan, context, visualInput)) {
    throw Error('contextual_plan_manifest_mismatch');
  }
  const basic = buildDivergenceReview(context, plan);
  const manifestDigest = visualInputDigest(visualInput);
  const subject = hash(['compor-contextual-divergence-j2', basic.subject, manifestDigest].join('\0'));
  const selection = {
    catalogoCompletoDeArquivosSelecionadosPelaPessoa: visualInput.entries.map(entry => ({
      id: entry.id, ordem: entry.ordinal, origem: entry.inputOrigin,
    })),
    idsDessesArquivosRetidosPeloPlanejadorParaAsTresImagens: [...plan.referenceIds],
  };
  const schema = structuredClone(basic.schema);
  schema.properties.subject.enum = [subject];
  return {subject, basicSubject: basic.subject, manifestDigest, instructions: basic.instructions, schema,
    input: {...basic.input, subject, selection}};
}

// Only the subject representation changes. Every J1 semantic and citation check still runs.
export function assessContextualDivergence(context, plan, visualInput, critique) {
  const review = buildContextualDivergenceReview(context, plan, visualInput);
  if (critique?.subject !== review.subject) return {decision: 'hold', reason: 'unverified_contextual_subject'};
  const decision = assessDivergence(context, plan, {...critique, subject: review.basicSubject});
  return {...decision, subject: review.subject};
}
