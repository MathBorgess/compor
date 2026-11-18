import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validateExplorationPlan} from '../../../../packages/agents-api/src/exploration-plan-contract.mjs';
import {packet,cases} from '../dataset/packets.mjs';
import {finishPair,inspectPair} from '../fixed-control/images.mjs';
import {openFixedLedger} from '../fixed-control/ledger.mjs';
import {openLedger} from './ledger.mjs';

function fixture(t,caseIds=cases.map(c=>c.id)) {
  const base=mkdtempSync(join(tmpdir(),'compor-fixed-pair-')),file=join(base,'receipts.sqlite');
  const protocol={plans:60,images:60,caseIds}, main=openLedger(file,protocol),fixed=openFixedLedger(file,protocol);
  t.after(()=>{fixed.close();main.close();rmSync(base,{recursive:true,force:true});});
  return {base,file,protocol,main,fixed};
}
function admit(caseId) {
  const p=packet(caseId,'with'), trios=JSON.parse(readFileSync(new URL('../dataset/contrasts.json',import.meta.url)));
  const plan=validateExplorationPlan({version:2,referenceIds:p.visualInput.entries.map(r=>r.id),
    items:trios.find(c=>c.expected==='accept'&&c.caseId===caseId).items},p.context,p.visualInput);
  return {caseId,origin:'dataset-fixed-control',position:1,decision:'admit',optionalId:p.rubric.optionalId,subject:'a'.repeat(64),thread:'fixture',plan};
}
const forbidden=()=>{throw Error('unexpected request');};
const mockKey=()=>'sk-synthetic-test-session-for-this-fixture';
const png=()=>execFileSync(process.env.COMPOR_EVAL_PYTHON??'python3',['-I','-B','-c',
  'from PIL import Image; import sys; Image.new("RGB",(1024,1280)).save(sys.stdout.buffer,"PNG")']);
const raw=(id,arm)=>'0/'+id+'/'+arm+'/1';

test('separate fixed slots can use the same IDs as original paid slots and only remove optional bytes from the pair',async t=>{
  const {base,main,fixed}=fixture(t),name='dev-feira',verified=admit(name);
  const id=raw(name,'with');main.reserve(id,'image',{prior:'J1'});main.update(id,'complete',{existing:'historical'});
  const work=await inspectPair(fixed,base,name,verified),bytes=png(),uploads=[];
  const fetchApi=async (url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/images/edits');
    assert.equal(init.body.get('prompt'),verified.plan.items[0].prompt);
    uploads.push(await Promise.all(init.body.getAll('image[]').map(async f=>Buffer.from(await f.arrayBuffer()).toString('base64'))));
    return Response.json({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:2,output_tokens:3,total_tokens:5}});
  };
  await finishPair(fixed,work,{fetchApi,getKey:mockKey});
  assert.deepEqual(uploads.sort((a,b)=>b.length-a.length),[work.refs.with,work.refs.without].map(images=>images.map(i=>i.data)));
  assert.deepEqual(main.get(id).result,{existing:'historical'});
  assert.deepEqual(fixed.count(),{main:1,fixed:2,total:3});
  const prior=await inspectPair(fixed,base,name,verified);
  assert.equal(prior.submit,false);await finishPair(fixed,prior,{fetchApi:forbidden,getKey:forbidden});
  assert.equal(uploads.length,2);
  const stamp=JSON.parse(readFileSync(join(base,name,'ablation.json')));
  assert.equal(stamp.origin,'dataset-fixed-control');assert.equal(stamp.prompts.length,1);
  assert.equal(stamp.controlSubject,verified.subject);assert.deepEqual(stamp.inputs,work.ablation.inputs);
  for(const arm of ['with','without']) assert.deepEqual(JSON.parse(readFileSync(join(base,name,arm,'image.json'))),fixed.get(raw(name,arm)).result);
  rmSync(join(base,name,'without','art-1.png'));
  await assert.rejects(inspectPair(fixed,base,name,verified),/stored_image_changed/);
});
test('the original writer enforces the combined 60, entire lots, global exclusion, and 15 seconds across namespaces',t=>{
  const {main,fixed}=fixture(t),name='dev-feira';
  for(let i=0;i<58;i++){main.reserve('paid-'+i,'image',{});main.update('paid-'+i,'complete',{});}
  const now=10000;assert.equal(fixed.admitPair(name,'receipt',now),0);
  assert.throws(()=>main.admitLot('main',['x','y','z'],now),/active_batch/);
  assert.throws(()=>main.reserve('outside','image',{}),/fixed_control_pair_active/);
  assert.throws(()=>fixed.reserve(raw('dev-troca','with'),'image',{}),/not_admitted/);
  for(const arm of ['with','without']){
    const id=raw(name,arm);
    fixed.reserve(id,'image',{});fixed.update(id,'complete',{},now+30);
  }
  assert.equal(main.admitLot('main',['x','y','z'],now+31),14999);
  assert.throws(()=>main.admitLot('main',['x','y','z'],now+15030),/insufficient_allowance_for_complete_lot/);
  assert.throws(()=>main.reserve('outside','image',{}),/combined_image_allowance/);
  assert.throws(()=>fixed.admitPair('dev-troca','second',now+16000),/insufficient_allowance_for_complete_lot/);
  assert.deepEqual(fixed.count(),{main:58,fixed:2,total:60});
});
test('a case cannot start before the original cooldown, nor can it buy a sixth pair under the shared allowance',t=>{
  const names=['first','second','third','fourth','fifth','sixth'],{main,fixed}=fixture(t,names);
  main.admitLot('J1',['1','2','3'],1);
  assert.throws(()=>fixed.admitPair(names[0],'s',1),/active_or_uncertain/);
  for(const id of ['1','2','3']){main.reserve(id,'image',{});main.update(id,'complete',{},50);}
  assert.equal(fixed.admitPair(names[0],'s',60),14990);
  for(let i=0;i<5;i++){
    const now=15050+i*15300,name=names[i];
    assert.equal(fixed.admitPair(name,'s',now),0);
    for(const arm of ['with','without']){
      const id=raw(name,arm);fixed.reserve(id,'image',{});fixed.update(id,'complete',{},now+3);
    }
  }
  assert.throws(()=>fixed.admitPair(names[5],'s',1000000),/insufficient_fixed_control_allowance/);
  assert.deepEqual(fixed.count(),{main:3,fixed:10,total:13});
});
test('a rejected provider response consumes the reservation, blocks the main writer and stops any later fixed POST',async t=>{
  const {base,main,fixed}=fixture(t),name='dev-feira',verification=admit(name);
  const work=await inspectPair(fixed,base,name,verification);let posts=0;
  await assert.rejects(finishPair(fixed,work,{getKey:mockKey,fetchApi:async()=>{posts++;return Response.json({},{status:503});}}),/incomplete_fixed_pair/);
  assert.ok(posts>=1&&posts<=2);const previous=posts;
  assert.ok(!existsSync(join(base,name,'ablation.json')));
  assert.throws(()=>fixed.requireIdle(),/active_or_uncertain/);
  assert.throws(()=>fixed.admitPair('dev-troca','later'),/active_or_uncertain/);
  assert.throws(()=>main.admitLot('another',['x','y','z']),/active_batch/);
  await assert.rejects(inspectPair(fixed,base,name,verification),/partial_or_uncertain/);
  assert.equal(posts,previous);assert.equal(fixed.count().fixed,posts);
});
test('a hold preserves the reason without buying, charges cannot bind absent or orphan reference bytes, prepare does not install tables',async t=>{
  const {base,fixed}=fixture(t),name='dev-feira',verification=admit(name);
  const denied={...verification,decision:'hold',plan:null,reason:'indistinct'};
  const work=await inspectPair(fixed,base,name,denied);await finishPair(fixed,work,{getKey:forbidden,fetchApi:forbidden});
  assert.deepEqual(JSON.parse(readFileSync(join(base,name,'ablation.json'))),{state:'not-submitted',reason:'indistinct',origin:'dataset-fixed-control'});
  const p=packet(name,'with'),ids=verification.plan.referenceIds.filter(id=>id!==p.rubric.optionalId);
  await assert.rejects(inspectPair(fixed,base,name,{...verification,plan:{...verification.plan,referenceIds:ids}}),/optional input/);
  const other='dev-troca',orphan=join(base,other,'with');
  mkdirSync(orphan,{recursive:true});writeFileSync(join(orphan,'art-1.png'),'untracked');
  await assert.rejects(inspectPair(fixed,base,other,admit(other)),/orphan/);
  const second=join(base,'fresh.sqlite'),protocol={plans:60,images:60,caseIds:[name]};
  openLedger(second,protocol).close();
  const reader=openFixedLedger(second,protocol,{readOnly:true});assert.deepEqual(reader.count(),{main:0,fixed:0,total:0});reader.close();
  const rawDb=new DatabaseSync(second,{readOnly:true});
  try {assert.equal(rawDb.prepare("SELECT name FROM sqlite_master WHERE name='fixed_control_calls'").get(),undefined);}
  finally {rawDb.close();}
});
