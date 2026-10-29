import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretCategoryLogprobs, rankCandidateWithLogprobs } from '../dist/phoenix_engine/services/logprob_ranker.js';
import { createComporServer } from '../dist/server.js';
import { PhoenixDecisionApiService } from '../dist/phoenix_engine/services/decision_api.js';
import { PhoenixMemoryStore } from '../dist/phoenix_engine/services/memory_store.js';
import { createPhoenixHyperparams } from '../dist/phoenix_engine/config/hyperparams.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { format_mcp_response } from '../dist/phoenix_engine/mcp/dual_adapter.js';

const tokens = [{ token: 'A', logprob: Math.log(.60) }, { token: 'B', logprob: Math.log(.25) }, { token: 'C', logprob: Math.log(.10) }, { token: 'D', logprob: Math.log(.04) }];

test('logprobs require exact category coverage and report uncalibrated conditional mass', () => {
  const result = interpretCategoryLogprobs({ output: 'A', tokens });
  assert.equal(result.status, 'scored');
  assert.equal(result.observed_category_mass, .99);
  assert.equal(result.dominant_category, 'A');
  assert.ok(Math.abs(result.score - ((.60 * 25 + .25 * 10 - .10 * 5 - .04 * 30) / .99)) < .000001);
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: tokens.slice(0, 3) }).reason, 'incomplete_categories');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: [{ token: 'A', logprob: 0 }, { token: 'B', logprob: Math.log(.1) }] }).reason, 'invalid_logprobs');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: [{ token: 'A', logprob: 0 }, { token: 'B', logprob: Math.log(.0000001) }] }).reason, 'incomplete_categories');
  assert.equal(interpretCategoryLogprobs({ output: ' A', tokens }).reason, 'unexpected_output');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: tokens.map(t => ({ ...t, logprob: t.logprob - 5 })) }).reason, 'insufficient_category_mass');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: [...tokens, tokens[0]] }).reason, 'invalid_logprobs');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: [{ token: 'A', logprob: Infinity }] }).reason, 'invalid_logprobs');
  assert.equal(interpretCategoryLogprobs({ output: 'A', tokens: null }).reason, 'invalid_logprobs');
});

function fakeClient(makeChoice = () => ({ message: { content: 'A', refusal: null }, logprobs: { content: [{ token: 'A', top_logprobs: tokens }] } })) {
  const calls = [];
  return { calls, chat: { completions: { create: async (request, options) => {
    calls.push({ request, options });
    return { model: 'gpt-4.1-mini-snapshot', choices: [makeChoice()], usage: { prompt_tokens: 100, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 20 } } };
  } } } };
}

test('API ranker uses one token, exposes actual model and usage, and never turns errors into scores', async () => {
  const client = fakeClient();
  const result = await rankCandidateWithLogprobs({ client, model: 'gpt-4.1-mini', cached_prefix: 'same', candidate_suffix: 'candidate', prompt_cache_key: 'session' });
  assert.equal(result.status, 'scored');
  assert.equal(result.effective_model, 'gpt-4.1-mini-snapshot');
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 1, cached_input_tokens: 20 });
  assert.equal(client.calls[0].request.top_logprobs, 20);
  assert.equal(client.calls[0].request.max_tokens, 1);
  assert.equal(client.calls[0].options.maxRetries, 0);
  assert.ok(result.latency_ms >= 0);
  assert.equal((await rankCandidateWithLogprobs({ client: null, model: 'm', cached_prefix: '', candidate_suffix: '', prompt_cache_key: '' })).reason, 'missing_client');
  const failure = { chat: { completions: { create: async () => { throw new Error('secret-like details never exposed'); } } } };
  const unavailable = await rankCandidateWithLogprobs({ client: failure, model: 'm', cached_prefix: '', candidate_suffix: '', prompt_cache_key: '' });
  assert.equal(unavailable.reason, 'provider_error'); assert.equal(unavailable.score, null);
  assert.doesNotMatch(JSON.stringify(unavailable), /secret-like/);
  const mismatch = fakeClient(() => ({ message: { content: 'A' }, logprobs: { content: [{ token: 'B', top_logprobs: tokens }] } }));
  assert.equal((await rankCandidateWithLogprobs({ client: mismatch, model: 'm', cached_prefix: '', candidate_suffix: '', prompt_cache_key: '' })).reason, 'unexpected_output');
});

test('Luna uses supported logprob parameters and abstains if a category is missing', async () => {
  const client = fakeClient(() => ({ message: { content: 'A' }, logprobs: { content: [{ token: 'A', top_logprobs: tokens.slice(0, 3) }] } }));
  const result = await rankCandidateWithLogprobs({ client, model: 'gpt-6-luna', cached_prefix: 'contexto', candidate_suffix: 'candidato', prompt_cache_key: 'session' });
  assert.equal(client.calls[0].request.top_logprobs, 5);
  assert.equal(client.calls[0].request.reasoning_effort, 'none');
  assert.equal(client.calls[0].request.max_completion_tokens, 16);
  assert.equal(client.calls[0].request.max_tokens, undefined);
  assert.equal(result.reason, 'incomplete_categories');
  assert.equal(result.score, null);
});

test('MCP experimental ranker requires explicit consent and reports every result and abstention without fabricating action scores', async () => {
  const clientApi = fakeClient();
  const hp = createPhoenixHyperparams();
  const service = new PhoenixDecisionApiService({ hp, openaiClient: clientApi, forceDeterministicMock: true });
  const server = createComporServer({ phoenixDecisionService: service });
  const client = new Client({ name: 'logprob-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  const input = { briefing: 'Briefing sintético', target_format: 'carousel', client_mode: 'web', decision_fallback_mode: 'deterministic_mock', ranker_mode: 'logprobs' };
  const call = args => client.callTool({ name: 'discover_visual_references', arguments: args });
  try {
    const blocked = await call(input);
    assert.equal(blocked.isError, true); assert.equal(blocked.structuredContent.code, 'model_consent_required'); assert.equal(clientApi.calls.length, 0);
    const result = await call({ ...input, consent_model: true });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.ranker_mode, 'logprobs');
    assert.equal(result.structuredContent.ranker_abstentions.length, 0);
    assert.equal(result.structuredContent.ranker_evaluations.length, clientApi.calls.length);
    assert.ok(result.structuredContent.candidates.length > 0);
    assert.equal(result.structuredContent.candidates[0].action_probs, null);
    assert.equal(result.structuredContent.candidates[0].logprob_evaluation.usage.cached_input_tokens, 20);
    assert.match(result.structuredContent.candidates[0].composition_guideline, /sem diretriz visual/);
    const markdown = format_mcp_response(result.structuredContent, 'codex');
    assert.match(markdown, /Roteador.*deterministic_mock/);
    assert.match(markdown, /Ranker experimental.*gpt-4\.1-mini-snapshot/);
  } finally { await client.close(); await server.close(); }
});

test('MCP reports an error and each abstention when category coverage is incomplete', async () => {
  const api = fakeClient(() => ({ message: { content: 'A' }, logprobs: { content: [{ token: 'A', top_logprobs: tokens.slice(0, 2) }] } }));
  const service = new PhoenixDecisionApiService({ hp: createPhoenixHyperparams(), openaiClient: api, forceDeterministicMock: true });
  const server = createComporServer({ phoenixDecisionService: service });
  const client = new Client({ name: 'abstain-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const result = await client.callTool({ name: 'discover_visual_references', arguments: { briefing: 'Briefing fictício', target_format: 'carousel', decision_fallback_mode: 'deterministic_mock', ranker_mode: 'logprobs', consent_model: true, client_mode: 'codex' } });
    assert.equal(result.isError, true); assert.equal(result.structuredContent.status, 'ranker_abstained');
    assert.equal(result.structuredContent.ranker_abstentions.length, api.calls.length);
    assert.ok(result.structuredContent.ranker_abstentions.every(item => item.evaluation.reason === 'incomplete_categories' && item.evaluation.score === null));
    assert.equal(result.structuredContent.can_proceed_without_references, true);
  } finally { await client.close(); await server.close(); }
});

test('MCP refuses logprobs without a host client before making a network request', async () => {
  const previous = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const service = new PhoenixDecisionApiService({ hp: createPhoenixHyperparams(), forceDeterministicMock: true });
  const server = createComporServer({ phoenixDecisionService: service });
  const client = new Client({ name: 'missing-key-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const result = await client.callTool({ name: 'discover_visual_references', arguments: { briefing: 'Exemplo', target_format: 'carousel', decision_fallback_mode: 'deterministic_mock', ranker_mode: 'logprobs', consent_model: true } });
    assert.equal(result.isError, true); assert.equal(result.structuredContent.code, 'ranker_client_unavailable');
    assert.equal(result.structuredContent.external_requests_made, 0);
  } finally { await client.close(); await server.close(); if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

test('logprobs evaluates the full retrieved pool while withholding rejected candidates', async () => {
  const hp = createPhoenixHyperparams();
  let count = 0;
  const api = fakeClient(() => ({ message: {content: 'A'}, logprobs: {content: [{token:'A',top_logprobs: ++count % 2 ? tokens : tokens.slice(0,3)}]} }));
  const service = new PhoenixDecisionApiService({hp, openaiClient: api, forceDeterministicMock: true});
  const memory = new PhoenixMemoryStore({hp});
  service.routeBoards = async () => ({board_allocations:[{board:'kittldesign/poster-design',role:'hook_cover',weight:1,synthetic_query:'Curso',rationale:'teste'}],required_sid_tags:[],excluded_sid_tags:[]});
  const provider = {sourceId:'pinterest_curated_design', accessMethod:'curated_board_http', async searchMetadataOnly(query) {
    return Array.from({length:15}, (_, i) => ({source_id:query.source.source_id,raw_title:`Poster ${i}`,raw_caption:'Metadados de teste',origin_url:`https://www.pinterest.com/pin/logprob_${i}/`,preview_url:`https://i.pinimg.com/236x/logprob_${i}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}));
  }};
  const server = createComporServer({phoenixActorId:'logprob-owner',phoenixMemoryStore:memory,phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client = new Client({name:'logprob-full-pool',version:'1'}), [ct,st]=InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  try {
    const args={briefing:'Curso fictício',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'logprobs',logprobs_model:'gpt-6-luna',consent_model:true,consent_external_search:true};
    const initial=await client.callTool({name:'discover_visual_references',arguments:args});
    assert.notEqual(initial.isError,true,JSON.stringify(initial));
    const rejected=initial.structuredContent.candidates[0];
    const feedback=await client.callTool({name:'record_visual_feedback',arguments:{candidate_id:rejected.candidate_id,board:rejected.board,metadata_sid:rejected.metadata_sid,action:'discard_generic',event_id:'logprob-reject-1',client_mode:'web'}});
    assert.notEqual(feedback.isError,true,JSON.stringify(feedback));
    api.calls.length=0;
    const result=await client.callTool({name:'discover_visual_references',arguments:args});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    assert.equal(result.structuredContent.telemetry.total_candidates_retrieved,15);
    assert.equal(result.structuredContent.telemetry.total_candidates_evaluated,15);
    assert.equal(result.structuredContent.ranker_evaluations.length,15);
    assert.equal(api.calls.length,15);
    assert.equal(result.structuredContent.ranker_abstentions.length,8);
    assert.equal(result.structuredContent.telemetry.total_candidates_filtered,1);
    assert.ok(result.structuredContent.candidates.every(c=>c.origin_url!==rejected.origin_url));
    assert.ok(api.calls.every(c=>c.request.model==='gpt-6-luna'));
  } finally {await client.close();await server.close();}
});

test('MCP bounds concurrent logprob requests, evaluates the full pool and reports provider failures', async () => {
  const hp=createPhoenixHyperparams(); let active=0, peak=0, calls=0; const requestIds=[];
  const api={chat:{completions:{create:async request=>{
    const id=++calls; active++;peak=Math.max(peak,active);
    requestIds.push(request.messages[1].content.match(/\nID: ([^\n]+)/)[1]);
    try {
      await new Promise(resolve=>setTimeout(resolve,id%3===0?3:8));
      if (id===3 || id===12) throw new Error('simulated provider failure');
      return {model:request.model,choices:[{message:{content:'A',refusal:null},logprobs:{content:[{token:'A',top_logprobs:tokens}]}}],usage:{prompt_tokens:100,completion_tokens:1}};
    } finally {active--;}
  }}}};
  const service=new PhoenixDecisionApiService({hp,openaiClient:api,forceDeterministicMock:true});
  service.routeBoards=async()=>({board_allocations:[{board:'kittldesign/poster-design',role:'hook_cover',weight:1,synthetic_query:'Curso',rationale:'teste'}],required_sid_tags:[],excluded_sid_tags:[]});
  const provider={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(q){return Array.from({length:15},(_,i)=>({source_id:q.source.source_id,raw_title:`Poster ${i}`,raw_caption:'Fixture',origin_url:`https://www.pinterest.com/pin/bounded_${i}/`,preview_url:`https://i.pinimg.com/236x/bounded_${i}.jpg`,aspect_rationale:{composition:'unknown'},thumbnail_base64:null,thumbnail_mime_type:null}));}};
  const server=createComporServer({phoenixDecisionService:service,providers:new Map([['pinterest_curated_design',provider]])});
  const client=new Client({name:'logprob-bounded',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const result=await client.callTool({name:'discover_visual_references',arguments:{briefing:'Curso fictício',target_format:'instagram_post',client_mode:'web',decision_fallback_mode:'deterministic_mock',ranker_mode:'logprobs',logprobs_model:'gpt-6-luna',consent_model:true,consent_external_search:true}});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    assert.equal(calls,15);assert.equal(peak,4);assert.equal(active,0);
    assert.equal(result.structuredContent.telemetry.total_candidates_retrieved,15);
    assert.equal(result.structuredContent.telemetry.total_candidates_evaluated,15);
    assert.equal(result.structuredContent.ranker_evaluations.length,15);
    assert.deepEqual(result.structuredContent.ranker_evaluations.map(x=>x.candidate_id),requestIds);
    assert.equal(result.structuredContent.ranker_abstentions.length,2);
    assert.ok(result.structuredContent.ranker_abstentions.every(x=>x.evaluation.reason==='provider_error'&&x.evaluation.score===null));
    assert.equal(new Set(result.structuredContent.ranker_evaluations.map(x=>x.candidate_id)).size,15);
  } finally {await client.close();await server.close();}
});
