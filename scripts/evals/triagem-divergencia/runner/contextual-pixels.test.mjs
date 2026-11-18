import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases,packet} from '../dataset/packets.mjs';
import {openLedger} from './ledger.mjs';
import {contextualPixels,finishLot,inspectLot} from './contextual-pixels.mjs';

function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'compor-j2-pixels-'));
  const db=openLedger(join(dir,'test.sqlite'),{plans:60,images:60});
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  const sourceDir=join(dir,'j1','with'),target=join(dir,'j2','with');
  for(const d of [sourceDir,target]) mkdirSync(d,{recursive:true,mode:0o700});
  const items=[1,2,3].map(position=>({position,prompt:'Cartaz de compotas número '+position}));
  const images=packet('dev-feira','with').referenceImages;
  return {db,dir,round:0,caseId:'dev-feira',arm:'with',items,images,sourceDir,target};
}
const forbidden=()=>{throw Error('external call forbidden');};
const localPng=()=>execFileSync(process.env.COMPOR_EVAL_PYTHON??'python3',['-I','-B','-c',
  'from PIL import Image; import sys; Image.new("RGB", (1024,1280)).save(sys.stdout.buffer,"PNG")']);
test('a fresh real-adapter lot uses exactly three identical IDs; reopening J1 originals or J2 output never reads a key',async t=>{
  const f=setup(t),lot=await inspectLot(f.db,f),bytes=localPng();
  let posts=0;
  const params={getKey:()=>'sk-synthetic-test-session-for-this-fixture',fetchApi:async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(init.method,'POST');
    assert.equal(init.body.getAll('image[]').length,2);posts++;
    return Response.json({data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:2,output_tokens:3,total_tokens:5}});
  }};
  const fresh=await finishLot(f.db,lot,params);
  assert.equal(posts,3);assert.deepEqual(fresh.map(s=>s.origin),['j2','j2','j2']);
  assert.ok(!existsSync(join(f.sourceDir,'art-1.png'))); // Supplemental output leaves J1 untouched.
  const reuse=await finishLot(f.db,await inspectLot(f.db,f),{getKey:forbidden,fetchApi:forbidden});
  assert.deepEqual(fresh,reuse);
  await assert.rejects(inspectLot(f.db,{...f,images:[...f.images].reverse()}),/image_binding_changed/);
  await assert.rejects(inspectLot(f.db,{...f,items:f.items.map(i=>({...i,prompt:'Outro pedido'}))}),/image_binding_changed/);
  const sourceIndex=join(f.target,'images.json');
  writeFileSync(sourceIndex,JSON.stringify(fresh.map(s=>s.result)));
  writeFileSync(join(f.target,'..','ablation.json'),JSON.stringify({state:'complete'}));
  const secondView=join(f.dir,'separate-view');mkdirSync(secondView);
  const original=await inspectLot(f.db,{...f,sourceDir:f.target,target:secondView});
  const restored=await finishLot(f.db,original,{getKey:forbidden,fetchApi:forbidden});
  assert.deepEqual(restored.map(s=>s.origin),['j1','j1','j1']);
  assert.deepEqual(readFileSync(join(secondView,'art-2.png')),bytes);
  rmSync(join(f.target,'art-2.png'));
  await assert.rejects(inspectLot(f.db,f),/paid_image_bytes_missing_no_resubmit/);
  assert.equal(posts,3);
});
test('uncertain, partial, or untracked images block every new dispatch for that lot',async t=>{
  const f=setup(t),file=join(f.target,'art-3.png');
  writeFileSync(file,Buffer.from('orphan'));
  await assert.rejects(inspectLot(f.db,f),/orphan image/);rmSync(file);
  const id='0/dev-feira/with/1'; f.db.reserve(id,'image',{});
  await assert.rejects(inspectLot(f.db,f),/partial_or_uncertain/);
  f.db.update(id,'unknown',{});
  await assert.rejects(inspectLot(f.db,f),/partial_or_uncertain/);
  for(const i of [2,3]) assert.equal(f.db.get('0/dev-feira/with/'+i),null);
});
test('the next entire lot waits for the ledger cooldown before any of its three requests',async t=>{
  const f=setup(t),lot=await inspectLot(f.db,f),bytes=localPng(), events=[];
  const calls=new Proxy(f.db,{get(db,method) {
    if(method!=='admitLot') return db[method];
    return (...args)=>{events.push('admit');return events.length===1?15000:db.admitLot(...args);};
  }});
  await finishLot(calls,lot,{getKey:()=>'sk-synthetic-test-session-for-this-fixture',
    wait:async ms=>{assert.equal(ms,15000);events.push('wait');},
    fetchApi:async()=>{events.push('post');return Response.json({data:[{b64_json:bytes.toString('base64')}]});}});
  assert.deepEqual(events,['admit','wait','admit','post','post','post']);
});

test('J2 requires terminal J1, binds every exported plan to SQLite, and represents both arms of all five holds independently',async t=>{
  const root=mkdtempSync(join(tmpdir(),'compor-full-j2-fixture-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const roundDir=join(root,'round-0'),save=(file,data)=>writeFileSync(file,JSON.stringify(data));
  const runModule=(path,args)=>execFileSync(process.execPath,[fileURLToPath(new URL(path,import.meta.url)),...args],{stdio:'pipe'});
  runModule('./round.mjs',['init',root,'60']);
  const protocol=JSON.parse(readFileSync(join(root,'protocol.json'))),db=openLedger(join(root,'receipts.sqlite'),protocol);
  const view=join(root,'j2-pixels','round-0');
  const judgments={version:1,cases:[]};
  try {
    for (const c of cases) {
      const arms={};
      for(const arm of ['with','without']) {
        const sub=join(roundDir,c.id,arm),p=packet(c.id,arm),id='0/'+c.id+'/'+arm+'/plan';
        mkdirSync(sub,{recursive:true});
        db.reserve(id,'plan',{context:p.context,visualInput:p.visualInput,instructions:null});
        db.update(id,'rejected',{http:422});
        save(join(sub,'plan.json'),{state:'rejected',plan:null,referenceReadings:null,raw:null,sid:null,usage:null});
        save(join(sub,'review.json'),{decision:'hold',reason:'plan_unavailable'});
        save(join(sub,'triage-judgment.json'),{available:false,references:[]});
        arms[arm]={slots:[1,2,3].map(position=>({position,sha256:null,usable:null}))};
      }
      save(join(roundDir,c.id,'ablation.json'),{state:'not-submitted',reason:'plan_unavailable'});
      judgments.cases.push({caseId:c.id,split:c.split,arms});
    }
    runModule('../plan-judge/contextual-round.mjs',[root,'0']);
    await assert.rejects(contextualPixels(root,0,{mode:'dispatch',getKey:forbidden,fetchApi:forbidden}),/judgments.json/);
    mkdirSync(join(roundDir,'pixels'));save(join(roundDir,'pixels','judgments.json'),judgments);
    const summary=await contextualPixels(root,0,{mode:'dispatch',getKey:forbidden,fetchApi:forbidden});
    assert.equal(summary.eligiblePairs,0);assert.equal(summary.freshImages,0);
    assert.deepEqual(JSON.parse(readFileSync(join(view,'j2-provenance.json'))).caseIds,protocol.caseIds);
    for(const c of cases) {
      const p=JSON.parse(readFileSync(join(view,c.id,'j2-provenance.json')));
      for(const arm of ['with','without']){
        assert.equal(p.arms[arm].decision,'hold');assert.deepEqual(p.arms[arm].slots,[]);
        assert.equal(existsSync(join(view,c.id,arm,'review.json')),false);
      }
    }
    const file=join(roundDir,cases[0].id,'with','plan.json'),original=readFileSync(file);
    save(file,{...JSON.parse(original),sid:'session-from-another-plan'});
    await assert.rejects(contextualPixels(root,0,{mode:'dispatch',getKey:forbidden}),/plan export changed/);
    writeFileSync(file,original);
    const review=join(roundDir,'j2',cases[0].id,'with','j2-review.json');
    save(review,{...JSON.parse(readFileSync(review)),decision:'admit'});
    await assert.rejects(contextualPixels(root,0,{mode:'dispatch',getKey:forbidden}),/contextual_review_subject_changed/);
  } finally {db.close();}
});
