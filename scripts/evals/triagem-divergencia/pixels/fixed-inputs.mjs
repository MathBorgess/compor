// Read-only reconciliation of the one-prompt control before showing any image to the blind judge.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {cases,packet} from '../dataset/packets.mjs';
import {verifyFixedAdmission} from '../fixed-control/guard.mjs';
import {estimateImageCost} from '../metrics/index.mjs';
import {rateCard} from '../metrics/report.mjs';
import {digest} from '../runner/ledger.mjs';

const arms=['with','without'];
const read=file=>JSON.parse(readFileSync(file));
export function collectFixedInputs(root) {
  const round=join(root,'fixed-control','round-0'), db=new DatabaseSync(join(root,'receipts.sqlite'),{readOnly:true});
  try {
    db.exec('BEGIN');
    const table=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fixed_control_calls'").get();
    const calls=table?db.prepare('SELECT id,kind,state,result FROM fixed_control_calls').all():[];
    assert.ok(calls.length<=10);
    const originals=db.prepare("SELECT COUNT(*) AS n FROM calls WHERE kind='image'").get().n;
    const protocol=read(join(root,'protocol.json'));
    assert.ok(originals+calls.length<=protocol.images);
    const recorded=new Map(calls.map(row=>[row.id,row]));
    for (const row of calls) {
      const [r,c,arm,p,...extra]=row.id.split('/');
      assert.ok(r==='0' && cases.some(item=>item.id===c) && arms.includes(arm) && p==='1' && !extra.length && row.kind==='image');
    }
    const observations=[];
    for (const c of cases) {
      const folder=join(round,c.id), file=join(folder,'ablation.json'), proof=read(file);
      const guard=verifyFixedAdmission(root,c.id), full=packet(c.id,'with');
      assert.equal(proof.origin,'dataset-fixed-control');
      const observed={caseId:c.id,split:c.split,optionalId:full.rubric.optionalId,ablation:proof.state,
        reason:proof.reason??null,controlSubject:guard.subject,proofSha256:digest(readFileSync(file)),arms:{}};
      const accepted=guard.decision==='admit', selected=guard.plan?.referenceIds??[];
      if (accepted) {
        assert.equal(proof.state,'complete');
        assert.equal(proof.planSource,'R0-with-selection');assert.equal(proof.controlSubject,guard.subject);
        assert.equal(proof.optional,full.rubric.optionalId);assert.ok(selected.includes(proof.optional));
        assert.deepEqual(proof.prompts,[digest(guard.plan.items[0].prompt)]);
        const required=full.visualInput.entries.filter(e=>selected.includes(e.id)).map(e=>({id:e.id,sha256:e.transport.sha256}));
        assert.deepEqual(proof.inputs.with,required);
        assert.deepEqual(proof.inputs.without,required.filter(e=>e.id!==proof.optional));
      } else {assert.equal(proof.state,'not-submitted');assert.equal(proof.reason,guard.reason);}
      const settings=new Set();
      for (const arm of arms) {
        const id=[0,c.id,arm,1].join('/'), row=recorded.get(id), out=join(folder,arm);
        const file=join(out,'art-1.png'), receiptFile=join(out,'image.json');
        if (!accepted) {
          assert.ok(!row && !existsSync(file) && !existsSync(receiptFile),'held control has unaccounted pixels');
          observed.arms[arm]={position:1,state:'not-submitted',reason:proof.reason,sha256:null,path:null,estimatedUsd:0};
          continue;
        }
        if (row?.state!=='complete') {
          assert.ok(!existsSync(receiptFile),'saved image receipt conflicts with the journal');
          observed.arms[arm]={position:1,state:'unknown',reason:'missing_completed_receipt',sha256:null,path:null,estimatedUsd:null};
          continue;
        }
        const art=JSON.parse(row.result);
        if (existsSync(receiptFile)) assert.deepEqual(read(receiptFile),art,'image export differs from original fixed-control ledger');
        assert.deepEqual(art.delivered,proof.inputs[arm]);
        assert.deepEqual(art.referenceIds,art.delivered.map(ref=>ref.id));
        assert.equal(art.promptHash,proof.prompts[0]);
        assert.equal(art.model,rateCard.model);assert.match(art.settingsSha256,/^[a-f0-9]{64}$/);settings.add(art.settingsSha256);
        const confirmed={position:1,id,expectedSha256:art.sha256,promptSha256:art.promptHash,model:art.model,
          estimatedUsd:estimateImageCost(art.usage,rateCard,art.model)};
        if (!existsSync(file) || !existsSync(receiptFile)) {
          observed.arms[arm]={...confirmed,state:'missing',reason:'missing_file_or_exported_receipt',sha256:null,path:null};
          continue;
        }
        const png=readFileSync(file);
        assert.equal(digest(png),art.sha256);assert.equal(png.length,art.bytes);
        observed.arms[arm]={...confirmed,state:'observed',sha256:art.sha256,path:join(c.id,arm,'art-1.png'),
          receiptSha256:digest(readFileSync(receiptFile))};
      }
      assert.ok(settings.size<=1,'different generation settings in pair');
      observations.push(observed);
    }
    return {version:1,origin:'dataset-fixed-control',rateCard,cases:observations,
      quota:{maxImages:protocol.images,originalReserved:originals,fixedReserved:calls.length}};
  } finally {db.close();}
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length,3,'Usage: node fixed-inputs.mjs <original root>');
  console.log(JSON.stringify(collectFixedInputs(resolve(process.argv[2]))));
}
