import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {openLedger,digest} from '../runner/ledger.mjs';
import {aggregateCosts,costSnapshot,flareRange,readPlanReceipt,terraRange,usageNumbers} from './provider-usage.mjs';

const U={input_tokens:5000,output_tokens:900,total_tokens:5900,input_tokens_details:{cached_tokens:1500},output_tokens_details:{reasoning_tokens:200}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' vs '+b);
const session={id:'sess_fixture',agent:{model:'gpt-6.1-terra',tools:[],multi_agent:{enabled:false}},
  environment:{type:'none'},usage:U,prompt_cache_options:{ttl:'30m'}};
const turn={id:'turn_fixture',session_id:session.id,subagent_id:null,usage:U};
const target={sid:session.id,turnId:turn.id};
const transport=(values)=>async (url,init)=>{
  assert.equal(init.method,'GET');
  assert.equal(new Headers(init.headers).get('openai-beta'),'agents=v1');
  assert.equal(init.redirect,'error');
  assert.equal(new URL(url).origin,'https://api.openai.com');
  const path=new URL(url).pathname+new URL(url).search;
  assert.ok(Object.hasOwn(values,path),path);
  return Response.json(values[path]);
};
const sessionUrl='/v1/agents/sessions/sess_fixture';
test('OpenAI example: no double-charge for cached reads or reasoning output, range for unreported writes',()=>{
  const estimate=terraRange(U,'30m');
  close(estimate.outputLow,900*5/1e6);
  close(estimate.inputLow,(3500+1500*0.05)/1e6);
  close(estimate.inputHigh,(3500*1.25+1500*0.05)/1e6);
  close(estimate.upperUsd-estimate.lowerUsd,3500*0.25/1e6);
  assert.equal(estimate.context,'short');
  assert.equal(estimate.cacheWritesReported,false);
});
test('unrecorded cache, TTL and long per-call context have conservative bounds',()=>{
  const long=terraRange({input_tokens:300000,output_tokens:50,total_tokens:300050});
  close(long.lowerUsd,(300000*0.05+50*5)/1e6);
  close(long.upperUsd,(300000*2.5*2+50*7.5)/1e6);
  assert.equal(long.context,'per-call-length-unknown');
  assert.equal(terraRange({output_tokens:30}).upperUsd,null);
  assert.equal(terraRange({...U,total_tokens:1}),null);
  assert.equal(usageNumbers({...U,output_tokens_details:{reasoning_tokens:901}}),null);
});
test('Flare: output component is independent of uncertain input caching across text and images',()=>{
  const u={input_tokens:100,output_tokens:1000,total_tokens:1100,
    input_tokens_details:{text_tokens:60,image_tokens:40},output_tokens_details:{image_tokens:1000}};
  const v=flareRange(u);
  close(v.lowerUsd,(60*1.25+40*2+1000*30)/1e6);
  close(v.upperUsd,(60*5+40*8+1000*30)/1e6);
  close(v.fullInputRateScenarioUsd,v.upperUsd);
  const extra=flareRange({...u,input_tokens_details:{...u.input_tokens_details,cached_tokens:10}});
  close(extra.lowerUsd,v.upperUsd-10*6/1e6);
  close(extra.upperUsd,v.upperUsd-10*3.75/1e6);
  assert.equal(flareRange({input_tokens:100,output_tokens_details:{image_tokens:8}}).upperUsd,null);
});
test('GET session and matched root turn overlap: select one observation and prefer the exact turn if counts differ',async()=>{
  const fetchApi=transport({[sessionUrl]:session,[sessionUrl+'/turns/turn_fixture']:{...turn,usage:{...U,input_tokens:5100,total_tokens:6000}}});
  const result=await readPlanReceipt(target,'local-fixture',fetchApi);
  assert.equal(result.source,'GET turn');
  assert.equal(result.usage.input_tokens,5100);
  assert.equal(result.turnWarning,'session_and_turn_accounting_differ');
  const invalid=await readPlanReceipt(target,'local-fixture',transport({[sessionUrl]:session,[sessionUrl+'/turns/turn_fixture']:{...turn,session_id:'sess_foreign'}}));
  assert.equal(invalid.error,'different_turn');
});
test('a session ID without a saved turn uses only its own turns and refuses ambiguous or paginated scope',async()=>{
  const path=sessionUrl+'/turns?limit=2&order=desc';
  const one=await readPlanReceipt({sid:session.id},'fixture',transport({[sessionUrl]:session,[path]:{data:[turn],has_more:false}}));
  assert.equal(one.usage.input_tokens,5000);
  const many=await readPlanReceipt({sid:session.id},'fixture',transport({[sessionUrl]:session,[path]:{data:[turn],has_more:true}}));
  assert.equal(many.error,'ambiguous_session_usage');
  await assert.rejects(readPlanReceipt({sid:'../organization'},'fixture',()=>{throw Error('must never fetch');}),/invalid_saved_ID/);
});
test('an incomplete cost row preserves the known component but prevents a complete cohort total',()=>{
  const rows=[{estimate:terraRange(U,'30m')},{estimate:flareRange({output_tokens_details:{image_tokens:200}})},{estimate:null}];
  const result=aggregateCosts(rows);
  assert.equal(result.fullyCovered,1);
  assert.equal(result.knownOutputOperations,2);
  assert.equal(result.modelCostRangeUsd,null);
  close(result.outputComponentSubtotalLowUsd,(900*5+200*30)/1e6);
});
test('supplementary offline report reads existing receipts without modifying them or sending any request',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'compor-costs-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const p={plans:60,images:60,caseIds:['brief'],pixelRounds:[0,5]};
  writeFileSync(join(dir,'protocol.json'),JSON.stringify(p));
  const file=join(dir,'receipts.sqlite'), db=openLedger(file,p);
  db.reserve('0/brief/with/plan','plan',{});
  db.update('0/brief/with/plan','complete',{sid:session.id,turnId:turn.id,usage:U});
  db.close();
  const hash=digest(readFileSync(file));
  const result=await costSnapshot(dir,0,{fetchApi:()=>{throw Error('unexpected transport')}});
  assert.equal(result.total.fullyCovered,1);
  assert.equal(result.byKind.plan.reserved,1);
  assert.equal(result.operations[0].usage.cacheRead,1500);
  assert.equal(digest(readFileSync(file)),hash);
});
