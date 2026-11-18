import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases,packet} from '../dataset/packets.mjs';
import {digest,fingerprint} from '../runner/ledger.mjs';
import {imageSlot} from '../runner/provider.mjs';
import {getCorpusHash,keep,matchedInputs} from '../runner/round.mjs';
import {verifyFixedAdmission} from './guard.mjs';
import {openFixedLedger} from './ledger.mjs';

const arms=['with','without'],origin='dataset-fixed-control';
const read=file=>JSON.parse(readFileSync(file));
const inputHashes=images=>images.map(i=>({id:i.id,sha256:digest(Buffer.from(i.data,'base64'))}));
const forbidden=()=>{throw Error('unexpected_provider_call_during_reconciliation');};
function getLocalKey() {
  const value=process.platform==='darwin' && !process.env.COMPOR_EVAL_KEY_STDIN
    ?execFileSync('/usr/bin/pbpaste',{encoding:'utf8',maxBuffer:4096,stdio:['ignore','pipe','ignore']}).trim():readFileSync(0,'utf8').trim();
  if(!/^sk-[A-Za-z0-9_-]{20,300}$/.test(value))throw Error('credential_input_unavailable');
  return value;
}
function policyFor(root) {
  const original=read(join(root,'protocol.json'));
  assert.deepEqual(original.caseIds,cases.map(c=>c.id));
  assert.equal(original.corpus,getCorpusHash());assert.deepEqual(original.pixelRounds,[0,5]);
  assert.equal(original.plans,60);assert.equal(original.images,60);
  const sources=['images.mjs','guard.mjs','ledger.mjs','../runner/ledger.mjs','../runner/round.mjs','../runner/provider.mjs',
    '../runner/validate-png.py','../dataset/freeze.json','../dataset/packets.mjs','../../../../packages/images-api/src/index.mjs'];
  const hashes=Object.fromEntries(sources.map(f=>[f,digest(readFileSync(new URL(f,import.meta.url)))]));
  for(const f of ['runner/provider.mjs','runner/validate-png.py','dataset/freeze.json']) {
    assert.equal(original.sources['scripts/evals/triagem-divergencia/'+f],hashes['../'+f]);
  }
  assert.equal(original.sources['packages/images-api/src/index.mjs'],hashes['../../../../packages/images-api/src/index.mjs']);
  const policy={version:1,origin,round:0,position:1,plans:0,images:10,combinedImageLimit:60,cooldownMs:15000,
    original:fingerprint(original),guard:digest(readFileSync(join(root,'fixed-control-r0','protocol.json'))),sources:hashes};
  return {original,policy};
}
function select(caseId, admission) {
  assert.equal(admission.caseId,caseId);
  assert.equal(admission.origin,origin);assert.equal(admission.position,1);
  const p=packet(caseId,'with');
  assert.equal(admission.optionalId,p.rubric.optionalId);
  if(admission.decision==='hold') {
    assert.ok(typeof admission.reason==='string' && admission.reason.length && admission.plan===null);
    return {ablation:{state:'not-submitted',reason:admission.reason,origin}};
  }
  assert.equal(admission.decision,'admit');assert.match(admission.subject,/^[a-f0-9]{64}$/);
  assert.ok(typeof admission.thread==='string' && admission.thread.length);
  assert.ok(validateCompletedExplorationPlan(admission.plan,p.context,p.visualInput),'invalid fixed plan');
  const refs=matchedInputs(admission.plan,p);
  assert.ok(refs,'admitted without the managed optional input');
  const prompt=admission.plan.items[0].prompt,inputs=Object.fromEntries(arms.map(a=>[a,inputHashes(refs[a])]));
  assert.deepEqual(inputs.with.map(r=>r.id),admission.plan.referenceIds);
  assert.deepEqual(inputs.without,inputs.with.filter(r=>r.id!==p.rubric.optionalId));
  const ablation={state:'complete',origin,optional:p.rubric.optionalId,prompts:[digest(prompt)],inputs,controlSubject:admission.subject,planSource:'R0-with-selection'};
  return {prompt,refs,ablation,binding:fingerprint({caseId,ablation})};
}

// Exported for an offline real-provider-adapter fixture. The CLI always uses the bound independent guard.
export async function inspectPair(db,base,caseId,admission) {
  const selection=select(caseId,admission),folder=join(base,caseId);
  const slots=arms.map(arm=>({arm,id:'0/'+caseId+'/'+arm+'/1',dir:join(folder,arm),file:join(folder,arm,'art-1.png'),index:join(folder,arm,'image.json')}));
  const rows=slots.map(s=>db.get(s.id)),lot=db.getLot(caseId);
  const exported=join(folder,'ablation.json');
  if(existsSync(exported)) assert.deepEqual(read(exported),selection.ablation,'fixed intervention changed');
  const existingFiles=slots.some(s=>existsSync(s.file)||existsSync(s.index));
  if(!selection.refs) {
    assert.ok(!lot && !existingFiles && rows.every(r=>!r),'held fixed case already has receipts');
    return {...selection,caseId,folder,slots,submit:false};
  }
  if(rows.every(r=>!r)) {
    assert.ok(!lot && !existingFiles && !existsSync(exported),'orphan or interrupted fixed pair; cannot resubmit');
    return {...selection,caseId,folder,slots,submit:true};
  }
  assert.ok(lot?.binding===selection.binding && lot.ended_ms!==null && rows.every(r=>r?.state==='complete'),'partial_or_uncertain_fixed_pair_no_resubmit');
  for(const [i,s] of slots.entries()) {
    const row=await imageSlot({ledger:db,id:s.id,prompt:selection.prompt,images:selection.refs[s.arm],file:s.file,key:null,fetchApi:forbidden});
    assert.equal(row.result.bytes,readFileSync(s.file).length);
    assert.equal(row.result.promptHash,selection.ablation.prompts[0]);
    assert.deepEqual(row.result.delivered,selection.ablation.inputs[s.arm]);
    assert.deepEqual(row.result.referenceIds,selection.refs[s.arm].map(r=>r.id));
    if(existsSync(s.index))assert.deepEqual(read(s.index),rows[i].result);
  }
  return {...selection,caseId,folder,slots,submit:false};
}

export async function finishPair(db,pair,{getKey=getLocalKey,wait=delay,fetchApi=fetch}={}) {
  mkdirSync(pair.folder,{recursive:true,mode:0o700});
  if(pair.submit) {
    for(const s of pair.slots)mkdirSync(s.dir,{recursive:true,mode:0o700});
    const key=getKey();
    let ms;
    while((ms=db.admitPair(pair.caseId,pair.binding))>0)await wait(ms);
    const outcomes=await Promise.allSettled(pair.slots.map(s=>imageSlot({ledger:db,id:s.id,prompt:pair.prompt,images:pair.refs[s.arm],file:s.file,key,fetchApi})));
    if(outcomes.some(o=>o.status!=='fulfilled'||o.value.state!=='complete'))throw Error('incomplete_fixed_pair_no_resubmit '+pair.caseId);
  }
  if(pair.refs)for(const s of pair.slots)keep(s.index,db.get(s.id).result);
  keep(join(pair.folder,'ablation.json'),pair.ablation);
}

export async function fixedControlImages(root,mode,{getKey=getLocalKey,fetchApi=fetch}={}) {
  assert.ok(['prepare','dispatch'].includes(mode));
  const {original,policy}=policyFor(root);
  const sqlite=join(root,'receipts.sqlite'),base=join(root,'fixed-control','round-0'),policyFile=join(base,'dispatch-policy.json');
  if(existsSync(policyFile))assert.deepEqual(read(policyFile),policy,'fixed policy changed');
  const decisions=cases.map(c=>[c.id,verifyFixedAdmission(root,c.id)]);
  const db=openFixedLedger(sqlite,original,{readOnly:mode==='prepare'});
  try {
    db.requireIdle();
    const pairs=[];
    for(const [caseId,admission] of decisions)pairs.push(await inspectPair(db,base,caseId,admission));
    const counts=db.count(),fresh=pairs.filter(p=>p.submit).length*2;
    assert.ok(counts.fixed+fresh<=10 && counts.total+fresh<=60,'insufficient allowance for entire control');
    if(mode==='dispatch') {
      mkdirSync(base,{recursive:true,mode:0o700});keep(policyFile,policy);
      let key;
      for(const pair of pairs)await finishPair(db,pair,{getKey:()=>key??=getKey(),fetchApi});
    }
    return {origin,round:0,cases:cases.length,eligiblePairs:pairs.filter(p=>p.refs).length,freshImages:fresh,
      reusedImages:pairs.filter(p=>p.refs&&!p.submit).length*2,usageBefore:counts,usageAfter:db.count()};
  } finally {db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [root,flag,...extra]=process.argv.slice(2);
  assert.ok(root && ['--prepare','--dispatch'].includes(flag) && !extra.length,'Uso: images.mjs ROOT --prepare|--dispatch');
  console.log(JSON.stringify(await fixedControlImages(resolve(root),flag.slice(2))));
}
