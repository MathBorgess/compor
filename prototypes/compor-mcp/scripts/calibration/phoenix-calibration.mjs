/** Synthetic, offline experiment, not a human evaluation. Run after npm run build. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPhoenixHyperparams } from '../../dist/phoenix_engine/config/hyperparams.js';
import { l2_normalize, cosine_similarity, compute_user_tower_embedding, compute_phoenix_multi_action_score, apply_sid_diversity_decay } from '../../dist/phoenix_engine/math/formulas.js';

export const PROTOCOL = Object.freeze({ version: 1, dimension: 32, candidates: 24, topK: 3,
  // Distinct session seeds in each split; seed lists, generator version and hashes are recorded.
  train: Array.from({length: 64}, (_, i) => 101 + i),
  validation: Array.from({length: 48}, (_, i) => 10001 + i),
  test: Array.from({length: 96}, (_, i) => 20001 + i),
  searchSeed: 331337, randomTrials: 96, finalists: 12, bootstrapSeed: 50021, bootstrapSamples: 2000 });
const sha = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const round = (x, digits = 6) => Number(x.toFixed(digits));
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const normal = r => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const randomVec = (r, n) => l2_normalize(Array.from({length:n}, () => normal(r)));
const noisyVec = (r, latent, correlation) => l2_normalize(latent.map(x => correlation * x + (1 - correlation) * normal(r) / Math.sqrt(latent.length)));
const clamp = x => Math.min(1, Math.max(0, x));

/** Labels are generated from independent latent utility, not candidate IDs, SIDs or predicted actions. */
export function session(seed) {
  const r = rng(seed), d = PROTOCOL.dimension, latent = randomVec(r,d);
  const query = noisyVec(r, latent, .45);
  const pos = Array.from({length:3}, () => noisyVec(r, latent, .55));
  const neg = Array.from({length:2}, () => noisyVec(r, latent.map(v => -v), .5));
  const longTerm = noisyVec(r, latent, .5);
  const candidates = Array.from({length: PROTOCOL.candidates}, (_, i) => {
    const vec = randomVec(r,d), quality = r();
    const preference = (cosine_similarity(latent, vec) + 1) / 2;
    // Distinct, unobserved synthetic target; quality and preference combine without identifying an index.
    const utility = .64 * preference + .36 * quality + normal(r) * .045;
    const predict = (x, noise = .20) => clamp(x + normal(r) * noise);
    const actions = {
      p_use_as_layout_grid: predict(.55 * quality + .45 * preference),
      p_use_as_typography_hook: predict(.7 * quality + .3 * preference),
      p_use_color_and_vibe: predict(.3 * quality + .7 * preference),
      p_high_conversion_clarity: predict(.6 * quality + .4 * preference),
      p_dwell_engagement: predict(.4 * quality + .6 * preference),
      p_reject_too_generic: predict(1 - quality),
      p_reject_style_mismatch: predict(1 - preference),
    };
    // SID groups assigned independently from labels; multiple candidates share groups.
    return { id:`s${seed}-c${i}`, vec, metadata_sid:['format', `family-${Math.floor(r()*6)}`], actions, utility };
  });
  const byUtility = [...candidates].sort((a,b) => b.utility-a.utility);
  const grades = new Map(byUtility.map((c, idx) => [c.id, idx < 2 ? 3 : idx < 6 ? 2 : idx < 12 ? 1 : 0]));
  return {seed, query, pos, neg, longTerm, candidates: candidates.map(c => ({...c, grade:grades.get(c.id)}))};
}
const dcg = list => list.slice(0, PROTOCOL.topK).reduce((acc,c,i) => acc + (2 ** c.grade - 1) / Math.log2(i+2),0);
export function evaluateOne(s, hp) {
  const tower = compute_user_tower_embedding(s.query, s.pos, s.neg, s.longTerm, hp);
  const pool = s.candidates.map(c => ({ ...c, cos: round(cosine_similarity(tower,c.vec),4) }))
    .sort((a,b) => b.cos-a.cos).slice(0, Math.max(hp.top_n_results * 2, 12));
  const scored = pool.map(c => ({ ...c, raw_score: round(compute_phoenix_multi_action_score(c.actions,hp,c.cos),4) }));
  const ranked = apply_sid_diversity_decay(scored,hp).slice(0, PROTOCOL.topK);
  const ideal = dcg([...s.candidates].sort((a,b) => b.grade-a.grade));
  return { ndcg: ideal ? dcg(ranked)/ideal : 0, hit: ranked.some(c => c.grade === 3) ? 1 : 0,
    uniqueSids: new Set(ranked.map(c => c.metadata_sid.slice(0,hp.sid_prefix_depth).join('/'))).size / PROTOCOL.topK,
    recallGold: pool.filter(c=>c.grade===3).length / s.candidates.filter(c=>c.grade===3).length };
}
const mean = xs => xs.reduce((a,b)=>a+b,0)/xs.length;
export function evaluate(sessions, hp) {
  const perSession = sessions.map(s=>evaluateOne(s,hp));
  return { ndcg3: mean(perSession.map(x=>x.ndcg)), hit3: mean(perSession.map(x=>x.hit)), diversity3: mean(perSession.map(x=>x.uniqueSids)), recallGoldPool: mean(perSession.map(x=>x.recallGold)), perSession };
}
function proposed(r) {
  const f = (min,max)=>round(min + (max-min)*r(),4);
  return createPhoenixHyperparams({
    alpha_query_weight:f(.3,.8), beta_positive_session:f(.1,.6), gamma_negative_session:f(.1,.5), delta_long_term_taste:f(0,.4), ema_session_decay:f(.7,.95), sid_diversity_decay_factor:f(.5,.95),
    action_weights:{ p_use_as_layout_grid:f(5,20), p_use_as_typography_hook:f(5,20), p_use_color_and_vibe:f(4,16), p_high_conversion_clarity:f(10,25), p_dwell_engagement:f(2,8), p_reject_too_generic:f(-40,-10), p_reject_style_mismatch:f(-40,-10) },
  });
}
const withoutRows = x => ({ndcg3:round(x.ndcg3), hit3:round(x.hit3), diversity3:round(x.diversity3), recallGoldPool:round(x.recallGoldPool)});
function bootstrap(diffs) {
  const r = rng(PROTOCOL.bootstrapSeed), vals = [];
  for(let i=0;i<PROTOCOL.bootstrapSamples;i++) { let sum=0; for(let j=0;j<diffs.length;j++)sum+=diffs[Math.floor(r()*diffs.length)]; vals.push(sum/diffs.length); }
  vals.sort((a,b)=>a-b); return [round(vals[Math.floor(vals.length*.025)]),round(vals[Math.floor(vals.length*.975)])];
}
export function runStudy() {
  const splits = Object.fromEntries(['train','validation','test'].map(k => [k, PROTOCOL[k].map(session)]));
  const r = rng(PROTOCOL.searchSeed), params = [createPhoenixHyperparams(), ...Array.from({length:PROTOCOL.randomTrials},()=>proposed(r))];
  const trials = params.map((hp,index)=>({ index, hp, train:withoutRows(evaluate(splits.train,hp)) }));
  const finalists = [...trials].sort((a,b)=>b.train.ndcg3-a.train.ndcg3 || a.index-b.index).slice(0,PROTOCOL.finalists);
  for(const trial of finalists) trial.validation=withoutRows(evaluate(splits.validation,trial.hp));
  const winner = [...finalists].sort((a,b)=>b.validation.ndcg3-a.validation.ndcg3 || a.index-b.index)[0];
  const base = evaluate(splits.test,params[0]), candidate = evaluate(splits.test,winner.hp);
  const diffs = candidate.perSession.map((row,i)=>row.ndcg - base.perSession[i].ndcg);
  return { label:'synthetic_simulation_not_human_evaluation', protocol:PROTOCOL,
    hashes:{ train:sha(splits.train), validation:sha(splits.validation), test:sha(splits.test),
      formulas:sha(readFileSync(new URL('../../src/phoenix_engine/math/formulas.ts',import.meta.url),'utf8')),
      hyperparams:sha(readFileSync(new URL('../../src/phoenix_engine/config/hyperparams.ts',import.meta.url),'utf8')),
      compiledFormulas:sha(readFileSync(new URL('../../dist/phoenix_engine/math/formulas.js',import.meta.url),'utf8')),
      compiledHyperparams:sha(readFileSync(new URL('../../dist/phoenix_engine/config/hyperparams.js',import.meta.url),'utf8')),
      generator:sha(readFileSync(fileURLToPath(import.meta.url),'utf8')) },
    selection: { objective:'mean_ndcg@3', policy:'top 12 by train NDCG@3; select highest validation NDCG@3; lowest trial id breaks ties', winnerIndex:winner.index,
      baselineValidation: withoutRows(evaluate(splits.validation,params[0])) },
    trials, final:{ baseline:withoutRows(base), candidate:withoutRows(candidate), deltaNdcg3:round(mean(diffs)), pairedBootstrap95:bootstrap(diffs),
      pairedPerSession:PROTOCOL.test.map((seed,i)=>({seed, baseline:round(base.perSession[i].ndcg), candidate:round(candidate.perSession[i].ndcg)})) } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const output = process.argv[2]; if (!output) throw new Error('Provide output JSON path');
  const result = runStudy(); writeFileSync(output, JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({winner:result.selection.winnerIndex, final:result.final, hashes:result.hashes},null,2));
}
