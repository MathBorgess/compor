/** Paid experiment on synthetic metadata only; compares bounded concurrency, not creative quality. */
import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { scoreCandidatesWithDecisions } from '../../dist/phoenix_engine/services/decision_score_ranker.js';

const [output] = process.argv.slice(2);
if (!output || !process.env.OPENAI_API_KEY) throw new Error('Provide a new output path and an authorized host key');
const api = new OpenAI({ maxRetries: 0, timeout: 45000 });
const candidates = Array.from({ length: 16 }, (_, i) => ({
  candidate_id: `synthetic_${i + 1}`,
  board: `synthetic_board_${i % 4}`,
  metadata_sid: ['synthetic_editorial'],
  visual_description: `Referência fictícia ${i + 1}: organização editorial e hierarquia tipográfica com variação ${i % 5}.`,
}));
const base = { client: api, briefing: 'Curso fictício sobre organizar ideias em reuniões. Peça sóbria, clara, direta e sem promessa comercial.', profileContext: 'Sem perfil pessoal. Dados artificiais usados somente para medir chamadas.', consentModel: true, consentImages: false, cacheKey: 'synthetic-concurrency-comparison', batchSize: 8 };
async function run(mode, repetition) {
  const start = performance.now();
  const results = mode === 'sequential'
    ? [await scoreCandidatesWithDecisions({ ...base, candidates })]
    : await Promise.all([0, 8].map(i => scoreCandidatesWithDecisions({ ...base, candidates: candidates.slice(i, i + 8) })));
  const all = results.flatMap(r => r.candidates);
  return { mode, repetition, latency_ms: Math.round(performance.now() - start), requested: all.length, scored: all.filter(x => x.status === 'scored').length, unscored: all.filter(x => x.status !== 'scored').map(x => ({ id: x.candidate_id, reason: x.reason })), models: results.map(r => r.model), requests: results.flatMap(r => r.requests) };
}
const observations = [];
for (let i = 0; i < 4; i++) {
  // Alternate order to reduce simple first-run bias; results are still a small descriptive sample.
  for (const mode of i % 2 ? ['parallel', 'sequential'] : ['sequential', 'parallel']) observations.push(await run(mode, i + 1));
}
await writeFile(output, JSON.stringify({ date: new Date().toISOString(), synthetic_only: true, image_inputs: false, samples_per_arm: 4, concurrency: { sequential: 1, parallel: 2 }, observations }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(observations.map(({ mode, repetition, latency_ms, requested, scored }) => ({ mode, repetition, latency_ms, requested, scored }))));
