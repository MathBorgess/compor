import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import { createStreamableHttpHandler } from '../dist/inprocess-http.js';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';
import { PhoenixMemoryStore } from '../dist/phoenix_engine/services/memory_store.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { EphemeralReferenceStore } from '../dist/staging/ephemeral_store.js';

const hp=createPhoenixHyperparams();
const mkProvider = () => ({sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(query){const slug='shared';return Array.from({length:3},(_,i)=>({raw_title:`swiss editorial ${i}`,raw_caption:'swiss editorial grid',source_id:query.source.source_id,origin_url:`https://www.pinterest.com/pin/${slug}_${i}/`,preview_url:`https://i.pinimg.com/236x/${slug}_${i}.jpg`,media_url:`https://i.pinimg.com/736x/${slug}_${i}.jpg`,aspect_rationale:{composition:'test'},thumbnail_base64:null,thumbnail_mime_type:null}));}});
const decisionClient={decisions:{create:async request=>({model:'gpt-6-luna',usage:{input_tokens:20,output_tokens:0,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0},total_tokens:20},answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities:[.1,.2,.3,.4].map((probability,value)=>({label:['incompatível','limitada','útil','muito útil'][value],value,probability}))}))})}};
async function connect({actor,session,store,memory,provider,fetchFn}) {const server=createComporServer({phoenixActorId:actor,phoenixProfileSession:session,phoenixHyperparams:hp,phoenixMemoryStore:memory,phoenixDecisionService:new PhoenixDecisionApiService({hp,openaiClient:decisionClient,forceDeterministicMock:true}),referenceStore:store,providers:new Map([['pinterest_curated_design',provider]]),fetchFn});const client=new Client({name:'context-integration',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);return {server,client};}
const call=(c,name,args={})=>c.client.callTool({name,arguments:args});
const ok=async(c,name,args={})=>{const r=await call(c,name,args);assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};
const search=(c,id)=>ok(c,'discover_visual_references',{briefing:'Curso fictício',target_format:'carousel',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true,profile_scope:{type:'campaign',id}});

test('MCP persists campaign reference choices, isolates people and campaigns, revokes and explicitly reconsiders', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'phoenix-mcp-scopes-'));
  const store=new EphemeralReferenceStore({stagingRoot:dir}),memory=new PhoenixMemoryStore({hp}),provider=mkProvider();let downloads=0;
  const fetchFn=async()=>{downloads++;throw new Error('no staging download expected')};
  const ledger=await ProfileLedger.restoreLocal('alice',dir),aliceSession={ledger,persistenceDirectory:dir,directory:Promise.resolve(dir)};
  const alice=await connect({actor:'alice',session:aliceSession,store,memory,provider,fetchFn});
  // The same profile session may be connected for a collaborator; its callback must not replace Alice's.
  const collaborator=await connect({actor:'collaborator',session:aliceSession,store,memory,provider,fetchFn});
  const bobLedger=new ProfileLedger('bob'),bob=await connect({actor:'bob',session:{ledger:bobLedger},store,memory,provider,fetchFn});
  let restored;
  try {
    await ok(alice,'phoenix_profile_consent',{purpose:'personalization',granted:true});
    const first=await search(alice,'c1'),ref=first.candidates[0];assert.ok(ref);
    const event={id:'reject-one',version_id:'v1',campaign_id:'c1',origin_url:ref.origin_url,source_id:'pinterest_curated_design',action:'reject',person_statement:'Não quero esta referência.'};
    const saved=await ok(alice,'phoenix_profile_reference_decision',event);
    assert.equal(saved.event.source_id,'pinterest_curated_design');
    assert.equal((await ok(alice,'phoenix_profile_reference_decision',event)).duplicate,true);
    const blockedStage=await call(alice,'stage_approved_references',{proceed_without_references:false,selections:[{ref_id:ref.candidate_id,selected_attributes:['composition']}]});
    assert.equal(blockedStage.isError,true);assert.equal(downloads,0);
    const again=await search(alice,'c1');
    assert.ok(!again.candidates.some(c=>c.origin_url===ref.origin_url));
    assert.ok(again.telemetry.total_candidates_filtered>0);
    const plainSearch=await ok(alice,'search_curated_references',{briefing_summary:'Curso fictício',target_format:'carousel',aspect_focus:['composition'],source_ids:['pinterest_curated_design'],consent_external_search:true});
    assert.ok(!plainSearch.candidates.some(c=>c.origin_url===ref.origin_url),'generic curated search must also honor the active campaign rejection');
    assert.ok((await search(alice,'c2')).candidates.some(c=>c.origin_url===ref.origin_url),'another campaign must not inherit rejection');
    assert.ok((await search(bob,'c1')).candidates.some(c=>c.origin_url===ref.origin_url),'another owner must not inherit rejection');
    assert.ok(!(await search(alice,'c1')).candidates.some(c=>c.origin_url===ref.origin_url));
    await ok(alice,'phoenix_profile_consent',{purpose:'personalization',granted:false});
    assert.ok((await search(alice,'c1')).candidates.some(c=>c.origin_url===ref.origin_url),'revocation stops applying profile rejection');
    assert.equal((await ok(alice,'phoenix_profile_read')).profile.reference_decisions.length,1,'revocation preserves history');
    await ok(alice,'phoenix_profile_consent',{purpose:'personalization',granted:true});
    assert.ok(!(await search(alice,'c1')).candidates.some(c=>c.origin_url===ref.origin_url));
    await ok(alice,'phoenix_profile_reference_decision',{...event,id:'reconsider-one',action:'reconsider',person_statement:'Quero reconsiderar.'});
    assert.ok((await search(alice,'c1')).candidates.some(c=>c.origin_url===ref.origin_url));
    await ok(alice,'phoenix_profile_reference_decision',{...event,id:'select-one',action:'select',selected_attributes:['composition'],person_statement:'Quero só a composição.'});
    const restoredLedger=await ProfileLedger.restoreLocal('alice',dir);
    assert.equal(restoredLedger.activeReferenceDecisions('alice','c1')[0].action,'select');
    assert.deepEqual(restoredLedger.activeReferenceDecisions('alice','c1')[0].selected_attributes,['composition']);
    restored=await connect({actor:'alice',session:{ledger:restoredLedger},store:new EphemeralReferenceStore({stagingRoot:dir}),memory:new PhoenixMemoryStore({hp}),provider,fetchFn});
    assert.ok((await search(restored,'c1')).candidates.some(c=>c.origin_url===ref.origin_url));
    assert.equal((await call(collaborator,'phoenix_profile_reference_decision',{...event,id:'spoof'})).isError,true);
  } finally {for(const c of [alice,collaborator,bob,...(restored?[restored]:[])]){await c.client.close();await c.server.close();}await rm(dir,{recursive:true,force:true});}
});

test('overlapping campaigns retain their own aliases and an in-flight rejection is applied only to its campaign', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'phoenix-overlap-'));
  const store=new EphemeralReferenceStore({stagingRoot:dir}),memory=new PhoenixMemoryStore({hp});
  let openGate; const gate=new Promise(resolve=>{openGate=resolve});
  let started; const startedPromise=new Promise(resolve=>{started=resolve});
  let firstA=true;
  const underlying=mkProvider();
  const provider={...underlying,async searchMetadataOnly(query){
    if(firstA && query.briefing_summary.includes('TURMA_ALFA')){firstA=false;started();await gate;}
    return underlying.searchMetadataOnly(query);
  }};
  const ledger=new ProfileLedger('alice'),session={ledger,directory:Promise.resolve(dir)};
  const alice=await connect({actor:'alice',session,store,memory,provider,fetchFn:async()=>{throw new Error('no download')}});
  const args=id=>({briefing:`TURMA_${id}`,target_format:'carousel',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true,profile_scope:{type:'campaign',id}});
  try {
    await ok(alice,'phoenix_profile_consent',{purpose:'personalization',granted:true});
    const pending=ok(alice,'discover_visual_references',args('ALFA'));
    await startedPromise;
    const beta=await ok(alice,'discover_visual_references',args('BETA'));
    const origin=beta.candidates[0].origin_url;
    await ok(alice,'phoenix_profile_reference_decision',{id:'concurrent-reject',version_id:'v1',campaign_id:'ALFA',origin_url:origin,action:'reject'});
    openGate();
    const alpha=await pending;
    assert.ok(!alpha.candidates.some(c=>c.origin_url===origin),'a rejection in a different active campaign must affect the in-flight target campaign');
    const keyA=JSON.stringify(['alice','campaign','ALFA']),keyB=JSON.stringify(['alice','campaign','BETA']);
    const aId=alpha.candidates[0].candidate_id,bId=beta.candidates[0].candidate_id;
    assert.ok(store.runWithReferenceContext(keyA,()=>store.getCandidate(aId)));
    assert.equal(store.runWithReferenceContext(keyB,()=>store.getCandidate(aId)),undefined);
    assert.ok(store.runWithReferenceContext(keyB,()=>store.getCandidate(bId)));
    assert.equal(store.runWithReferenceContext(keyA,()=>store.getCandidate(bId)),undefined);
    assert.ok(memory.runWithReferenceContext('alice',keyA,()=>memory.getDiscoveredCandidate('alice',aId)));
    assert.equal(memory.runWithReferenceContext('alice',keyB,()=>memory.getDiscoveredCandidate('alice',aId)),undefined);
    assert.ok((await ok(alice,'discover_visual_references',args('BETA'))).candidates.some(c=>c.origin_url===origin));
  } finally {openGate();await alice.client.close();await alice.server.close();await rm(dir,{recursive:true,force:true});}
});

test('shared reference store separates actors even without a chosen campaign', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'phoenix-default-owner-'));
  const store=new EphemeralReferenceStore({stagingRoot:dir}),memory=new PhoenixMemoryStore({hp}),provider=mkProvider();
  let downloads=0;const fetchFn=async()=>{downloads++;throw new Error('no download expected')};
  const alice=await connect({actor:'alice',session:{ledger:new ProfileLedger('alice')},store,memory,provider,fetchFn});
  const bob=await connect({actor:'bob',session:{ledger:new ProfileLedger('bob')},store,memory,provider,fetchFn});
  const args={briefing_summary:'Curso fictício',target_format:'carousel',aspect_focus:['composition'],source_ids:['pinterest_curated_design'],consent_external_search:true};
  try {
    const a=await ok(alice,'search_curated_references',args);
    const b=await ok(bob,'search_curated_references',args);
    assert.ok(a.candidates.length && b.candidates.length);
    assert.equal(typeof a.candidates[0].ref_id,'string');assert.equal(typeof b.candidates[0].ref_id,'string');
    const aKey=JSON.stringify(['alice','session','default']),bKey=JSON.stringify(['bob','session','default']);
    assert.ok(store.runWithReferenceContext(aKey,()=>store.getCandidate(a.candidates[0].ref_id)));
    assert.equal(store.runWithReferenceContext(bKey,()=>store.getCandidate(a.candidates[0].ref_id)),undefined);
    assert.ok(store.runWithReferenceContext(bKey,()=>store.getCandidate(b.candidates[0].ref_id)));
    assert.equal(store.runWithReferenceContext(aKey,()=>store.getCandidate(b.candidates[0].ref_id)),undefined);
    const stage=id=>({proceed_without_references:false,selections:[{ref_id:id,selected_attributes:['composition']}]});
    assert.equal((await call(bob,'stage_approved_references',stage(a.candidates[0].ref_id))).isError,true);
    assert.equal((await call(alice,'stage_approved_references',stage(b.candidates[0].ref_id))).isError,true);
    assert.equal(downloads,0);
  } finally {await alice.client.close();await alice.server.close();await bob.client.close();await bob.server.close();await rm(dir,{recursive:true,force:true});}
});

test('HTTP handler retains campaign decisions between separate MCP requests', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'phoenix-http-context-'));
  const ledger=new ProfileLedger('alice'),provider=mkProvider();
  const handler=createStreamableHttpHandler({phoenixActorId:'alice',phoenixProfileSession:{ledger,directory:Promise.resolve(dir)},phoenixHyperparams:hp,phoenixDecisionService:new PhoenixDecisionApiService({hp,openaiClient:decisionClient,forceDeterministicMock:true}),providers:new Map([['pinterest_curated_design',provider]])});
  let id=0;
  const http=async(name,args)=>{
    const response=await handler('https://compor.invalid/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(response.status,200);const body=await response.json();assert.ok(body.result,JSON.stringify(body));return body.result;
  };
  const good=async(name,args)=>{const result=await http(name,args);assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;};
  const args=campaign=>({briefing:'Curso fictício',target_format:'carousel',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true,profile_scope:{type:'campaign',id:campaign}});
  try {
    await good('phoenix_profile_consent',{purpose:'personalization',granted:true});
    const first=await good('discover_visual_references',args('c1'));const ref=first.candidates[0];
    await good('phoenix_profile_reference_decision',{id:'http-reject',version_id:'v1',campaign_id:'c1',origin_url:ref.origin_url,action:'reject'});
    assert.equal((await http('stage_approved_references',{proceed_without_references:false,selections:[{ref_id:ref.candidate_id,selected_attributes:['composition']}]})).isError,true);
    assert.ok(!(await good('discover_visual_references',args('c1'))).candidates.some(c=>c.origin_url===ref.origin_url));
    assert.ok((await good('discover_visual_references',args('c2'))).candidates.some(c=>c.origin_url===ref.origin_url));
  } finally {await rm(dir,{recursive:true,force:true});}
});
