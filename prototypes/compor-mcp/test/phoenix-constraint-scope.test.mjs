import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { PhoenixMemoryStore } from '../dist/phoenix_engine/services/memory_store.js';
import { format_mcp_response } from '../dist/phoenix_engine/mcp/dual_adapter.js';

const hp=createPhoenixHyperparams();
const allocation=[{board:'kittldesign/poster-design',role:'hook_cover',weight:.5,synthetic_query:'Curso de fotografia',rationale:'teste'},{board:'behance/typography',role:'structural_grid',weight:.5,synthetic_query:'Curso de fotografia',rationale:'teste'}];
const usage={input_tokens:10,output_tokens:0,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens_details:{reasoning_tokens:0},total_tokens:10};
const probabilities=[.1,.2,.3,.4].map((probability,value)=>({value,label:['incompatível','limitada','útil','muito útil'][value],probability}));
const api={decisions:{create:async request=>({model:'gpt-6-luna',usage,answers:request.questions.map(q=>({name:q.name,type:'score',score:2,confidence:.8,probabilities}))})}};

test('router contract separates piece interpretation from reference exclusions and keeps profile negatives',async()=>{
  let seen;
  const quote='ainda não defini preço';
  const reply={board_allocations:allocation,required_sid_tags:[],excluded_sid_tags:['glassmorphism_ui'],piece_constraints:[{interpretation:'Não inventar preço na peça',evidence_quote:quote}]};
  const stub={responses:{create:async request=>{seen=request;return {output_text:JSON.stringify(reply)}}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:stub});
  const result=await service.routeBoards({user_id:'fixture',briefing:`Curso de fotografia, ${quote}`,target_format:'instagram_post',user_taste:{user_id:'fixture',preferred_boards_by_goal:{},visual_dna_rules:[],negative_constraints:['neon'],updated_at:new Date().toISOString()},board_affinities:[],board_affinity_table:'',session_events_summary:'',source:'openai_api'});
  assert.deepEqual(result.piece_constraints,reply.piece_constraints);
  assert.deepEqual(result.excluded_sid_tags,['glassmorphism_ui','neon']);
  assert.deepEqual(result.router_excluded_sid_tags,['glassmorphism_ui']);
  assert.ok(seen.text.format.schema.required.includes('piece_constraints'));
  assert.match(seen.input[0].content,/não quero preço nas referências/);
  assert.match(seen.input[0].content,/Em caso de dúvida/);
});

test('MCP keeps piece limits separate and conservatively blocks visual, unknown, and old exclusions',async()=>{
  const memory=new PhoenixMemoryStore({hp});let route;
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  service.routeBoards=async()=>route;
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){return [{source_id:q.source.source_id,raw_title:'Fotografia',raw_caption:'Descrição sem classe visual',origin_url:`https://www.pinterest.com/pin/${q.source.allowed_boards_or_queries[0].startsWith('kittl')?'123456':'789123'}/`,preview_url:'https://i.pinimg.com/236x/example.jpg',aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}];}};
  const server=createComporServer({phoenixActorId:'scope-owner',phoenixHyperparams:hp,phoenixMemoryStore:memory,phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'scope-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  const base={target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'decision_score',consent_external_search:true,consent_model:true};
  const call=async briefing=>{const r=await client.callTool({name:'discover_visual_references',arguments:{...base,briefing}});assert.notEqual(r.isError,true,JSON.stringify(r));return r.structuredContent;};
  const piece={interpretation:'Não inventar preço na peça',evidence_quote:'ainda não defini preço'};
  try {
    route={board_allocations:allocation,required_sid_tags:[],excluded_sid_tags:[],piece_constraints:[piece]};
    const out=await call('Tenho ideia de curso e ainda não defini preço.');
    assert.equal(out.candidates.length,2);assert.equal(out.telemetry.total_candidates_filtered,0);
    assert.deepEqual(out.piece_constraints,[{...piece,scope:'piece',source:'router_interpretation'}]);
    assert.match(format_mcp_response(out,'codex'),/interpretação do roteador/);
    route={...route,excluded_sid_tags:['price'],piece_constraints:[]};
    const visual=await call('Não quero preço nas referências.');assert.equal(visual.candidates.length,0);assert.deepEqual(visual.excluded_sid_tags,['price']);assert.deepEqual(visual.reference_exclusions,[{tag:'price',source:'legacy_or_unknown'}]);
    route={...route,excluded_sid_tags:['unrecognized_visual_style']};
    const unknown=await call('Não quero esse estilo nas referências.');assert.equal(unknown.candidates.length,0);assert.deepEqual(unknown.excluded_sid_tags,['unrecognized_visual_style']);
    route={...route,excluded_sid_tags:['price'],piece_constraints:[piece]};
    const both=await call('Ainda não defini preço; não quero preço nas referências.');
    assert.equal(both.candidates.length,0);assert.equal(both.piece_constraints.length,1);assert.equal(both.piece_constraints[0].evidence_quote,null,'non-verbatim quote must not be attributed to the person');
    route={board_allocations:allocation,required_sid_tags:[],excluded_sid_tags:['price']};
    const old=await call('ainda não defini preço');assert.equal(old.candidates.length,0,'legacy router output is never silently relaxed');
    route={...route,excluded_sid_tags:[],piece_constraints:[piece]};memory.setLongTermTaste('scope-owner',{negative_constraints:['neon']});
    const profile=await call('ainda não defini preço');assert.equal(profile.candidates.length,0);assert.deepEqual(profile.excluded_sid_tags,['neon']);assert.deepEqual(profile.reference_exclusions,[{tag:'neon',source:'taste_memory_unspecified'}]);
  } finally {await client.close();await server.close();}
});
