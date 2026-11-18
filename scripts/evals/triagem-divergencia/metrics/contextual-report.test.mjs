import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {cases,packet} from '../dataset/packets.mjs';
import {openLedger,digest} from '../runner/ledger.mjs';
import {contextualPixels} from '../runner/contextual-pixels.mjs';
import {buildContextualReport,receiptSlot} from './contextual-report.mjs';
import {rateCard} from './report.mjs';

const save = (file,value) => writeFileSync(file,JSON.stringify(value));
const run = (module,args) => execFileSync(process.execPath,[fileURLToPath(new URL(module,import.meta.url)),...args],{stdio:'pipe'});
const forbidden = () => {throw Error('unexpected call');};
function temporary(t) {
  const root=mkdtempSync(join(tmpdir(),'j2-metrics-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
test('the supplemental report reconciles rejected plans; a pending view, old spend, or altered J1 review cannot establish a J2 verdict',async t=>{
  const root=temporary(t), dir=join(root,'round-0'), view=join(root,'j2-pixels','round-0');
  run('../runner/round.mjs',['init',root,'60']);
  const db=openLedger(join(root,'receipts.sqlite'),JSON.parse(readFileSync(join(root,'protocol.json'))));
  try {
    const judgments={version:1,cases:[]};
    for (const c of cases) {
      const arms={};
      for (const arm of ['with','without']) {
        const p=packet(c.id,arm), f=join(dir,c.id,arm), id=[0,c.id,arm,'plan'].join('/');
        mkdirSync(f,{recursive:true});
        db.reserve(id,'plan',{context:p.context,visualInput:p.visualInput,instructions:null});
        db.update(id,'rejected',{http:422});
        save(join(f,'plan.json'),{state:'rejected',plan:null});
        save(join(f,'review.json'),{decision:'hold',reason:'plan_unavailable'});
        save(join(f,'triage-judgment.json'),{available:false,references:[]});
        arms[arm]={slots:[1,2,3].map(position=>({position,sha256:null,usable:null}))};
      }
      save(join(dir,c.id,'ablation.json'),{state:'not-submitted',reason:'plan_unavailable'});
      judgments.cases.push({caseId:c.id,split:c.split,arms});
    }
    mkdirSync(join(dir,'pixels')); save(join(dir,'pixels','judgments.json'),judgments);
    run('../plan-judge/contextual-round.mjs',[root,'0']);
    await contextualPixels(root,0,{mode:'dispatch',getKey:forbidden,fetchApi:forbidden});
    const prior='0/dev-feira/with/1';
    db.reserve(prior,'image',{}); db.update(prior,'complete',{});
  } finally {db.close();}
  let report=buildContextualReport(root,0);
  assert.equal(report.quota.image.reservedAcrossTrial,1);
  assert.equal(report.accounting.j2.imageCostUsd,0);
  assert.equal(report.aggregate.all.arms.with.notSubmitted,9);
  assert.equal(report.trials[0].gates.with.j2,'hold');
  assert.deepEqual(Object.keys(report.aggregate.bySplit),['dev']);
  assert.throws(()=>buildContextualReport(root,0,{includeHoldout:true}),/ENOENT/);
  rmSync(join(view,'dev-feira','ablation.json'));
  report=buildContextualReport(root,0);
  assert.equal(report.trials[0].state,'pending');
  assert.equal(report.accounting.j2.imageCostUsd,null);
  assert.equal(report.aggregate.all.arms.with.unknown,3);
  save(join(view,'dev-feira','ablation.json'),{state:'not-submitted',reason:'identical_after_triage'});
  assert.throws(()=>buildContextualReport(root,0),/identical_after_triage/);
  save(join(dir,'dev-concerto','with','review.json'),{decision:'admit'});
  rmSync(join(view,'dev-feira','ablation.json'));
  assert.throws(()=>buildContextualReport(root,0),/Expected values/);
});

test('one SHA, one receipt and truthful J1/J2 attribution per slot; the subtracted optional attribute is still judged',t=>{
  const root=temporary(t), source=join(root,'j1'), dir=join(root,'j2'), png=Buffer.from('synthetic fixture');
  mkdirSync(source);mkdirSync(dir);writeFileSync(join(dir,'art-1.png'),png);
  const id='0/dev-feira/without/1', sha256=digest(png), art={sha256,bytes:png.length,referenceIds:['first'],delivered:[{id:'first',sha256}],
    model:rateCard.model,usage:{input_tokens:2,output_tokens:1,total_tokens:3,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens_details:{image_tokens:1}}};
  const row={id,dir,source,position:1,record:{id,origin:'j2',sha256},receipt:{kind:'image',state:'complete',result:art},exported:art,
    attributeIds:['first','optional'],pixel:{usable:true,sha256,attributes:[{refId:'first',score:2},{refId:'optional',score:null}]}};
  assert.equal(receiptSlot(row).attribution.estimatedImageUsd,43/1e6);
  assert.equal(receiptSlot(row).slot.fidelity.optional,null);
  writeFileSync(join(source,'art-1.png'),png);
  assert.throws(()=>receiptSlot(row),/wrong image attribution/);
  row.record.origin='j1';
  assert.throws(()=>receiptSlot(row),/J1 judgment cannot corroborate/);
  row.j1Pixel={position:1,sha256};
  save(join(source,'images.json'),[art]);
  assert.equal(receiptSlot(row).attribution.origin,'j1');
  row.pixel.attributes.pop();
  assert.throws(()=>receiptSlot(row),/missing attribute/);
  writeFileSync(join(dir,'art-1.png'),Buffer.from('another'));
  assert.throws(()=>receiptSlot(row),/Expected values|PNG differs/);
});
