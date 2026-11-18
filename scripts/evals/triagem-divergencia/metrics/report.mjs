import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { cases, packet } from '../dataset/packets.mjs';
import { getCorpusHash } from '../runner/round.mjs';
import { fingerprint, digest } from '../runner/ledger.mjs';
import { assessDivergence, buildDivergenceReview } from '../planner/candidate.mjs';
import { estimateImageCost, summarizeAblation, verifyPairedInputs } from './index.mjs';

export const rateCard = {
  currency: 'USD', version: 'openai-standard-2026-11-18', observedOn: '2026-11-18',
  endpoint: 'images', tier: 'standard', model: 'gpt-image-2.6-flare',
  source: 'https://developers.openai.com/api/docs/models/gpt-image-2.6-flare',
  usdPerMillion: { inputText: 5, inputImage: 8, outputImage: 30 },
  historicalScenario: 'OpenAI Standard 2026-11-04 as recorded by Compor; same three rates',
  isFinalBill: false,
};
const ARMS = ['with', 'without'];
const pos = [1, 2, 3];
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const optionalJson = path => existsSync(path) ? json(path) : null;

// A missing journal is evidence of absent receipts, not an assertion that nothing was bought.
function receipts(root, protocol) {
  const file = join(root, 'receipts.sqlite');
  if (!existsSync(file)) return null;
  const db = new DatabaseSync(file, {readOnly: true});
  try {
    db.exec('BEGIN');
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding, fingerprint(protocol), 'ledger/protocol mismatch');
    return new Map(db.prepare('SELECT id,kind,binding,state,result FROM calls').all()
      .map(row => [row.id, {...row, result:JSON.parse(row.result)}]));
  } finally { db.close(); }
}

function checkQuota(ledger, protocol, round) {
  const quota = {};
  for (const row of ledger?.values() ?? []) {
    const [r,caseId,arm,part,...extra]=row.id.split('/');
    assert.ok(!extra.length && /^[0-5]$/.test(r) && protocol.caseIds.includes(caseId) && ARMS.includes(arm), 'off-roster receipt');
    assert.ok(part==='plan' ? row.kind==='plan' : row.kind==='image' && ['1','2','3'].includes(part) && protocol.pixelRounds.includes(Number(r)),
      'unexpected call kind or unscheduled receipt');
  }
  for (const [kind, limit] of [['plan',protocol.plans],['image',protocol.images]]) {
    const rows = ledger && [...ledger.values()].filter(r => r.kind === kind);
    assert.ok(!rows || rows.length <= limit, 'scope allowance exceeded');
    quota[kind] = { limit, reservedAcrossTrial: rows?.length ?? null, remaining: rows ? limit - rows.length : null,
      reservedThisRound: rows?.filter(r => r.id.startsWith(round + '/')).length ?? null };
  }
  return quota;
}

function checkedPlan(dir, receipt, p) {
  const saved = optionalJson(join(dir, 'plan.json'));
  if (saved) {
    assert.ok(receipt && receipt.kind === 'plan', 'exported plan without the reserved plan receipt');
    for (const field of ['plan','referenceReadings','raw','sid','usage'])
      assert.deepEqual(saved[field] ?? null, receipt.result[field] ?? null, 'plan export changed: '+field);
    assert.equal(saved.state, receipt.state, 'plan state changed');
  }
  const plan = receipt?.result?.plan;
  const review = optionalJson(join(dir, 'review.json'));
  if (review?.decision === 'admit') {
    assert.ok(plan && review.critique, 'admission without plan and critique');
    assert.equal(buildDivergenceReview(p.context,plan).subject, review.subject, 'critique for another plan');
    assert.equal(assessDivergence(p.context,plan,review.critique).decision, 'admit', 'invalid admission');
  } else if (review) assert.equal(review.decision, 'hold', 'invalid review state');
  const triage = optionalJson(join(dir,'triage-judgment.json'));
  if (triage) {
    assert.equal(triage.available, Boolean(plan),'triage on a different outcome');
    assert.deepEqual(triage.references.map(ref=>ref.referenceId),plan ? p.visualInput.entries.map(e=>e.id) : [],'triage coverage');
    for (const ref of triage.references) {
      assert.ok(['intent','characteristic','use'].every(key=>[0,1,2,null].includes(ref[key])),'invalid triage score');
      assert.equal(ref.expected,p.rubric.references.find(r=>r.id===ref.referenceId).decision,'wrong triage criterion');
      assert.equal(ref.observed,plan.referenceIds.includes(ref.referenceId)?'keep':'omit','wrong triage selection');
      assert.equal(ref.correct,ref.expected===ref.observed,'inconsistent decision evaluation');
    }
  }
  return { state:receipt?.state ?? 'unobserved', plan, triage, review:review?.decision ?? null,
    usage:receipt?.result.usage ?? null, readings:receipt?.result.referenceReadings ?? [], hasExport:Boolean(saved),
    judgePairs:review?.critique?.pairs?.map(p=>({left:p.left,right:p.right,contrast:p.contrast,structure:p.structure})) ?? null,
    judgeDirections:review?.critique?.slots?.map(s=>({position:s.position,direction:s.direction})) ?? null };
}

function checkImage(dir, index, row, exported, pixel, ablation, plannedRound) {
  const slot = index + 1;
  if (exported) {
    assert.ok(row && row.kind === 'image' && row.state === 'complete', 'exported image without completed receipt');
    assert.deepEqual(exported, row.result, 'image export differs from receipt');
  }
  if (!plannedRound || ablation?.state === 'not-submitted') {
    assert.ok(!row && !exported && !pixel?.sha256 && pixel?.usable == null, 'unsent position contains paid or judged output');
    return {slot:{state:'not-submitted'}, input:null};
  }
  if (row?.state !== 'complete') {
    assert.ok(!pixel?.sha256 && pixel?.usable == null, 'judgment without completed image');
    return {slot:{state:'unknown'}, input:null};
  }
  const art = row.result, file = join(dir,'art-'+slot+'.png');
  const png = readFileSync(file);
  assert.equal(digest(png), art.sha256, 'saved PNG does not match provider receipt');
  assert.equal(png.length, art.bytes, 'image size differs from receipt');
  assert.ok(Array.isArray(art.delivered) && art.model === rateCard.model, 'missing model or dispatch receipt');
  if (pixel) {
    assert.equal(pixel.position, slot, 'pixel assessment out of order');
    assert.equal(pixel.sha256, art.sha256, 'pixel judgment is for a different PNG');
    assert.ok(pixel.usable === null || typeof pixel.usable === 'boolean', 'invalid usability verdict');
    assert.ok(Array.isArray(pixel.attributes) && new Set(pixel.attributes.map(a => a.refId)).size === pixel.attributes.length,
      'invalid or repeated attribute verdict');
  }
  const fidelity = Object.fromEntries((pixel?.attributes ?? []).map(a => [a.refId,a.score]));
  return { slot:{state:'complete', usable:pixel?.usable ?? null, fidelity,
      imageCostUsd:estimateImageCost(art.usage,rateCard,art.model)},
    input:{promptSha256:art.promptHash,settingsSha256:art.settingsSha256,delivered:art.delivered} };
}

function summarizeVisualPairs(verdicts, slots) {
  const result = {expected:3, judged:0, maximumDistinction:0, bothUsableAndDistinct:0};
  if (!verdicts) return result;
  assert.deepEqual(verdicts.map(p=>p.positions.join(',')).sort(),['1,2','1,3','2,3'],'pair coverage');
  for (const pair of verdicts) {
    if (pair.score==null) continue;
    assert.ok([0,1,2].includes(pair.score),'invalid pair score');
    const [a,b]=pair.positions.map(n=>slots[n-1]);
    assert.ok(a.state==='complete' && b.state==='complete','judged pair without both images');
    result.judged++;
    if (pair.score===2) {
      result.maximumDistinction++;
      if(a.usable===true && b.usable===true) result.bothUsableAndDistinct++;
    }
  }
  return result;
}

function byOrigin(table, key) {
  if (!table[key]) table[key] = { selectedReferences:0, evaluatedPlanDecisions:0, matchingKeepOrOmit:0,
    recordedReadings:0, observedPixelAttributes:0, expectedPixelAttributes:0, pixelPoints:0,
    judgedPlanAttributes:Object.fromEntries(['intent','characteristic','use'].map(key=>[key,{points:0,graded:0}])) };
  return table[key];
}

function countSource(table, item, arm, origins, plan, slots, scheduled) {
  for (const ref of origins) {
    const entry = byOrigin(table, [item.split,item.references.length,ref.origin,arm].join('/'));
    entry.withArmN=item.references.length;
    entry.selectedN=origins.filter(r=>r.present).length;
    if (ref.present) {
      entry.selectedReferences++;
      const grade=plan.triage?.references.find(r=>r.referenceId===ref.id);
      for (const key of ['intent','characteristic','use']) {
        if (grade?.[key]!=null) {
          entry.judgedPlanAttributes[key].points+=grade[key];
          entry.judgedPlanAttributes[key].graded++;
        }
      }
      if (plan.plan) {
        entry.evaluatedPlanDecisions++;
        if (plan.plan.referenceIds.includes(ref.id) === (ref.decision === 'keep')) entry.matchingKeepOrOmit++;
        if (plan.readings.some(r => r.referenceId === ref.id)) entry.recordedReadings++;
      }
    }
    if (!scheduled) continue;
    entry.expectedPixelAttributes += 3;
    for (const slot of slots) {
      const score = slot.fidelity?.[ref.id];
      if (score != null) {entry.observedPixelAttributes++; entry.pixelPoints += score;}
    }
  }
}

export function buildReport(root, round, {includeHoldout=false}={}) {
  assert.ok(Number.isInteger(round) && round >= 0 && round <= 5,'invalid round');
  const protocol = json(join(root,'protocol.json')), dir = join(root,'round-'+round);
  const revision = json(join(dir,'revision.json'));
  assert.equal(protocol.corpus,getCorpusHash(),'trial corpus changed');
  assert.equal(revision.round, round);
  assert.equal(revision.corpus,protocol.corpus,'revision corpus changed');
  assert.deepEqual(protocol.caseIds,cases.map(c=>c.id),'roster changed');
  if (includeHoldout) {
    const final = json(join(root,'round-5','revision.json'));
    assert.equal(final.round,5);
    assert.equal(final.corpus,protocol.corpus);
    assert.equal(final.parentFeedback,digest(readFileSync(join(root,'round-4','feedback-development.json'))),
      'holdout requires an immutable final candidate with pre-existing development feedback');
  }
  const ledger = receipts(root,protocol), quota = checkQuota(ledger,protocol,round);
  const scheduled = protocol.pixelRounds.includes(round);
  const judgments = optionalJson(join(dir,'pixels','judgments.json'));
  if (judgments) {
    assert.equal(judgments.version,1);
    assert.ok(Array.isArray(judgments.cases) && new Set(judgments.cases.map(c=>c.caseId)).size === judgments.cases.length);
    assert.ok(judgments.cases.every(c => cases.some(spec => spec.id === c.caseId && spec.split === c.split)), 'judgment outside roster');
  }
  const rows = [], specs = [], trials = [], sources = {};
  for (const item of cases.filter(c => includeHoldout || c.split === 'dev')) {
    const full = packet(item.id,'with'), optionalId = full.rubric.optionalId;
    const selection = full.visualInput.entries.map(e=>({id:e.id,inputOrigin:e.inputOrigin,sha256:e.transport.sha256}));
    const spec = { id:item.id, split:item.split, referenceCount:selection.length, attributeIds:selection.map(e=>e.id) };
    specs.push(spec);
    const folder = join(dir,item.id), ablation = optionalJson(join(folder,'ablation.json'));
    const judged = judgments?.cases.find(entry=>entry.caseId===item.id);
    const inputs = {}, plans = {};
    const trial = {id:item.id, split:item.split, referenceCount:selection.length,
      optionalOrigin:selection.find(e=>e.id===optionalId).inputOrigin, plans:{}, ablation:ablation?.state ?? 'unobserved',
      reason:ablation?.reason ?? null,pixelPairs:{}};
    for (const arm of ARMS) {
      const p=arm==='with'?full:packet(item.id,'without'), path=join(folder,arm), id=[round,item.id,arm].join('/');
      const plan=checkedPlan(path,ledger?.get(id+'/plan'),p);
      plans[arm]=plan;
      trial.plans[arm]={state:plan.state,review:plan.review,usage:plan.usage,hasExport:plan.hasExport,judgedPairs:plan.judgePairs,judgedDirections:plan.judgeDirections};
      const saved=optionalJson(join(path,'images.json'));
      if (saved) assert.ok(Array.isArray(saved)&&saved.length===3,'invalid image index');
      const pixels=judged?.arms?.[arm]?.slots;
      if (judged) assert.deepEqual(pixels?.map(s=>s.position),pos,'missing or duplicate judgment positions');
      const observed=pos.map((n,i)=>checkImage(path,i,ledger?.get(id+'/'+n),saved?.[i],pixels?.[i],ablation,scheduled));
      const slots=observed.map(o=>o.slot);
      trial.pixelPairs[arm] = scheduled ? summarizeVisualPairs(judged?.arms?.[arm]?.pairs,slots) : null;
      inputs[arm]=observed.map(o=>o.input);
      countSource(sources,item,arm,p.rubric.references,plan,slots,scheduled);
      // Aggregate token totals alone do not determine the price of the managed plan.
      rows.push({caseId:item.id,arm,slots,planCostUsd:null});
    }
    const verification=verifyPairedInputs(selection,optionalId,inputs.with,inputs.without);
    assert.ok(!verification.some(v=>v.status==='mismatch'),'observed paired inputs differ beyond the optional reference');
    if (ablation?.state==='complete') {
      assert.equal(ablation.optional,optionalId);
      assert.equal(ablation.source,'with');
      assert.equal(plans.with.review,'admit');
      assert.equal(plans.with.state,'complete');
      assert.deepEqual(ablation.prompts,plans.with.plan.items.map(i=>digest(i.prompt)));
      for(const arm of ARMS) {
        assert.deepEqual(ablation.prompts,inputs[arm].map(i=>i?.promptSha256));
        for(const input of inputs[arm]) assert.deepEqual(input?.delivered,ablation.inputs[arm], 'ablation and dispatch disagree');
      }
      assert.ok(verification.every(v=>v.status==='verified'),'completed ablation did not isolate its optional');
    } else if (ablation) {
      assert.equal(ablation.state,'not-submitted');
      const omit = plans.with.plan && !plans.with.plan.referenceIds.includes(optionalId);
      const corroborated = (ablation.reason==='held_before_dispatch' && plans.with.review==='hold') ||
        (ablation.reason==='identical_after_triage' && omit && plans.with.review==='admit') ||
        (ablation.reason==='plan_unavailable' && plans.with.hasExport && plans.with.state!=='complete');
      assert.ok(corroborated,'unsent ablation without corroborating plan/review');
    }
    trial.inputVerification=verification;
    trials.push(trial);
  }
  const aggregate=scheduled?summarizeAblation(specs,rows):null;
  const byOptionalOrigin={};
  if (scheduled) for (const origin of new Set(trials.map(t=>t.optionalOrigin))) {
    const ids=trials.filter(t=>t.optionalOrigin===origin).map(t=>t.id);
    byOptionalOrigin[origin]=summarizeAblation(specs.filter(s=>ids.includes(s.id)),rows.filter(r=>ids.includes(r.caseId))).all;
  }
  return { version:1, round, scope:includeHoldout?'all':'development', scheduledPixels:scheduled,
    corpus:protocol.corpus, quota, rateCard, billing:'estimated image tokens, managed-plan and invoice totals unknown',
    trials, bySplitNOriginArm:sources, byOptionalOrigin, aggregate };
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [root, r, ...flags]=process.argv.slice(2);
  if (!root||!r||!/^\d$/.test(r)||flags.some(f=>f!=='--include-holdout')) throw Error('Usage: report.mjs <root> <0..5> [--include-holdout]');
  console.log(JSON.stringify(buildReport(resolve(root),Number(r),{includeHoldout:flags.includes('--include-holdout')}),null,2));
}
