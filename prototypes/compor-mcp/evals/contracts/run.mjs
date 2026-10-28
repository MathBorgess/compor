/** Frozen contract cases from wave-1 observations; no model, user or production data. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../../dist/server.js';

const label = process.argv[2];
if (!['baseline', 'candidate'].includes(label)) throw new Error('Usage: node evals/contracts/run.mjs baseline|candidate');
const output = new URL(`${label}.json`, import.meta.url);
try { await readFile(output); throw new Error('Evidence file already exists; preserve it and use a new experiment.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sha = data => createHash('sha256').update(data).digest('hex');
const piece = {
  piece_id: 'piece-a', version: 'v1', width_px: 640, height_px: 800,
  layers: [{ id: 'price', name: 'Price', kind: 'text', z_index: 1,
    rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, text: 'R$ 99' }],
};
const background = { id: 'background', name: 'Background', kind: 'image', z_index: 0,
  rect: { x: 0, y: 0, width: 1, height: 1 }, asset_ref: 'asset-1' };
const annotate = (p, target, extra = {}) => ({ piece: p, annotations: [
  { id: 'a1', piece_version: 'v1', target, note: 'mude isso', ...extra },
] });
const cases = [
  {
    id: 'moodboard_outside_normalized_canvas',
    expectation: 'Reject an unrotated box extending outside normalized canvas; do not silently clip it.',
    calls: [{ name: 'prepare_moodboard', arguments: { board_id: 'board-1', board_version: 'v1', direction: 'fictitious',
      elements: [{ id: 'shape-1', kind: 'shape', intent: 'keep', value: 'circle', geometry: { x: 0.95, y: 0.95, width: 0.5, height: 0.5 } }] } }],
    check: results => results[0].isError === true,
  },
  {
    id: 'area_target_resolution',
    expectation: 'No intersecting layer is unresolved; two candidates are ambiguous and must not become a silently chosen layer.',
    calls: [
      { name: 'prepare_annotation_context', arguments: annotate(piece, { kind: 'area', rect: { x: 0.8, y: 0.8, width: 0.1, height: 0.1 } }) },
      { name: 'prepare_annotation_context', arguments: annotate({ ...piece, layers: [background, ...piece.layers] }, { kind: 'area', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } }) },
    ],
    check: results => {
      const a = results[0].structuredContent?.annotations[0], b = results[1].structuredContent?.annotations[0];
      return a?.selection_status === 'unresolved' && a.candidate_layer_ids.length === 0 &&
        b?.selection_status === 'ambiguous_candidates' && b.candidate_layer_ids.length === 2;
    },
  },
  {
    id: 'image_layer_without_asset',
    expectation: 'Preserve an incomplete image placeholder with an explicit missing-asset warning, not a valid resolved asset.',
    calls: [{ name: 'prepare_layered_creative', arguments: { piece: { ...piece,
      layers: [{ id: 'image-1', name: 'Image', kind: 'image', z_index: 0, rect: { x: 0, y: 0, width: 1, height: 1 } }] } } }],
    check: results => !results[0].isError && results[0].structuredContent?.warnings?.some(w => w.code === 'image_asset_missing' && w.layer_id === 'image-1'),
  },
  {
    id: 'unbounded_word_weight',
    expectation: 'Reject numeric magnitude above Number.MAX_SAFE_INTEGER as a technical envelope, without assigning a semantic scale.',
    calls: [{ name: 'prepare_word_cloud', arguments: { words: [{ word: 'x', chosen_weight: 1e308 }] } }],
    check: results => results[0].isError === true,
  },
  {
    id: 'product_scope_requires_verified_confirmation',
    expectation: 'A product-scope claim always requires external verified confirmation; missing product context is explicit; no memory update.',
    calls: [
      { name: 'prepare_annotation_context', arguments: annotate(piece, { kind: 'layer', layer_id: 'price' }, { memory_scope_claim: 'product' }) },
      { name: 'prepare_annotation_context', arguments: annotate({ ...piece, product_ref: 'product-1' }, { kind: 'layer', layer_id: 'price' }, { memory_scope_claim: 'product' }) },
    ],
    check: results => results.every(r => r.structuredContent?.annotations[0].memory_scope_status === 'requires_verified_confirmation' &&
        r.structuredContent.updates_memory === false && r.structuredContent.scope_claims_verified === false) &&
      results[0].structuredContent.annotations[0].warnings.some(w => w.code === 'product_context_missing'),
  },
];

const server = createComporServer();
const client = new Client({ name: 'contract-evaluation', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
let unexpectedFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { unexpectedFetchCalls++; throw new Error('Network disabled in contract evaluation'); };
const records = [];
try {
  await server.connect(serverTransport); await client.connect(clientTransport);
  for (const item of cases) {
    const results = [];
    for (const call of item.calls) results.push(await client.callTool(call));
    records.push({ id: item.id, expectation: item.expectation, calls: item.calls, results, passed: Boolean(item.check(results)) });
  }
} finally { await client.close(); await server.close(); globalThis.fetch = originalFetch; }
const evidence = {
  label, recorded_at: new Date().toISOString(), runtime: process.version,
  mode: 'synthetic_real_mcp_calls_no_model_no_user_data',
  server_source_sha256: sha(await readFile(new URL('../../src/server.ts', import.meta.url))),
  server_build_sha256: sha(await readFile(new URL('../../dist/server.js', import.meta.url))),
  runner_sha256: sha(await readFile(new URL('./run.mjs', import.meta.url))),
  unexpected_fetch_calls: unexpectedFetchCalls,
  summary: { passed: records.filter(r => r.passed).length, total: records.length }, cases: records,
};
await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ label, ...evidence.summary, runner_sha256: evidence.runner_sha256, unexpectedFetchCalls }));
if (evidence.summary.passed !== records.length || unexpectedFetchCalls) process.exitCode = 1;
