import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {cases, packet} from '../dataset/packets.mjs';
import {verifyContextualRoundReview} from '../plan-judge/contextual-round.mjs';
import {digest, fingerprint} from '../runner/ledger.mjs';
import {getCorpusHash} from '../runner/round.mjs';
import {estimateImageCost, summarizeAblation, verifyPairedInputs} from './index.mjs';
import {rateCard} from './report.mjs';

const arms = ['with', 'without'];
const positions = [1, 2, 3];
const version = 'j2-pixels-v1';
const json = file => JSON.parse(readFileSync(file));
const sha = file => digest(readFileSync(file));
const readIfPresent = file => existsSync(file) ? json(file) : null;

function journal(root, protocol) {
  const db = new DatabaseSync(join(root, 'receipts.sqlite'), {readOnly:true});
  try {
    db.exec('BEGIN');
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding, fingerprint(protocol), 'unrelated ledger');
    const rows = db.prepare('SELECT id,kind,state,result FROM calls').all();
    const hasFixed = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fixed_control_calls'").get();
    const fixed = hasFixed ? db.prepare("SELECT COUNT(*) AS n FROM fixed_control_calls WHERE kind='image'").get().n : 0;
    assert.ok(fixed<=10, 'fixed control allowance exceeded');
    const quota = {};
    for (const [kind, limit] of [['plan', protocol.plans], ['image', protocol.images]]) {
      const original = rows.filter(row => row.kind === kind).length;
      const supplemental = kind==='image' ? fixed : 0;
      const reserved = original+supplemental;
      assert.ok(reserved <= limit, 'global allowance exceeded');
      quota[kind] = {limit, originalReserved:original, fixedControlReserved:supplemental, reservedAcrossTrial:reserved, remaining:limit - reserved};
    }
    return {quota, receipts:new Map(rows.map(row => [row.id, {...row, result:JSON.parse(row.result)}]))};
  } finally {db.close();}
}

function confirmPlan({root, round, caseId, arm, source, view, record, receipts}) {
  const orig = join(source, arm), out = join(view, arm);
  assert.equal(record.planId, [round, caseId, arm, 'plan'].join('/'));
  const receipt = receipts.get(record.planId);
  assert.equal(receipt?.kind, 'plan', 'original plan receipt missing');
  const contextual = join(root, 'round-'+round, 'j2', caseId, arm, 'j2-review.json');
  assert.equal(record.planSha256, sha(join(orig, 'plan.json')));
  assert.equal(record.planSha256, sha(join(out, 'plan.json')));
  assert.equal(record.j1ReviewSha256, sha(join(orig, 'review.json')));
  assert.equal(record.j2ReviewSha256, sha(contextual));
  assert.equal(record.j2ReviewSha256, sha(join(out, 'j2-review.json')));
  assert.equal(sha(join(orig, 'triage-judgment.json')), sha(join(out, 'triage-judgment.json')));
  const saved = json(join(orig, 'plan.json'));
  assert.equal(saved.state, receipt.state);
  for (const field of ['plan','referenceReadings','raw','sid','usage'])
    assert.deepEqual(saved[field] ?? null, receipt.result[field] ?? null, 'plan export differs from ledger: '+field);
  const checked = verifyContextualRoundReview(root, round, caseId, arm);
  assert.equal(record.decision, checked.decision);
  assert.equal(record.subject, json(contextual).subject);
  const triage=json(join(orig,'triage-judgment.json'));
  assert.equal(triage.available,Boolean(saved.plan));
  for (const ref of triage.references) assert.equal(ref.observed,saved.plan.referenceIds.includes(ref.referenceId)?'keep':'omit','triage attributed to another plan');
  return {saved, triage, judgments:{
    j1:json(join(orig,'review.json')).decision, j2:checked.decision, reason:checked.reason,
    subject:record.subject, j1Sha256:record.j1ReviewSha256, j2Sha256:record.j2ReviewSha256, planSha256:record.planSha256,
  }};
}

function checkedPixels(pixel, ids, sha256) {
  if (!pixel) return {usable:null, fidelity:{}};
  assert.equal(pixel.sha256, sha256 ?? null, 'judged another PNG');
  assert.ok(pixel.usable === null || (sha256 && typeof pixel.usable === 'boolean'));
  assert.deepEqual(pixel.attributes.map(a=>a.refId), ids, 'missing attribute, including subtracted optional');
  const fidelity = Object.fromEntries(pixel.attributes.map(({refId,score})=>{
    assert.ok(score === null || (sha256 && [0,1,2].includes(score)));
    return [refId,score];
  }));
  return {usable:pixel.usable,fidelity};
}

export function receiptSlot({dir, source, id, position, record, exported, receipt, pixel, attributeIds}) {
  assert.equal(record.id, id);
  assert.equal(receipt?.kind, 'image');
  assert.equal(receipt.state, 'complete');
  const art = receipt.result;
  assert.deepEqual(exported, art, 'image export differs from original ledger');
  const name = 'art-'+position+'.png', png = readFileSync(join(dir,name));
  assert.equal(png.length, art.bytes);
  assert.equal(digest(png), art.sha256, 'PNG differs from ledger');
  assert.equal(record.sha256, art.sha256);
  const orig = join(source,name);
  assert.equal(record.origin, existsSync(orig) ? 'j1' : 'j2', 'wrong image attribution');
  if (record.origin === 'j1') assert.equal(sha(orig), art.sha256, 'wrong reused PNG');
  assert.deepEqual(art.referenceIds, art.delivered.map(f=>f.id));
  assert.equal(art.model, rateCard.model);
  const cost = estimateImageCost(art.usage,rateCard,art.model);
  return {slot:{position,state:'complete',...checkedPixels(pixel,attributeIds,art.sha256),imageCostUsd:cost},
    input:{delivered:art.delivered,promptSha256:art.promptHash,settingsSha256:art.settingsSha256},
    attribution:{id,origin:record.origin,sha256:art.sha256,estimatedImageUsd:cost}};
}

function countSource(table, spec, arm, p, triage, slots) {
  const present = p.visualInput.entries.map(ref=>ref.id);
  if (triage) assert.deepEqual(triage.references.map(ref=>ref.referenceId), triage.available?present:[]);
  for (const ref of p.rubric.references) {
    const key = [spec.split,spec.referenceCount,ref.origin,arm].join('/');
    const entry = table[key] ??= {withArmN:spec.referenceCount,selectedN:present.length,selectedReferences:0,
      evaluatedPlanDecisions:0,matchingKeepOrOmit:0,expectedPixelAttributes:0,observedPixelAttributes:0,pixelPoints:0,
      judgedPlanAttributes:Object.fromEntries(['intent','characteristic','use'].map(k=>[k,{points:0,graded:0}]))};
    if (ref.present) entry.selectedReferences++;
    const grade = triage?.references.find(r=>r.referenceId===ref.id);
    if (grade) {
      assert.equal(grade.expected,ref.decision);
      assert.equal(grade.correct,grade.observed===grade.expected);
      entry.evaluatedPlanDecisions++;
      if (grade.correct) entry.matchingKeepOrOmit++;
      for (const [key,dimension] of Object.entries(entry.judgedPlanAttributes)) if (grade[key] != null) {
        assert.ok([0,1,2].includes(grade[key]));
        dimension.graded++; dimension.points+=grade[key];
      }
    }
    entry.expectedPixelAttributes+=3;
    for (const slot of slots) if (slot.fidelity?.[ref.id]!=null) {
      entry.observedPixelAttributes++; entry.pixelPoints+=slot.fidelity[ref.id];
    }
  }
}

function visualPairs(pairs, slots) {
  const result = {expected:3,judged:0,maximumDistinction:0,bothUsableAndDistinct:0};
  if (!pairs) return result;
  assert.deepEqual(pairs.map(p=>p.positions.join(',')).sort(), ['1,2','1,3','2,3']);
  for (const pair of pairs) if (pair.score!==null) {
    assert.ok([0,1,2].includes(pair.score) && pair.positions.every(i=>slots[i-1].state==='complete'));
    result.judged++;
    if (pair.score===2) {
      result.maximumDistinction++;
      if (pair.positions.every(i=>slots[i-1].usable===true)) result.bothUsableAndDistinct++;
    }
  }
  return result;
}

function scopeMetadata(root, round, includeHoldout) {
  assert.ok([0,5].includes(round));
  const original = join(root,'round-'+round), base = join(root,'j2-pixels'), view = join(base,'round-'+round);
  const protocolFile = join(root,'protocol.json'), protocol = json(protocolFile), policy = json(join(base,'policy.json'));
  assert.equal(protocol.corpus,getCorpusHash());
  assert.deepEqual(protocol.caseIds,cases.map(c=>c.id));
  assert.deepEqual(protocol.pixelRounds,[0,5]);
  const provenance = json(join(view,'j2-provenance.json'));
  assert.equal(policy.version,version); assert.equal(policy.gate,'with'); assert.deepEqual(policy.rounds,[0,5]);
  assert.deepEqual(provenance,{version,round,policySha256:sha(join(base,'policy.json')),protocolSha256:sha(protocolFile),
    j1JudgmentsSha256:sha(join(original,'pixels','judgments.json')),revisionSha256:sha(join(original,'revision.json')),caseIds:protocol.caseIds});
  assert.equal(policy.protocolSha256,provenance.protocolSha256);
  assert.equal(sha(join(base,'protocol.json')),provenance.protocolSha256);
  assert.equal(sha(join(view,'revision.json')),provenance.revisionSha256);
  const revision = json(join(original,'revision.json'));
  assert.equal(revision.round,round); assert.equal(revision.corpus,protocol.corpus);
  if (includeHoldout || round===5) {
    const final = json(join(root,'round-5','revision.json'));
    assert.equal(final.round,5); assert.equal(final.corpus,protocol.corpus);
    assert.equal(final.parentFeedback,sha(join(root,'round-4','feedback-development.json')),'final candidate must be locked');
  }
  return {protocol,original,view,provenance};
}

function confirmIntervention(proof, source, p, selection) {
  const optional = p.rubric.optionalId, plan = source.saved.plan, selected = plan?.referenceIds ?? [];
  const expectedReason = !plan ? 'plan_unavailable' : source.judgments.j2==='hold' ? 'held_before_dispatch' :
    !selected.includes(optional) ? 'identical_after_triage' : null;
  if (expectedReason) {
    assert.equal(proof.state,'not-submitted'); assert.equal(proof.reason,expectedReason);
    return;
  }
  assert.equal(proof.state,'complete'); assert.equal(proof.source,'with'); assert.equal(proof.optional,optional);
  assert.deepEqual(proof.prompts,plan.items.map(item=>digest(item.prompt)));
  const delivered = selection.filter(e=>selected.includes(e.id)).map(({id,sha256})=>({id,sha256}));
  assert.deepEqual(proof.inputs.with,delivered);
  assert.deepEqual(proof.inputs.without,delivered.filter(r=>r.id!==optional));
}

export function buildContextualReport(root, round, {includeHoldout=false}={}) {
  const {protocol,original,view,provenance} = scopeMetadata(root,round,includeHoldout);
  const {receipts,quota} = journal(root,protocol);
  const judgments = readIfPresent(join(view,'pixels','judgments.json'));
  if (judgments) {
    assert.equal(judgments.version,1);
    assert.deepEqual(judgments.cases.map(c=>c.caseId).sort(),[...protocol.caseIds].sort());
  }
  const specs=[], rows=[], trials=[], bySplitNOriginArm={}, accounting={};
  for (const item of cases.filter(c=>includeHoldout || c.split==='dev')) {
    const full = packet(item.id,'with'), optional = full.rubric.optionalId;
    const selection = full.visualInput.entries.map(e=>({id:e.id,inputOrigin:e.inputOrigin,sha256:e.transport.sha256}));
    const spec = {id:item.id,split:item.split,referenceCount:selection.length,attributeIds:selection.map(ref=>ref.id)};
    specs.push(spec);
    const folder = join(view,item.id), source = join(original,item.id);
    const meta = readIfPresent(join(folder,'j2-provenance.json')), proof = readIfPresent(join(folder,'ablation.json'));
    // The runner writes both files after all six slots. A partial view cannot prove a zero cost.
    const sealed = Boolean(meta && proof), plans={}, inputs={};
    const trial = {id:item.id,split:item.split,referenceCount:selection.length,optionalOrigin:selection.find(e=>e.id===optional).inputOrigin,
      state:sealed?proof.state:'pending',reason:sealed?(proof.reason??null):'case_view_incomplete',gates:{},images:[],pixelPairs:{}};
    const judged = judgments?.cases.find(c=>c.caseId===item.id);
    if (judged) {assert.equal(judged.split,item.split); assert.equal(judged.optionalId,optional);}
    if (sealed) {
      assert.equal(meta.version,version); assert.equal(meta.round,round); assert.equal(meta.caseId,item.id); assert.equal(meta.gate,'with');
      for (const arm of arms) {
        plans[arm] = confirmPlan({root,round,caseId:item.id,arm,source,view:folder,record:meta.arms[arm],receipts});
        trial.gates[arm] = plans[arm].judgments;
      }
      confirmIntervention(proof,plans.with,full,selection);
    }
    for (const arm of arms) {
      const out = join(folder,arm), pixels = judged?.arms[arm], state = sealed?proof.state:'unknown';
      if (judged) assert.deepEqual(pixels.slots.map(s=>s.position),positions);
      const complete = state==='complete', record = meta?.arms[arm], saved = sealed?readIfPresent(join(out,'images.json')):null;
      if (sealed) {assert.equal(record.slots.length,complete?3:0); assert.equal(saved?.length??0,complete?3:0);}
      const slots=[]; inputs[arm]=[];
      for (const position of positions) {
        const i=position-1, pixel=pixels?.slots[i], id=[round,item.id,arm,position].join('/');
        if (complete) {
          const observed=receiptSlot({dir:out,source:join(source,arm),id,position,record:record.slots[i],
            exported:saved[i],receipt:receipts.get(id),pixel,attributeIds:spec.attributeIds});
          assert.equal(observed.input.promptSha256,proof.prompts[i]);
          assert.deepEqual(observed.input.delivered,proof.inputs[arm]);
          slots.push(observed.slot); inputs[arm].push(observed.input); trial.images.push(observed.attribution);
        } else {
          slots.push({position,state,...checkedPixels(pixel,spec.attributeIds,null)}); inputs[arm].push(null);
          if (sealed) assert.ok(!existsSync(join(out,'art-'+position+'.png')),'suppressed J2 slot has a view image');
        }
      }
      trial.pixelPairs[arm]=visualPairs(pixels?.pairs,slots);
      countSource(bySplitNOriginArm,spec,arm,arm==='with'?full:packet(item.id,arm),plans[arm]?.triage,slots);
      rows.push({caseId:item.id,arm,slots,planCostUsd:null});
    }
    trial.inputVerification=verifyPairedInputs(selection,optional,inputs.with,inputs.without);
    if (trial.state==='complete') assert.ok(trial.inputVerification.every(i=>i.status==='verified'),'paired intervention changed');
    trials.push(trial);
  }
  for (const origin of ['j1','j2']) {
    const images=trials.flatMap(c=>c.images).filter(i=>i.origin===origin), priced=images.filter(i=>i.estimatedImageUsd!=null);
    const knownSubtotalUsd=priced.reduce((sum,i)=>sum+i.estimatedImageUsd,0);
    accounting[origin]={confirmedSlots:images.length,pricedSlots:priced.length,knownSubtotalUsd,
      imageCostUsd:priced.length===images.length && trials.every(c=>c.state!=='pending')?knownSubtotalUsd:null};
  }
  const byOptionalOrigin={};
  for (const origin of new Set(trials.map(c=>c.optionalOrigin))) {
    const ids=new Set(trials.filter(c=>c.optionalOrigin===origin).map(c=>c.id));
    byOptionalOrigin[origin]=summarizeAblation(specs.filter(s=>ids.has(s.id)),rows.filter(r=>ids.has(r.caseId))).all;
  }
  return {version,round,scope:includeHoldout?'all':'development',corpus:protocol.corpus,provenance,
    gate:'contextual J2 on the original with-plan',judgeScope:judgments?'paired pixels':'pixels not judged',
    accountingBasis:'J1 slots reused at zero incremental cost; J2 slots first acquired in this view. Aggregate image costs value all included slots at the frozen rates. Managed plan prices and invoice totals unknown.',
    rateCard,quota,accounting,trials,bySplitNOriginArm,byOptionalOrigin,aggregate:summarizeAblation(specs,rows)};
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [dir,r,...flags]=process.argv.slice(2);
  assert.ok(dir && /^(0|5)$/.test(r) && (!flags.length || (flags.length===1 && flags[0]==='--include-holdout')),
    'Usage: node contextual-report.mjs <original root> <0|5> [--include-holdout]');
  console.log(JSON.stringify(buildContextualReport(resolve(dir),Number(r),{includeHoldout:flags.length===1}),null,2));
}
