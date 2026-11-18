// From apps/web: node --import tsx ../../scripts/evals/pr61/briefing/baseline.mjs
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createStudioState, updateBrief } from '../../../../apps/web/lib/studio-state.ts';
import { studioProjectIdea } from '../../../../apps/web/lib/studio-project-idea.ts';
import { parallelExplorationContext } from '../../../../apps/web/lib/parallel-exploration-context.ts';

const archives = new URL('../../../../prototypes/compor-mcp/evals/model-efficiency/', import.meta.url);
const projectId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const scenarios = [
  { name: 'mentoria', offer: 'Mentoria Trama de Aula, quatro encontros ao vivo e revisão de um plano de aula.', audience: 'Profissionais que dominam um assunto e querem organizar seu primeiro curso curto.' },
  { name: 'startup', offer: 'Volta de Pote, ferramenta para controlar empréstimos e devoluções de embalagens.', audience: 'Pequenos produtores de alimentos que precisam localizar recipientes retornáveis.' },
];

async function readArchive(path) {
  return JSON.parse(await readFile(new URL(path, archives), 'utf8'));
}

async function captureHandoff() {
  const rows = [];
  for (const { name, offer, audience } of scenarios) {
    const state = updateBrief(createStudioState({ userId, projectId, prepare: true }), { offer, audience });
    const idea = studioProjectIdea(state, '');
    const context = await parallelExplorationContext(state, projectId, 'references', idea,
      async () => Response.json({ signals: [] }));
    rows.push({ scenario: name, offerInPlan: context.offer === offer, audienceInPlan: context.audience === audience,
      projectIdeaAvailableForSearch: Boolean(idea), personaNeedEntered: Boolean(state.persona.need) });
  }
  return rows;
}

async function blindPacket() {
  const rows = [];
  for (const { name } of scenarios) {
    const sourceCase = await readArchive(`blind/round1-${name}/P01/package.json`);
    for (const model of ['astra', 'sol']) {
      const path = `runs/r1-${name}-${model}-E1/turn-01.json`;
      const turn = await readArchive(path);
      const text = turn.assistant_messages.at(-1);
      if (turn.exit_code !== 0 || turn.timed_out || !text?.trim()) throw Error(`Incomplete archive: ${path}`);
      const id = createHash('sha256').update(text).digest('hex').slice(0, 12);
      rows.push({ id, source: sourceCase.task[0].prompt, answer: text });
    }
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

if (process.argv.includes('--judge')) {
  console.log(JSON.stringify(await blindPacket(), null, 2));
} else {
  console.log(JSON.stringify({ evidence: 'web domain; feedback reads stubbed; no model call', cases: await captureHandoff() }, null, 2));
}
