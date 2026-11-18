import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {constants, copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {validateCompletedExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {cases, packet} from '../dataset/packets.mjs';
import {verifyContextualRoundReview} from '../plan-judge/contextual-round.mjs';
import {plannerInstructions} from '../planner/candidate.mjs';
import {digest, fingerprint, openLedger} from './ledger.mjs';
import {imageSlot} from './provider.mjs';
import {getCorpusHash, keep, matchedInputs} from './round.mjs';

const arms = ['with','without'];
const positions = [1,2,3];
const version = 'j2-pixels-v1';
const here = fileURLToPath(new URL('../',import.meta.url));
const repository = fileURLToPath(new URL('../../../../',import.meta.url));
const json = file => JSON.parse(readFileSync(file));
const hashFile = file => digest(readFileSync(file));
const directory = path => mkdirSync(path,{recursive:true,mode:0o700});
function copyExact(source, target) {
  if (!existsSync(target)) {
    try {copyFileSync(source,target,constants.COPYFILE_EXCL);}
    catch (error) {if (error.code !== 'EEXIST') throw error;}
  }
  assert.equal(hashFile(source),hashFile(target),'view conflicts with source');
}
function loadKey() {
  const value = process.platform === 'darwin' && !process.env.COMPOR_EVAL_KEY_STDIN
    ? execFileSync('/usr/bin/pbpaste',{encoding:'utf8',maxBuffer:4096,stdio:['ignore','pipe','ignore']}).trim()
    : readFileSync(0,'utf8').trim();
  if (!/^sk-[A-Za-z0-9_-]{20,300}$/.test(value)) throw Error('credential_input_unavailable');
  return value;
}

function freeze(root, round, view) {
  const protocolFile = join(root,'protocol.json'), protocol = json(protocolFile);
  assert.deepEqual(protocol.caseIds,cases.map(c=>c.id));
  assert.equal(protocol.corpus,getCorpusHash());
  assert.equal(protocol.images,60); assert.equal(protocol.plans,60);
  assert.deepEqual(protocol.pixelRounds,[0,5]);
  for (const [file,sha] of Object.entries(protocol.sources)) assert.equal(hashFile(join(repository,file)),sha,'frozen source changed '+file);
  const supplements = ['plan-judge/contextual.mjs','plan-judge/contextual-round.mjs','runner/contextual-pixels.mjs',
    'runner/round.mjs','runner/ledger.mjs','dataset/packets.mjs','pixels/gallery.py'];
  const sources = Object.fromEntries(supplements.map(file=>[file,hashFile(join(here,file))]));
  const policyPath = join(view,'policy.json');
  if (!existsSync(policyPath)) {
    assert.ok(round===0 && !existsSync(join(root,'round-5','revision.json')),'predeclare J2 before final candidate');
  }
  directory(view);
  keep(policyPath,{version,rounds:[0,5],gate:'with',otherArm:'same received with-plan; remove optional bytes only',
    charges:'one original SQLite ledger; existing slot identities and 60/60 cap',protocolSha256:hashFile(protocolFile),sources});
  copyExact(protocolFile,join(view,'protocol.json'));
  return {protocol,policySha256:hashFile(policyPath),protocolSha256:hashFile(protocolFile)};
}

function checkJ1Terminal(root, round, protocol) {
  const dir = join(root,'round-'+round), revisionFile = join(dir,'revision.json'), spec = json(revisionFile);
  assert.equal(spec.round,round); assert.equal(spec.corpus,protocol.corpus);
  if (round===0) {assert.equal(spec.revision,'');assert.equal(spec.parentFeedback,null);}
  else assert.equal(spec.parentFeedback,hashFile(join(root,'round-4','feedback-development.json')));
  const judgmentsPath = join(dir,'pixels','judgments.json'), judgments = json(judgmentsPath);
  assert.equal(judgments.version,1);
  assert.deepEqual(judgments.cases.map(c=>c.caseId).sort(),[...protocol.caseIds].sort(),'J1 judgment roster incomplete');
  for (const c of judgments.cases) {
    assert.equal(c.split,cases.find(s=>s.id===c.caseId).split);
    const sourceDir=join(dir,c.caseId), ablation=json(join(sourceDir,'ablation.json'));
    assert.ok(['not-submitted','complete'].includes(ablation.state),'J1 not terminal');
    for (const arm of arms) {
      const slots=c.arms[arm].slots;
      assert.deepEqual(slots.map(s=>s.position),positions);
      if(ablation.state==='complete'){
        const saved=json(join(sourceDir,arm,'images.json'));
        for(const [i,s] of slots.entries()) {
          assert.ok(/^[0-9a-f]{64}$/.test(s.sha256) && s.sha256===saved[i].sha256,'J1 completed without judged pixels');
          assert.equal(hashFile(join(sourceDir,arm,'art-'+s.position+'.png')),s.sha256);
        }
      } else for(const s of slots) assert.ok(s.sha256==null && s.usable==null,'J1 held with pixel judgment');
    }
  }
  return {spec,revisionFile,j1JudgmentsSha256:hashFile(judgmentsPath)};
}
function checkPlan({root,round,c,arm,db,spec}) {
  const sourceDir=join(root,'round-'+round,c.id,arm), planFile=join(sourceDir,'plan.json');
  const saved=json(planFile), p=packet(c.id,arm), planId=[round,c.id,arm,'plan'].join('/'), row=db.get(planId);
  assert.ok(row?.kind==='plan' && ['complete','invalid','rejected'].includes(row.state),'plan missing or pending');
  assert.equal(row.binding,fingerprint({context:p.context,visualInput:p.visualInput,instructions:round===0?null:plannerInstructions(spec.revision)}),'plan selection, URLs or instructions changed');
  assert.equal(row.state,saved.state);
  for(const field of ['plan','referenceReadings','raw','sid','usage']) assert.deepEqual(saved[field]??null,row.result[field]??null,'plan export changed '+field);
  const plan=saved.plan;
  if(row.state==='complete') assert.ok(validateCompletedExplorationPlan(plan,p.context,p.visualInput),'plan contract changed');
  else assert.equal(plan,null);
  const j1File=join(sourceDir,'review.json'),j2File=join(root,'round-'+round,'j2',c.id,arm,'j2-review.json');
  const verdict=verifyContextualRoundReview(root,round,c.id,arm),j2=json(j2File);
  assert.ok(['admit','hold'].includes(verdict.decision));
  assert.equal(j2.decision,verdict.decision);assert.equal(j2.reason,verdict.reason);
  if (!plan) assert.ok(j2.subject===null && j2.critique===null && j2.reason==='plan_unavailable','invalid J2 hold');
  return {plan,p,sourceDir,planFile,j2File,record:{planId,planSha256:hashFile(planFile),j1ReviewSha256:hashFile(j1File),
    j2ReviewSha256:hashFile(j2File),subject:j2.subject,decision:verdict.decision,slots:[]}};
}
function inputHashes(images) {return images.map(im=>({id:im.id,sha256:digest(Buffer.from(im.data,'base64'))}));}

// Validate every already-reserved slot before the first new purchase anywhere in the roster.
export async function inspectLot(db,{round,caseId,arm,sourceDir,target,items,images}) {
  const id=[round,caseId,arm].join('/'), ids=items.map(i=>id+'/'+i.position),rows=ids.map(i=>db.get(i));
  const original=items.map(i=>join(sourceDir,'art-'+i.position+'.png')), dest=items.map(i=>join(target,'art-'+i.position+'.png'));
  const expected=inputHashes(images);
  assert.deepEqual(items.map(i=>i.position),positions);
  if(rows.every(r=>!r)) {
    assert.ok(![...original,...dest,join(sourceDir,'images.json'),join(target,'images.json')].some(f=>existsSync(f)),'orphan image or receipt; cannot resubmit');
    return {id,ids,items,images,dest,sealed:null};
  }
  if(!rows.every(r=>r?.kind==='image' && r.state==='complete')) throw Error('partial_or_uncertain_lot_no_resubmit '+id);
  const originalIndex=join(sourceDir,'images.json');
  if(original.some(f=>existsSync(f))||existsSync(originalIndex)) {
    assert.ok(original.every(f=>existsSync(f)) && existsSync(originalIndex) &&
      json(join(sourceDir,'..','ablation.json')).state==='complete','J1 attribution requires its completed lot and all original PNGs');
    assert.deepEqual(json(originalIndex),rows.map(r=>r.result),'J1 image index disagrees with original ledger');
  }
  const sealed=[];
  for (const [i,row] of rows.entries()) {
    const file=existsSync(original[i])?original[i]:dest[i],origin=file===original[i]?'j1':'j2';
    assert.ok(existsSync(file),'paid_image_bytes_missing_no_resubmit '+ids[i]);
    if(existsSync(dest[i])) assert.equal(hashFile(dest[i]),row.result.sha256,'view image conflicts with receipt');
    await imageSlot({ledger:db,id:ids[i],prompt:items[i].prompt,images,file,key:null,fetchApi:()=>{throw Error('unexpected_existing_slot_dispatch');}});
    assert.equal(readFileSync(file).byteLength,row.result.bytes);
    assert.deepEqual(row.result.delivered,expected); assert.deepEqual(row.result.referenceIds,images.map(im=>im.id));
    assert.equal(row.result.promptHash,digest(items[i].prompt));
    const settings={model:'gpt-image-2.6-flare',size:'1024x1280',quality:'auto',output_format:'png',n:1};
    assert.equal(row.result.model,settings.model); assert.equal(row.result.settingsSha256,fingerprint(settings));
    sealed.push({id:ids[i],origin,sha256:row.result.sha256,file,result:row.result});
  }
  for (const index of [join(sourceDir,'images.json'),join(target,'images.json')]) {
    if(existsSync(index)) assert.deepEqual(json(index),rows.map(r=>r.result),'image receipt export changed');
  }
  return {id,ids,items,images,dest,sealed};
}

export async function finishLot(db,lot,{getKey=loadKey,wait=delay,fetchApi=fetch}={}) {
  if(lot.sealed) {
    for(const [i,slot] of lot.sealed.entries()) if(slot.file!==lot.dest[i]) copyExact(slot.file,lot.dest[i]);
    return lot.sealed.map(({file,...slot})=>slot);
  }
  const key=getKey();
  let cooldown;
  while ((cooldown=db.admitLot(lot.id,lot.ids))>0) await wait(cooldown);
  const results=await Promise.allSettled(lot.items.map((item,i)=>imageSlot({ledger:db,id:lot.ids[i],prompt:item.prompt,images:lot.images,file:lot.dest[i],key,fetchApi})));
  if(results.some(r=>r.status!=='fulfilled'||r.value.state!=='complete')) throw Error('incomplete_image_lot_no_resubmit '+lot.id);
  return results.map(({value},i)=>({id:lot.ids[i],origin:'j2',sha256:value.result.sha256,result:value.result}));
}

function journalCheck(file,protocol) {
  assert.ok(existsSync(file),'original SQLite ledger required');
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    assert.equal(db.prepare('SELECT binding FROM protocol WHERE id=1').get()?.binding,fingerprint(protocol));
    assert.ok(!db.prepare("SELECT id FROM calls WHERE kind='image' AND state!='complete' LIMIT 1").get(),'prior image uncertain; dispatch blocked');
    assert.ok(!db.prepare('SELECT id FROM lots WHERE ended_ms IS NULL LIMIT 1').get(),'prior lot unresolved; dispatch blocked');
    const counts=db.prepare('SELECT kind,count(*) AS n FROM calls GROUP BY kind').all();
    assert.ok(counts.every(c=>['plan','image'].includes(c.kind)&&c.n<=60),'global allowance changed');
    return counts.find(c=>c.kind==='image')?.n??0;
  } finally {db.close();}
}

export async function contextualPixels(root,round,{mode='prepare',getKey=loadKey,fetchApi=fetch}={}) {
  assert.ok([0,5].includes(round)&&['freeze','prepare','dispatch'].includes(mode));
  const view=join(root,'j2-pixels'), base=join(root,'round-'+round), target=join(view,'round-'+round);
  const {protocol,policySha256,protocolSha256}=freeze(root,round,view);
  if(mode==='freeze') return {version,round,policySha256};
  const {spec,revisionFile,j1JudgmentsSha256}=checkJ1Terminal(root,round,protocol);
  const journal=join(root,'receipts.sqlite'),used=journalCheck(journal,protocol),db=openLedger(journal,protocol);
  try {
    const roster=[];
    let freshImages=0;
    for(const c of cases) {
      const plans=Object.fromEntries(arms.map(arm=>[arm,checkPlan({root,round,c,arm,db,spec})]));
      const source=plans.with, inputs=source.record.decision==='admit'?matchedInputs(source.plan,source.p):null;
      const reason=!source.plan?'plan_unavailable':source.record.decision!=='admit'?'held_before_dispatch':!inputs?'identical_after_triage':null;
      const lots={};
      if(inputs) {
        for(const arm of arms) {
          lots[arm]=await inspectLot(db,{round,caseId:c.id,arm,sourceDir:plans[arm].sourceDir,target:join(target,c.id,arm),items:source.plan.items,images:inputs[arm]});
          if(!lots[arm].sealed) freshImages+=3;
        }
      }
      roster.push({c,plans,inputs,reason,lots});
    }
    assert.ok(used+freshImages<=protocol.images,'whole supplemental round exceeds remaining image allowance');
    const summary={version,round,eligiblePairs:roster.filter(v=>v.inputs).length,freshImages,reusedImages:roster.filter(v=>v.inputs).length*6-freshImages,globalImagesBefore:used};
    if(mode==='prepare') return summary;
    directory(target);
    copyExact(revisionFile,join(target,'revision.json'));
    keep(join(target,'j2-provenance.json'),{version,round,policySha256,protocolSha256,j1JudgmentsSha256,revisionSha256:hashFile(revisionFile),caseIds:protocol.caseIds});
    let key;
    for(const {c,plans,inputs,reason,lots} of roster) {
      const folder=join(target,c.id),records={};
      for (const arm of arms) {
        const d=join(folder,arm),checked=plans[arm];directory(d);
        copyExact(checked.planFile,join(d,'plan.json'));copyExact(checked.j2File,join(d,'j2-review.json'));
        copyExact(join(checked.sourceDir,'triage-judgment.json'),join(d,'triage-judgment.json'));
        const record={...checked.record};
        if(inputs) {
          const completed=await finishLot(db,lots[arm],{getKey:()=>key??=getKey(),fetchApi});
          keep(join(d,'images.json'),completed.map(s=>s.result));
          record.slots=completed.map(({result,...slot})=>slot);
        }
        records[arm]=record;
      }
      keep(join(folder,'j2-provenance.json'),{version,round,caseId:c.id,gate:'with',arms:records});
      const source=plans.with;
      const ablation=reason?{state:'not-submitted',reason}:{state:'complete',source:'with',optional:source.p.rubric.optionalId,
        prompts:source.plan.items.map(i=>digest(i.prompt)),inputs:Object.fromEntries(arms.map(a=>[a,inputHashes(inputs[a])]))};
      keep(join(folder,'ablation.json'),ablation);
    }
    return summary;
  } finally {db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [root,round,flag,...extra]=process.argv.slice(2);
  assert.ok(root && /^(0|5)$/.test(round) && !extra.length && [undefined,'--prepare','--freeze','--dispatch'].includes(flag),
    'Usage: contextual-pixels.mjs ROOT 0|5 [--prepare|--freeze|--dispatch]');
  console.log(JSON.stringify(await contextualPixels(resolve(root),Number(round),{mode:flag?.slice(2)??'prepare'})));
}
