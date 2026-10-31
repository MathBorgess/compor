/** Small, paid compatibility probe using fictional metadata; no secrets are written. */
import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
const [path] = process.argv.slice(2);
if (!path || !process.env.OPENAI_API_KEY) throw new Error('Provide output path and an authorized host key');
const api = new OpenAI({ maxRetries: 0, timeout: 30000 });
const common = {
  model: 'gpt-6-luna', reasoning_effort: 'none', max_completion_tokens: 50,
  messages: [{ role: 'system', content: 'Classifique a referência fictícia em A, B, C ou D.' }, { role: 'user', content: 'Flores em aquarela para curso botânico introdutório.' }],
  logprobs: true, top_logprobs: 5,
};
const arms = [
  ['biased', { ...common, logit_bias: { 32: 10, 33: 10, 34: 10, 35: 10 } }],
  ['structured_enum', { ...common, response_format: { type: 'json_schema', json_schema: { name: 'avaliacao', strict: true, schema: { type: 'object', properties: { classificacao: { type: 'string', enum: ['A', 'B', 'C', 'D'] } }, required: ['classificacao'], additionalProperties: false } } } }],
];
const observations = [];
for (const [arm, request] of arms) {
  const started = performance.now();
  try {
    const r = await api.chat.completions.create(request);
    observations.push({ arm, status: 'ok', model: r.model, output: r.choices[0]?.message?.content ?? null, tokens: r.choices[0]?.logprobs?.content ?? null, usage: r.usage, latency_ms: Math.round(performance.now() - started) });
  } catch (e) {
    observations.push({ arm, status: 'error', http_status: e.status ?? null, param: e.param ?? null, latency_ms: Math.round(performance.now() - started) });
  }
}
await writeFile(path, JSON.stringify({ date: new Date().toISOString(), synthetic_only: true, observations }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify(observations.map(o => ({ arm: o.arm, status: o.status, http_status: o.http_status, param: o.param, output: o.output }))));
