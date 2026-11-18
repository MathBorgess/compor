import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cases, packet} from '../dataset/packets.mjs';
import {assessContextualDivergence, buildContextualDivergenceReview} from './contextual.mjs';
import {hash, labelRows, read, runGroup, seed} from './group.mjs';

const arms = ['with', 'without'];
const dependencies = ['contextual.mjs', 'contextual-round.mjs', 'group.mjs', '../planner/candidate.mjs',
  '../dataset/packets.mjs','../dataset/freeze.json', '../../../../packages/agents-api/src/exploration-plan-contract.mjs',
  '../../../../packages/agents-api/src/visual-input.mjs', '../../../../packages/agents-api/src/visual-input-contract.mjs'];
const sources = () => Object.fromEntries(dependencies.map(path => [path, hash(readFileSync(new URL(path, import.meta.url)))]));
function keep(path, value) {
  const json = JSON.stringify(value, null, 2) + '\n';
  try {writeFileSync(path, json, {flag:'wx', mode:0o600});}
  catch (error) {
    if (error.code !== 'EEXIST' || readFileSync(path,'utf8') !== json) throw error;
  }
}
function source(roundDir, id, arm) {
  const record = read(join(roundDir, id, arm, 'plan.json'));
  const {context, visualInput} = packet(id, arm);
  const plan = record.plan ?? null;
  const panel = plan && buildContextualDivergenceReview(context, plan, visualInput);
  return {id, context, visualInput, plan, panel};
}
function reviewGroup(roundDir, arm, prepare) {
  const target = join(roundDir, 'j2');
  const privateDir = join(target, 'panel-private', arm);
  const key = seed(privateDir);
  keep(join(privateDir, 'sources.json'), sources());
  const rows = labelRows(cases.map(c => source(roundDir, c.id, arm)), key);
  const packets = rows.map(row => row.panel).filter(Boolean);
  keep(join(privateDir, 'labels.json'), Object.fromEntries(rows.map(row => [row.id, row.alias])));
  let results = new Map();
  if (packets.length) {
    const schema = structuredClone(packets[0].schema);
    schema.properties.subject.enum = packets.map(panel => panel.subject);
    results = runGroup({dir: privateDir, cards: rows.map(row => ({alias:row.alias, data:row.panel?.input ?? null})),
      schema, instructions: packets[0].instructions, prepare});
  }
  if (prepare) return;
  const receipt = packets.length ? read(join(privateDir, 'receipt.json')) : null;
  for (const row of rows) {
    const critique = results.get(row.alias) ?? null;
    const verdict = row.plan ? assessContextualDivergence(row.context, row.plan, row.visualInput, critique)
      : {decision:'hold', reason:'plan_unavailable'};
    const dir = join(target, row.id, arm);
    mkdirSync(dir, {recursive:true, mode:0o700});
    keep(join(dir, 'j2-review.json'), {version:'j2', ...verdict, subject:row.panel?.subject ?? null,
      basicSubject:row.panel?.basicSubject ?? null, manifestDigest:row.panel?.manifestDigest ?? null,
      critique, alias:row.alias, packetSha256:receipt?.packetSha256 ?? null, thread:receipt?.thread ?? null});
  }
}

// Read only. Re-establish the external answer, group, alias, sources and actual dispatch subject.
export function verifyContextualRoundReview(root, round, caseId, arm) {
  if (!arms.includes(arm) || !cases.some(c => c.id === caseId) || !Number.isInteger(round) || round < 0 || round > 5) {
    throw Error('invalid_contextual_request');
  }
  const roundDir = join(resolve(root), 'round-'+round);
  const dir = join(roundDir, 'j2', 'panel-private', arm);
  const stored = read(join(roundDir, 'j2', caseId, arm, 'j2-review.json'));
  const {context, visualInput, plan, panel} = source(roundDir, caseId, arm);
  if (JSON.stringify(read(join(dir,'sources.json'))) !== JSON.stringify(sources())) throw Error('contextual_judge_sources_changed');
  if (!plan && stored.version === 'j2' && stored.decision === 'hold' && stored.subject === null) return {decision:'hold', reason:'plan_unavailable'};
  if (!panel || stored.version !== 'j2' || stored.subject !== panel.subject || stored.basicSubject !== panel.basicSubject ||
      stored.manifestDigest !== panel.manifestDigest) throw Error('contextual_review_subject_changed');
  const receipt = read(join(dir, 'receipt.json'));
  const blind = join(dir, 'blind');
  const packetSha256 = hash(JSON.stringify([receipt.model, receipt.effort, readFileSync(join(blind,'prompt.txt'),'utf8'),
    read(join(blind,'schema.json')), []]));
  const answer = readFileSync(join(dir,'answer.json'));
  const key = readFileSync(join(dir,'seed.txt'),'utf8').trim();
  const alias = labelRows(cases.map(c => ({id:c.id})), key).find(row => row.id === caseId).alias;
  const assessment = JSON.parse(answer).cases.find(row => row.case === alias)?.assessment;
  if (hash(answer) !== receipt.answerSha256 || !assessment || stored.alias !== alias || stored.packetSha256 !== packetSha256 ||
      receipt.packetSha256 !== packetSha256 || stored.thread !== receipt.thread ||
      JSON.stringify(assessment) !== JSON.stringify(stored.critique)) throw Error('contextual_judge_receipt_changed');
  const verdict = assessContextualDivergence(context, plan, visualInput, assessment);
  if (verdict.decision !== stored.decision || verdict.reason !== stored.reason) throw Error('contextual_judge_decision_changed');
  return verdict;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [root, round, ...options] = process.argv.slice(2);
  if (!root || !/^[0-5]$/.test(round) || options.some(option => !['--prepare', ...arms].includes(option))) {
    throw Error('Uso: node contextual-round.mjs DIR R [--prepare] [with|without]');
  }
  const selected = options.filter(opt => arms.includes(opt));
  for (const arm of selected.length ? selected : arms) reviewGroup(join(resolve(root), 'round-'+round), arm, options.includes('--prepare'));
}
