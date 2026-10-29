import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PhoenixMemoryStore } from '../dist/phoenix_engine/services/memory_store.js';
import { PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { EphemeralReferenceStore } from '../dist/staging/ephemeral_store.js';

const usage={input_tokens:50,output_tokens:0,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0},total_tokens:50};
const labels=['incompatível','limitada','útil','muito útil'];
const probabilities=[.1,.2,.3,.4].map((probability,value)=>({value,label:labels[value],probability}));
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(10)]).toString('base64');

test('MCP Decision scores every retrieved candidate, respects model and image consent, and does not expose or stage filtered items', async () => {
  const hp=createPhoenixHyperparams();
  const memory=new PhoenixMemoryStore({hp});
  const actor='decision-test-owner';
  memory.setLongTermTaste(actor,{negative_constraints:['glassmorphism_ui']});
  const store=new EphemeralReferenceStore();
  const requests=[];
  let providerCalls=0, stagingFetches=0;
  const api={decisions:{create:async request=>{requests.push(request);return {model:'gpt-6-luna',usage,answers:request.questions.map(question=>({name:question.name,type:'score',score:2,confidence:.8,probabilities}))};}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(query){
    providerCalls++;
    const board=query.source.allowed_boards_or_queries[0];
    // Deliberately return more than the requested limit to stress the shortlist boundary.
    return Array.from({length:7},(_,i)=>{
      const slug=board.replace(/[^A-Za-z0-9]/g,'_');
      const origin=`https://www.pinterest.com/pin/${slug}_${i}/`;
      if(i===1)memory.getOrCreateUser(actor).rejected_origins.add(origin);
      // Explicit labels exercise the normal exclusion path; one deliberately
      // incomplete item exercises withholding an unverified visual constraint.
      const labels = i===3 ? 'ambiguous visual' : `carousel_editorial_4:5 ${i===2?'glassmorphism_ui':'swiss_grid'} bold_display_hook tactile_paper_texture`;
      return {raw_title:`${labels} ${i}`,raw_caption:`${labels} visual ${i}`,source_id:query.source.source_id,origin_url:origin,preview_url:`https://i.pinimg.com/236x/${slug}_${i}.jpg`,media_url:`https://i.pinimg.com/736x/${slug}_${i}.jpg`,aspect_rationale:{composition:'test'},thumbnail_base64:png,thumbnail_mime_type:'image/png'};
    });
  }};
  const server=createComporServer({phoenixActorId:actor,phoenixHyperparams:hp,phoenixMemoryStore:memory,phoenixDecisionService:service,referenceStore:store,providers:new Map([['pinterest_curated_design',provider]]),fetchFn:async()=>{stagingFetches++;throw new Error('unexpected network')}});
  const client=new Client({name:'decision-mcp-coverage',version:'1'});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const call=(name,args)=>client.callTool({name,arguments:args});
  const base={briefing:'Curso fictício',target_format:'carousel',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score'};
  try {
    const missingSearch=await call('discover_visual_references',{...base,consent_model:true});
    assert.equal(missingSearch.isError,true);assert.equal(providerCalls,0);assert.equal(requests.length,0);
    const missingModel=await call('discover_visual_references',{...base,consent_external_search:true});
    assert.equal(missingModel.isError,true);assert.equal(providerCalls,0);assert.equal(requests.length,0);
    const noImages=await call('discover_visual_references',{...base,consent_external_search:true,consent_model:true});
    assert.notEqual(noImages.isError,true,JSON.stringify(noImages));
    const first=noImages.structuredContent;
    assert.ok(first.telemetry.total_candidates_retrieved>12);
    assert.equal(first.decision_score_batch.requested,first.telemetry.total_candidates_retrieved);
    assert.equal(first.decision_score_batch.scored,first.telemetry.total_candidates_retrieved);
    assert.equal(requests.reduce((n,r)=>n+r.questions.length,0),first.telemetry.total_candidates_retrieved);
    assert.ok(requests.flatMap(r=>r.questions).every(q=>q.instructions.every(part=>part.type!=='input_image')));
    assert.ok(first.decision_score_batch.candidates.every(c=>c.image_note==='not_authorized'));
    assert.ok(first.telemetry.total_candidates_filtered>0);
    assert.ok(first.provider_diagnostics.some(s => s.includes('restrições visuais não puderam ser verificadas')));
    const excluded=first.decision_score_batch.candidates.filter(c=>{
      const found=memory.getDiscoveredCandidate(actor,c.candidate_id);
      return memory.getOrCreateUser(actor).rejected_origins.has(found.origin_url) || found.metadata_sid.includes('glassmorphism_ui') || found.metadata_sid.some(s=>s.startsWith('sid_unknown_'));
    });
    assert.ok(excluded.length>0);
    for(const c of excluded){
      assert.ok(!first.candidates.some(visible=>visible.candidate_id===c.candidate_id));
      assert.equal(store.getCandidate(c.candidate_id),undefined);
      const stage=await call('stage_approved_references',{proceed_without_references:false,selections:[{ref_id:c.candidate_id,selected_attributes:['composition']}]});
      assert.equal(stage.isError,true);
    }
    assert.equal(stagingFetches,0);
    // A candidate rejected after display must not remain stageable via its previous ID.
    const rejected=first.candidates[0];
    assert.ok(rejected);
    const prior=store.getCandidate(rejected.candidate_id);
    assert.ok(prior);
    const originalAliases=[...prior.aliases];
    // A pre-existing staged record must also become inaccessible by every alias.
    store.recordStagedReference({ref_id:prior.ref_id,origin_url:prior.origin_url,local_path:'/tmp/phoenix-test-evidence.webp'},originalAliases);
    const feedback=await call('record_visual_feedback',{candidate_id:rejected.candidate_id,board:rejected.board,metadata_sid:rejected.metadata_sid,action:'discard_generic',event_id:'reject-displayed-1',client_mode:'web'});
    assert.notEqual(feedback.isError,true,JSON.stringify(feedback));
    for(const alias of originalAliases){assert.equal(store.getCandidate(alias),undefined);assert.equal(store.getStagedReference(alias),undefined);}
    assert.ok(!store.listCandidates().some(c=>c.origin_url===prior.origin_url));
    assert.ok(!store.listStagedReferences().some(c=>c.origin_url===prior.origin_url));
    const stageRejected=await call('stage_approved_references',{proceed_without_references:false,selections:[{ref_id:rejected.candidate_id,selected_attributes:['composition']}]});
    assert.equal(stageRejected.isError,true);
    assert.equal(stagingFetches,0,'a rejected previously displayed candidate must not trigger a download');
    requests.length=0;
    const withImages=await call('discover_visual_references',{...base,consent_external_search:true,consent_model:true,consent_reference_previews:true});
    assert.notEqual(withImages.isError,true,JSON.stringify(withImages));
    assert.equal(withImages.structuredContent.decision_score_batch.requested,withImages.structuredContent.telemetry.total_candidates_retrieved);
    assert.equal(requests.reduce((n,r)=>n+r.questions.length,0),withImages.structuredContent.telemetry.total_candidates_retrieved);
    assert.ok(requests.flatMap(r=>r.questions).every(q=>q.instructions.some(part=>part.type==='input_image')));
    assert.ok(withImages.structuredContent.decision_score_batch.candidates.every(c=>c.image_note==='sent'));
    // An alias subsequently assigned to a different origin must remain usable.
    let reboundCount=0;
    for(const alias of originalAliases){const rebound=store.getCandidate(alias);if(rebound){reboundCount++;assert.notEqual(rebound.origin_url,prior.origin_url);}}
    assert.ok(reboundCount>0,'at least one positional alias must be reassigned to a valid different origin');
  } finally {await client.close();await server.close();}
});

test('MCP keeps real candidate SID claims stable when provider ordering changes', async () => {
  const hp=createPhoenixHyperparams();let reverse=false;
  const api={decisions:{create:async request=>({model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))})}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  service.routeBoards=async()=>({board_allocations:[{board:'kittldesign/poster-design',role:'hook_cover',weight:1,synthetic_query:'Curso de cerâmica',rationale:'board fixo para comparação'}],required_sid_tags:[],excluded_sid_tags:[]});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(query){
    const board=query.source.allowed_boards_or_queries[0].replace(/[^A-Za-z0-9]/g,'_');
    const names=['Romantic Florist Instagram Template','Poster sem estilo especificado'];
    return (reverse?[...names].reverse():names).map((title,i)=>({source_id:query.source.source_id,raw_title:title,raw_caption:'Visual para Instagram',origin_url:`https://www.pinterest.com/pin/${board}_${title.startsWith('Romantic')?'A':'B'}/`,preview_url:`https://i.pinimg.com/236x/${board}_${i}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}));
  }};
  const server=createComporServer({phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'sid-order-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const args={briefing:'Curso de cerâmica',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true};
  try {
    const first=await client.callTool({name:'discover_visual_references',arguments:args});
    assert.notEqual(first.isError,true,JSON.stringify(first));reverse=true;
    const second=await client.callTool({name:'discover_visual_references',arguments:args});
    assert.notEqual(second.isError,true,JSON.stringify(second));
    const map=x=>new Map(x.structuredContent.candidates.map(c=>[c.origin_url,c.metadata_sid]));
    const a=map(first),b=map(second);let compared=0;
    for(const [origin,sid] of a)if(b.has(origin)){compared++;assert.deepEqual(b.get(origin),sid);assert.ok(sid.every(s=>s.startsWith('sid_unknown_')));}
    assert.equal(compared,2,'the fixed provider returns the same two origins in both searches');
  } finally {await client.close();await server.close();}
});

test('unverified visual exclusions withhold real candidates after scoring and preserve no-reference path', async () => {
  const hp=createPhoenixHyperparams();
  const api={decisions:{create:async request=>({model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))})}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  service.routeBoards=async()=>({board_allocations:[{board:'kittldesign/poster-design',role:'hook_cover',weight:1,synthetic_query:'Cerâmica',rationale:'restrição de teste'}],required_sid_tags:[],excluded_sid_tags:['glassmorphism_ui']});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){return ['a','b'].map(id=>({source_id:q.source.source_id,raw_title:`Imagem ${id}`,raw_caption:'Metadados sem classe visual comprovada',origin_url:`https://www.pinterest.com/pin/unknown_${id}/`,preview_url:`https://i.pinimg.com/236x/unknown_${id}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}));}};
  const server=createComporServer({phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'sid-unknown-exclusion',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const result=await client.callTool({name:'discover_visual_references',arguments:{briefing:'Curso de cerâmica',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const d=result.structuredContent;
    assert.equal(d.candidate_origin,'provider');assert.equal(d.decision_score_batch.requested,2);assert.equal(d.decision_score_batch.scored,2);
    assert.equal(d.telemetry.total_candidates_filtered,2);assert.equal(d.candidates.length,0);
    assert.ok(d.provider_diagnostics.some(s=>s.includes('restrições visuais não puderam ser verificadas')));
    assert.equal(d.can_proceed_without_references,true);
    for(const candidate of d.decision_score_batch.candidates){const denied=await client.callTool({name:'stage_approved_references',arguments:{proceed_without_references:false,selections:[{ref_id:candidate.candidate_id,selected_attributes:['composition']}]}});assert.equal(denied.isError,true);}
    const continuation=await client.callTool({name:'stage_approved_references',arguments:{proceed_without_references:true,selections:[]}});
    assert.notEqual(continuation.isError,true);assert.equal(continuation.structuredContent.status,'proceeding_without_references');
  } finally {await client.close();await server.close();}
});
