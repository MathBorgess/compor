import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLedger, digest, fingerprint} from '../runner/ledger.mjs';
import {getCorpusHash} from '../runner/round.mjs';
import {cases, packet} from '../dataset/packets.mjs';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {buildDivergenceReview} from '../planner/candidate.mjs';
import {buildReport, rateCard} from './report.mjs';

const save = (file,data) => writeFileSync(file,JSON.stringify(data));
function trial(t) {
  const root=mkdtempSync(join(tmpdir(),'compor-metrics-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const protocol={version:1,plans:60,images:60,caseIds:cases.map(c=>c.id),corpus:getCorpusHash(),pixelRounds:[0,5]};
  save(join(root,'protocol.json'),protocol);
  const r=join(root,'round-0');mkdirSync(r);
  save(join(r,'revision.json'),{round:0,corpus:protocol.corpus});
  return {root,r,db:openLedger(join(root,'receipts.sqlite'),protocol)};
}

test('an untouched ledger preserves missing results, shows zero reserved and keeps holdout hidden',t=>{
  const {root,db}=trial(t);db.close();
  const r=buildReport(root,0);
  assert.equal(r.quota.image.reservedAcrossTrial,0);
  assert.equal(r.aggregate.all.arms.with.unknown,9);
  assert.equal(r.aggregate.all.arms.with.imageCostUsd,null);
  assert.deepEqual(Object.keys(r.aggregate.bySplit),['dev']);
  assert.throws(()=>buildReport(root,0,{includeHoldout:true}),/ENOENT/);
});

test('a complete twin image lot is reconciled across frozen prompts, SQLite, PNG hashes and blind judgments',t=>{
  const {root,r,db}=trial(t), id='dev-feira', p=packet(id,'with');
  const ctl=JSON.parse(readFileSync(new URL('../dataset/contrasts.json',import.meta.url))).find(c=>c.caseId===id&&c.expected==='accept');
  const plan=validateExplorationPlan({version:2,referenceIds:p.visualInput.entries.map(i=>i.id),items:ctl.items},p.context,p.visualInput);
  assert.ok(plan);
  const fullDir=join(r,id,'with');mkdirSync(fullDir,{recursive:true});
  const planId='0/'+id+'/with/plan';
  db.reserve(planId,'plan',{});
  db.update(planId,'complete',{plan});
  save(join(fullDir,'plan.json'),{state:'complete',plan});
  const subject=buildDivergenceReview(p.context,plan).subject, pairIds=[[1,2],[1,3],[2,3]];
  const critique={subject,
    slots:plan.items.map(row=>({position:row.position,direction:'preserved',evidence:row.creativePrompt,reason:'fixture'})),
    pairs:pairIds.map(([left,right])=>({left,right,contrast:'distinct',structure:'distinct',leftEvidence:plan.items[left-1].creativePrompt,
      rightEvidence:plan.items[right-1].creativePrompt,choice:'fixture'}))};
  save(join(fullDir,'review.json'),{decision:'admit',subject,critique});
  const inputs={}, judgments={caseId:id,split:'dev',arms:{}};
  const sample=Buffer.from(p.referenceImages[0].data,'base64');
  for (const arm of ['with','without']) {
    const dir=join(r,id,arm);mkdirSync(dir,{recursive:true});
    inputs[arm]=p.visualInput.entries.filter(ref=>arm==='with'||ref.id!==p.rubric.optionalId).map(ref=>({id:ref.id,sha256:ref.transport.sha256}));
    const arts=[],slots=[];
    for(const item of plan.items) {
      const pngId=['0',id,arm,item.position].join('/');
      const art={sha256:digest(sample),bytes:sample.length,promptHash:digest(item.prompt),settingsSha256:fingerprint({format:'fixture'}),
        delivered:inputs[arm],model:rateCard.model,usage:{input_tokens:2,output_tokens:2,total_tokens:4,
          input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens_details:{image_tokens:2}}};
      db.reserve(pngId,'image',{});
      db.update(pngId,'complete',art);
      arts.push(art);writeFileSync(join(dir,'art-'+item.position+'.png'),sample);
      slots.push({position:item.position,sha256:art.sha256,usable:true,attributes:p.rubric.references.map(ref=>({refId:ref.id,score:arm==='with'?2:1}))});
    }
    judgments.arms[arm]={slots,pairs:pairIds.map(positions=>({positions,score:2}))};
    save(join(dir,'images.json'),arts);
  }
  db.close();
  save(join(r,id,'ablation.json'),{state:'complete',source:'with',optional:p.rubric.optionalId,prompts:plan.items.map(i=>digest(i.prompt)),inputs});
  mkdirSync(join(r,'pixels'));save(join(r,'pixels','judgments.json'),{version:1,cases:[judgments]});
  const report=buildReport(root,0), measured=report.trials.find(c=>c.id===id);
  assert.equal(report.quota.image.reservedAcrossTrial,6);
  assert.ok(measured.inputVerification.every(s=>s.status==='verified'));
  assert.equal(measured.pixelPairs.with.bothUsableAndDistinct,3);
  assert.equal(report.bySplitNOriginArm['dev/2/external/with'].pixelPoints,6);
  assert.equal(report.aggregate.all.paired.cases.find(c=>c.caseId===id).fullCaseMeanDeltaPoints,1);
  const onlyCost=report.aggregate.byReferenceCount['2'].arms.with;
  assert.equal(onlyCost.knownImageCosts,3);
  assert.ok(Math.abs(onlyCost.imageUsdPerUsable-73e-6)<1e-12);
  assert.equal(onlyCost.totalUsdPerUsable,null);
  // Complete artifacts still require the original PNG and the exact plan.
  writeFileSync(join(fullDir,'art-1.png'),'changed');
  assert.throws(()=>buildReport(root,0),/PNG does not match/);
});

test('a held case can count an unsent slot as zero only with its plan and review, while a reserved unknown attempt retains uncertainty',t=>{
  const {root,r,db}=trial(t), folder=join(r,'dev-feira');
  mkdirSync(join(folder,'with'),{recursive:true});
  db.reserve('0/dev-feira/with/plan','plan',{});
  db.update('0/dev-feira/with/plan','invalid',{});
  db.reserve('0/dev-concerto/without/1','image',{});
  db.update('0/dev-concerto/without/1','unknown',{});
  db.close();
  save(join(folder,'with','plan.json'),{state:'invalid'});
  save(join(folder,'ablation.json'),{state:'not-submitted',reason:'plan_unavailable'});
  let report=buildReport(root,0);
  assert.equal(report.aggregate.all.arms.with.notSubmitted,3);
  assert.equal(report.aggregate.all.arms.without.unknown,6);
  assert.equal(report.quota.image.remaining,59);
  save(join(folder,'ablation.json'),{state:'not-submitted',reason:'identical_after_triage'});
  assert.throws(()=>buildReport(root,0),/without corroborating/);
});
