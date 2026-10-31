import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { format_mcp_response } from '../dist/phoenix_engine/mcp/dual_adapter.js';
import { EphemeralReferenceStore } from '../dist/staging/ephemeral_store.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PNG64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const usage={input_tokens:30,output_tokens:0,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0},total_tokens:30};
const probabilities=[.1,.2,.3,.4].map((probability,value)=>({value,label:['incompatível','limitada','útil','muito útil'][value],probability}));

test('identical ranker input and preview bytes deduplicate, retain provenance, and isolate feedback',async()=>{
  const hp=createPhoenixHyperparams({top_n_results:20}), requests=[];
  const root=await mkdtemp(join(tmpdir(),'phoenix-dedup-'));
  const store=new EphemeralReferenceStore({stagingRoot:root});
  const api={decisions:{create:async request=>{requests.push(request);return {model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))};}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  const first='kittldesign/poster-design',second='behance/typography';
  service.routeBoards=async()=>({board_allocations:[{board:first,role:'hook_cover',weight:.5,synthetic_query:'Curso',rationale:'teste'},{board:second,role:'structural_grid',weight:.5,synthetic_query:'Curso',rationale:'teste'}],required_sid_tags:[],excluded_sid_tags:[]});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){
    const board=q.source.allowed_boards_or_queries[0];
    const origins=board===first?['https://www.pinterest.com/pin/123456/','https://www.pinterest.com/pin/123456/']:['https://br.pinterest.com/pin/123456/?utm_source=fixture','https://example.org/pin/123456/','https://example.org/pin/123456/'];
    return origins.map((origin,i)=>({source_id:q.source.source_id,raw_title:'Fixture',raw_caption:'Meta de teste',origin_url:origin,preview_url:`https://i.pinimg.com/236x/${board.replaceAll('/','_')}_${i>1?1:i}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:origin.includes('pinterest.com')?PNG64:null,thumbnail_mime_type:origin.includes('pinterest.com')?'image/png':null}));
  }};
  const png=Buffer.from(PNG64,'base64');
  const server=createComporServer({phoenixActorId:'dedup-owner',phoenixHyperparams:hp,phoenixDecisionService:service,referenceStore:store,providers:new Map([['pinterest_curated_design',provider]]),fetchFn:async()=>new Response(png,{status:200,headers:{'content-type':'image/png'}})});
  const client=new Client({name:'dedup-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const args={briefing:'Curso fictício',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true};
  try {
    const result=await client.callTool({name:'discover_visual_references',arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));
    const data=result.structuredContent;
    assert.equal(data.decision_score_batch.requested,4,'one API question per ranker-distinct input and per unknown occurrence');
    assert.equal(data.telemetry.total_candidates_retrieved,4);
    assert.equal(data.telemetry.total_candidate_occurrences,5);
    const pin=data.candidates.find(c=>c.origin_url.includes('pinterest.com/pin/123456'));
    assert.ok(pin);assert.equal(pin.board,first,'representative owns the exposed feedback');
    assert.deepEqual(pin.provenance_occurrences.map(x=>x.board).sort(),[first,first].sort());
    assert.ok(pin.provenance_occurrences.every(x=>x.source_id==='pinterest_curated_design' && !x.origin_url.includes('utm_')));
    assert.match(format_mcp_response(data,'codex'),/boards consultados, não afiliação comprovada/);
    assert.equal(data.candidates.filter(c=>c.origin_url==='https://example.org/pin/123456/').length,2,'unrecognized identities must remain distinct even when their URL and preview match');
    const ownerScope=JSON.stringify(['dedup-owner','session','default']),otherScope=JSON.stringify(['other-person','session','default']);
    const readCandidate=()=>store.runWithReferenceContext(ownerScope,()=>store.getCandidate(pin.candidate_id));
    assert.deepEqual(readCandidate().provenance_occurrences,pin.provenance_occurrences);
    assert.equal(store.runWithReferenceContext(otherScope,()=>store.getCandidate(pin.candidate_id)),undefined);
    const staged=await client.callTool({name:'stage_approved_references',arguments:{proceed_without_references:false,selections:[{ref_id:pin.candidate_id,selected_attributes:['composition']}]}});
    assert.notEqual(staged.isError,true,JSON.stringify(staged));
    assert.deepEqual(staged.structuredContent.staged_references[0].provenance_occurrences,pin.provenance_occurrences);
    assert.equal('provenance_occurrences' in staged.structuredContent.moodboard_elements[0],false,'PR 9 moodboard shape stays unchanged');
    assert.ok((await readFile(staged.structuredContent.staged_references[0].local_path)).length>0);
    for(const alias of readCandidate().aliases) {
      assert.deepEqual(store.runWithReferenceContext(ownerScope,()=>store.getStagedReference(alias)).provenance_occurrences,pin.provenance_occurrences);
      assert.equal(store.runWithReferenceContext(otherScope,()=>store.getStagedReference(alias)),undefined);
    }
    const feedback=await client.callTool({name:'record_visual_feedback',arguments:{candidate_id:pin.candidate_id,board:pin.board,metadata_sid:pin.metadata_sid,action:'discard_generic',event_id:'dedup-reject',client_mode:'web'}});assert.notEqual(feedback.isError,true,JSON.stringify(feedback));
    assert.equal(store.runWithReferenceContext(ownerScope,()=>store.getStagedReference(pin.candidate_id)),undefined);
    const wrongBoard=await client.callTool({name:'record_visual_feedback',arguments:{candidate_id:pin.candidate_id,board:second,metadata_sid:pin.metadata_sid,action:'discard_generic',event_id:'wrong-board',client_mode:'web'}});assert.equal(wrongBoard.isError,true);
    const after=await client.callTool({name:'discover_visual_references',arguments:args});assert.notEqual(after.isError,true,JSON.stringify(after));
    assert.ok(after.structuredContent.candidates.every(c=>!c.origin_url.includes('pinterest.com/pin/123456')));
    assert.ok(after.structuredContent.candidates.some(c=>c.origin_url==='https://example.org/pin/123456/'));
  } finally {await client.close();await server.close();await rm(root,{recursive:true,force:true});}
});

test('a conflicting board occurrence remains separately evaluated and cannot bypass an excluded SID',async()=>{
  const hp=createPhoenixHyperparams(),requests=[];
  const api={decisions:{create:async request=>{requests.push(request);return {model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))};}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  const first='kittldesign/poster-design',second='behance/typography';
  service.routeBoards=async()=>({board_allocations:[{board:first,role:'hook_cover',weight:.5,synthetic_query:'Curso',rationale:'teste'},{board:second,role:'structural_grid',weight:.5,synthetic_query:'Curso',rationale:'teste'}],required_sid_tags:[],excluded_sid_tags:['glassmorphism_ui']});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){
    const board=q.source.allowed_boards_or_queries[0], mechanic=board===first?'swiss_grid':'glassmorphism_ui';
    const text=`carousel_editorial_4:5 ${mechanic} bold_display_hook tactile_paper_texture`;
    return [{source_id:q.source.source_id,raw_title:text,raw_caption:text,origin_url:'https://www.pinterest.com/pin/123456/',preview_url:`https://i.pinimg.com/236x/${board.replaceAll('/','_')}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}];
  }};
  const server=createComporServer({phoenixActorId:'exclusion-owner',phoenixHyperparams:hp,phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'dedup-exclusion-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const result=await client.callTool({name:'discover_visual_references',arguments:{briefing:'Curso fictício',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    const data=result.structuredContent;
    assert.equal(data.decision_score_batch.requested,2);assert.equal(data.telemetry.total_candidate_occurrences,2);
    assert.equal(data.telemetry.total_candidates_filtered,1);assert.equal(data.candidates.length,1);assert.equal(data.candidates[0].board,first);
    assert.equal(data.can_proceed_without_references,true);
  } finally {await client.close();await server.close();}
});

test('same pin retains distinct image bytes, missing or malformed previews and different ranker metadata',async()=>{
  const hp=createPhoenixHyperparams({top_n_results:20}), requests=[];
  const api={decisions:{create:async request=>{requests.push(request);return {model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))};}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  const first='kittldesign/poster-design',second='behance/typography';
  service.routeBoards=async()=>({board_allocations:[{board:first,role:'hook_cover',weight:.5,synthetic_query:'Curso',rationale:'teste'},{board:second,role:'structural_grid',weight:.5,synthetic_query:'Curso',rationale:'teste'}],required_sid_tags:[],excluded_sid_tags:[]});
  const changed=Buffer.from(PNG64,'base64');changed[35]^=1;const other=changed.toString('base64');
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){
    if(q.source.allowed_boards_or_queries[0]!==first)return [];
    return [{image:PNG64,title:'Mesmo'}, {image:PNG64,title:'Mesmo'}, {image:other,title:'Mesmo'}, {image:null,title:'Mesmo'}, {image:null,title:'Mesmo'}, {image:PNG64,title:'Outro texto'}, {image:'AAAA',title:'Mesmo'}].map((x,i)=>({source_id:q.source.source_id,raw_title:x.title,raw_caption:'texto',origin_url:'https://www.pinterest.com/pin/123456/',preview_url:`https://i.pinimg.com/236x/variant_${i}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:x.image,thumbnail_mime_type:'image/png'}));
  }};
  const server=createComporServer({phoenixActorId:'variant-owner',phoenixHyperparams:hp,phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'variant-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const r=await client.callTool({name:'discover_visual_references',arguments:{briefing:'Curso fictício',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true}});
    assert.notEqual(r.isError,true,JSON.stringify(r));const d=r.structuredContent;
    assert.equal(d.telemetry.total_candidate_occurrences,7);assert.equal(d.telemetry.total_candidates_retrieved,6);assert.equal(d.decision_score_batch.requested,6);
    assert.equal(requests.reduce((n,r)=>n+r.questions.length,0),6);
    assert.equal(d.candidates.filter(c=>c.provenance_occurrences.length===2).length,1);
    assert.equal(d.candidates.filter(c=>c.provenance_occurrences[0].preview_sha256===null).length,3);
    const hashes=new Set(d.candidates.flatMap(c=>c.provenance_occurrences.map(o=>o.preview_sha256)).filter(Boolean));assert.equal(hashes.size,2);
  } finally {await client.close();await server.close();}
});
