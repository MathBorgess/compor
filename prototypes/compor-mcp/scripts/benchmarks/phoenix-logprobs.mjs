/** Real API microbenchmark over synthetic metadata; no human quality or statistical guarantee. */
import { writeFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { PhoenixDecisionApiService } from '../../dist/phoenix_engine/services/decision_api.js';
import { createPhoenixHyperparams } from '../../dist/phoenix_engine/config/hyperparams.js';
import { compute_phoenix_multi_action_score } from '../../dist/phoenix_engine/math/formulas.js';

const destination = process.argv[2];
if (!destination) throw new Error('Provide output JSON path');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
const client = new OpenAI({ maxRetries: 0, timeout: 45000 });
const originalCreate = client.responses.create.bind(client.responses);
const usageById = new Map();
client.responses.create = async (...args) => {
  const result = await originalCreate(...args);
  const text = String(args[0]?.input?.[1]?.content ?? '');
  const id = text.match(/ID: (case-\d+|warmup)/)?.[1];
  if (id) usageById.set(id, { model: result.model, usage: result.usage ?? null });
  return result;
};
const hp = createPhoenixHyperparams();
const service = new PhoenixDecisionApiService({ hp, openaiClient: client });
const user_taste = {user_id:'synthetic-bench',preferred_boards_by_goal:{},visual_dna_rules:['Hierarquia legível e composição editorial'],negative_constraints:[],updated_at:'2026-10-29T00:00:00Z'};
const base = {user_id:'synthetic-bench',briefing:'Carrossel editorial fictício para curso de criatividade, com leitura clara e tom acolhedor.',user_taste,session_events_log:'Sem histórico observado.',user_tower_vec:[1,0]};
const descriptions = [
  'Composição editorial em duas colunas, título forte e margens amplas, com hierarquia clara.',
  'Texto pequeno em muitos blocos, brilho excessivo e fundo com elementos concorrentes.',
  'Tipografia expressiva, amplo espaço em branco e estrutura assimétrica de leitura.',
  'Cards modulares com subtítulos curtos, destaque para dados e chamada discreta.',
  'Títulos sobre foto colorida com contraste baixo e muitos selos decorativos.',
  'Diagrama em etapas com numeração visível, cores sóbrias e navegação consistente.',
];
function candidate(id, description) { return {candidate_id:id,board:'synthetic/board',metadata_sid:['editorial','grid'],visual_description:description,preview_url:'synthetic:preview',origin_url:'synthetic:origin',staging_path:'not-staged',candidate_vec:[1,0]}; }
async function runPair(id, description, warmup = false) {
  const c = candidate(id, description);
  const baselineStart = performance.now();
  const baseline = service.rankSingleCandidateIsolated({...base,candidate:c,source:'openai_api'})
    .then(actions => ({status:'scored',score:compute_phoenix_multi_action_score(actions,hp,1)}))
    .catch(() => ({status:'error',score:null}))
    .then(result => ({...result,latency_ms:Math.round(performance.now()-baselineStart),...usageById.get(id)}));
  const fast = service.rankSingleCandidateLogprobs({user_id:base.user_id,briefing:base.briefing,user_taste,session_events_log:base.session_events_log,user_tower_cosine_similarity:1,candidate:c,model:'gpt-4.1-mini'});
  const [multi_action,logprobs] = await Promise.all([baseline,fast]);
  return { id, warmup, multi_action, logprobs };
}
const warmup = await runPair('warmup',descriptions[0],true);
// Real Phoenix ranks its pool in parallel. Each arm processes the same six fixtures concurrently.
const started = performance.now();
const rows = await Promise.all(descriptions.map((d,i)=>runPair(`case-${i+1}`,d)));
const batch_ms = Math.round(performance.now()-started);
const sorted = xs => [...xs].sort((a,b)=>a-b);
const quantile = (xs,q) => { if (!xs.length) return null; const s=sorted(xs); const i=(s.length-1)*q, lo=Math.floor(i), hi=Math.ceil(i); return Math.round(s[lo] + (s[hi]-s[lo])*(i-lo)); };
const summarise = (key) => { const items=rows.map(row=>row[key]); const usable=items.filter(x=>x.status==='scored'); const times=items.map(x=>x.latency_ms); return {requested:items.length,scored:usable.length,abstained:items.filter(x=>x.status==='abstained').length,errors:items.filter(x=>x.status==='error').length,latency_median_ms:quantile(times,.5),latency_p95_ms:quantile(times,.95),latency_ms:times}; };
const report = {date:'2026-10-29',purpose:'synthetic_metadata_microbenchmark_not_creative_validation',method:{samples:6,warmup_per_arm:1,concurrent_per_arm:6,models:{multi_action:'gpt-6-luna',logprobs:'gpt-4.1-mini'},description:'Same synthetic candidates and context; distinct models, endpoints, prompts and output semantics; six paired trials in one concurrent batch. Usage is per call. Latencies include network and server time; this is not a statistically robust benchmark.'},warmup,batch_ms,summary:{multi_action:summarise('multi_action'),logprobs:summarise('logprobs')},cases:rows};
await writeFile(destination, JSON.stringify(report,null,2)+'\n', {mode:0o600});
console.log(JSON.stringify({batch_ms,summary:report.summary,warmup_status:{multi_action:warmup.multi_action.status,logprobs:warmup.logprobs.status}}));
