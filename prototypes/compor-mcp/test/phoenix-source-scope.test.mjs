import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadSourcesCatalog } from '../dist/catalog/catalog.js';
import { CuratedPinterestProvider } from '../dist/providers/curated_pinterest.js';
import { createComporServer } from '../dist/server.js';

const makeQuery = async (allowed) => {
  const catalog = await loadSourcesCatalog();
  const source = catalog.sources.find(s => s.source_id === 'pinterest_curated_photography');
  return { briefing_summary:'aquarela botânica', target_format:'instagram_post', aspect_focus:['composition'], source:{...source, allowed_boards_or_queries:allowed}, limit:3 };
};
const rss = `<?xml version="1.0"?><rss><channel><item><title>Botanical reference</title><link>https://www.pinterest.com/pin/98765/</link><description>&lt;img src="https://i.pinimg.com/236x/test.jpg"&gt;botanical</description></item></channel></rss>`;
const stub = calls => async input => {
  const url = String(input); calls.push(url);
  if (url.includes('BaseSearchResource')) return new Response('Forbidden',{status:403});
  if (url.endsWith('/behance/illustration.rss')) return new Response('Not found',{status:404});
  if (url.endsWith('/behance/feed.rss')) return new Response(rss,{status:200,headers:{'content-type':'application/rss+xml'}});
  if (url.includes('i.pinimg.com')) return new Response('No thumbnail',{status:404});
  throw new Error(`Unexpected request: ${url}`);
};

test('a failed board cannot silently expand to an unapproved account-wide feed', async () => {
  const calls=[]; const provider = new CuratedPinterestProvider({sourceId:'pinterest_curated_photography',fetchFn:stub(calls)});
  await assert.rejects(provider.searchMetadataOnly(await makeQuery(['behance/illustration'])), /403/);
  assert.ok(calls.some(url=>url.endsWith('/behance/illustration.rss')));
  assert.ok(!calls.some(url=>url.endsWith('/behance/feed.rss')));
});

test('the account-wide feed may be tried when it is explicitly in the source scope', async () => {
  const calls=[]; const provider = new CuratedPinterestProvider({sourceId:'pinterest_curated_photography',fetchFn:stub(calls)});
  const found=await provider.searchMetadataOnly(await makeQuery(['behance/illustration','behance/feed']));
  assert.ok(calls.some(url=>url.endsWith('/behance/illustration.rss')));
  assert.ok(calls.some(url=>url.endsWith('/behance/feed.rss')));
  assert.equal(found.length,1);assert.equal(found[0].origin_url,'https://www.pinterest.com/pin/98765/');
});

test('MCP reports unavailable sources and permits proceeding without references when the scoped board fails', async () => {
  const calls=[];const query=await makeQuery(['behance/illustration']);
  const catalog=await loadSourcesCatalog();catalog.sources=[query.source];
  const server=createComporServer({catalog,fetchFn:stub(calls)});
  const client=new Client({name:'phoenix-source-scope-test',version:'1'});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const r=await client.callTool({name:'search_curated_references',arguments:{briefing_summary:query.briefing_summary,target_format:query.target_format,aspect_focus:query.aspect_focus,source_ids:[query.source.source_id],consent_external_search:true}});
    assert.equal(r.isError,undefined);assert.equal(r.structuredContent.status,'empty_or_unavailable');
    assert.equal(r.structuredContent.can_proceed_without_references,true);
    assert.deepEqual(r.structuredContent.candidates,[]);
    assert.ok(r.structuredContent.provider_diagnostics.length>0);
    assert.ok(!calls.some(url=>url.endsWith('/behance/feed.rss')));
    const next=await client.callTool({name:'stage_approved_references',arguments:{proceed_without_references:true,selections:[]}});
    assert.equal(next.structuredContent.status,'proceeding_without_references');
  } finally {await client.close();await server.close();}
});

test('Phoenix discovery explains an empty scoped search and retains the no-reference path', async () => {
  const catalog=await loadSourcesCatalog();catalog.sources=catalog.sources.filter(s=>s.source_id==='pinterest_curated_design');
  const empty={sourceId:'pinterest_curated_design',accessMethod:'curated_board_http',async searchMetadataOnly(){return [];}};
  const server=createComporServer({catalog,providers:new Map([['pinterest_curated_design',empty]]),fetchFn:async()=>{throw new Error('unexpected network')}});
  const client=new Client({name:'phoenix-empty-scope-test',version:'1'});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
  try {
    const r=await client.callTool({name:'discover_visual_references',arguments:{briefing:'Curso de aquarela botânica',target_format:'instagram_post',client_mode:'codex',decision_fallback_mode:'deterministic_mock',consent_external_search:true}});
    assert.equal(r.isError,undefined,JSON.stringify(r));
    assert.equal(r.structuredContent.can_proceed_without_references,true);
    assert.deepEqual(r.structuredContent.top_candidates,[]);
    assert.match(r.content[0].text,/nenhuma referência disponível/i);
    assert.match(r.content[0].text,/sem resultados no escopo autorizado/i);
    const next=await client.callTool({name:'stage_approved_references',arguments:{proceed_without_references:true,selections:[]}});
    assert.equal(next.structuredContent.status,'proceeding_without_references');
  } finally {await client.close();await server.close();}
});
