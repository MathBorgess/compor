import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createComporServer } from '../dist/server.js';
import { parseGuidanceVariant } from '../dist/guidance.js';

// Captured by transpiling `git show 7773b26:prototypes/compor-mcp/src/server.ts`
// in isolation and calling listTools through the real MCP client/transport.
// PR #8 commit: 7773b26dfaff7d1bdbc553882f000b31274cd26e
// Source SHA-256: fbb3b2ca38ff0c311e89ed01629d0f105cc375a9865ca3fe74936529f5f71b23
// SDK 1.32.2, Zod 4.6.7; no checkout or fixtures modified to capture it.
const pr8CatalogSha256 = 'a2b915c3763371b69f373f3aafb9428b8803914f6c74522a3931ea5b09754031';
const cwd = fileURLToPath(new URL('..', import.meta.url));

async function connect(options) {
  const server = createComporServer(options);
  const client = new Client({ name: 'guidance-contract-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

function withoutHelp(value) {
  if (Array.isArray(value)) return value.map(withoutHelp);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'description' && key !== 'examples')
    .map(([key, item]) => [key, withoutHelp(item)]));
}

test('default and explicit baseline retain the frozen PR #8 tools/list catalog, including after E1', async () => {
  const connections = [];
  try {
    for (const options of [undefined, { guidance: 'guided_v1' }, { guidance: 'baseline' }, undefined]) {
      const connection = await connect(options);
      connections.push(connection);
      const catalog = await connection.client.listTools();
      if (options?.guidance !== 'guided_v1') {
        assert.equal(createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), pr8CatalogSha256);
      }
    }
  } finally { for (const connection of connections) await connection.close(); }
});

test('E1 changes only descriptions/examples in tools/list and exposes nested field guidance', async () => {
  const baseline = await connect();
  const guided = await connect({ guidance: 'guided_v1' });
  try {
    const original = await baseline.client.listTools();
    const candidate = await guided.client.listTools();
    assert.deepEqual(withoutHelp(candidate), withoutHelp(original));
    for (const tool of candidate.tools) {
      assert.ok(tool.description.startsWith(original.tools.find(t => t.name === tool.name).description));
      assert.notEqual(tool.description, original.tools.find(t => t.name === tool.name).description);
    }
    const tools = Object.fromEntries(candidate.tools.map(tool => [tool.name, tool]));
    assert.match(tools.list_skills.description, /apenas a skill necessária/);
    assert.match(tools.prepare_word_cloud.inputSchema.properties.words.items.properties.chosen_weight.description, /explicitamente/);
    assert.match(tools.prepare_moodboard.inputSchema.properties.elements.items.properties.asset_ref.description, /não invente/i);
    const annotations = tools.prepare_annotation_context.inputSchema.properties.annotations.items.properties;
    assert.match(annotations.memory_scope_claim.description, /confirmação verificada/);
    assert.match(annotations.target.description, /ambiguidade/);
    assert.deepEqual(guided.client.getServerCapabilities(), baseline.client.getServerCapabilities());
    assert.deepEqual(guided.client.getServerVersion(), baseline.client.getServerVersion());
  } finally { await baseline.close(); await guided.close(); }
});

test('generic examples delivered in E1 are valid under both unchanged tool contracts', async () => {
  const baseline = await connect();
  const guided = await connect({ guidance: 'guided_v1' });
  try {
    const { tools } = await guided.client.listTools();
    const schemas = Object.fromEntries(tools.map(tool => [tool.name, tool.inputSchema.properties]));
    const piece = schemas.prepare_layered_creative.piece.examples[0];
    const examples = [
      ['prepare_word_cloud', { words: schemas.prepare_word_cloud.words.examples[0] }],
      ['prepare_moodboard', { board_id: 'proposta_1', board_version: 'v1', direction: 'Proposta visual', elements: schemas.prepare_moodboard.elements.examples[0] }],
      ['prepare_layered_creative', { piece }],
      ['prepare_annotation_context', { piece, annotations: schemas.prepare_annotation_context.annotations.examples[0] }],
    ];
    for (const [name, args] of examples) {
      const result = await baseline.client.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, name);
      assert.deepEqual(await guided.client.callTool({ name, arguments: args }), result, name);
    }
  } finally { await baseline.close(); await guided.close(); }
});

const rect = { x: 0.1, y: 0.1, width: 0.4, height: 0.2 };
const piece = {
  piece_id: 'draft_1', version: 'v2', width_px: 1000, height_px: 1000,
  layers: [
    { id: 'title', kind: 'text', name: 'Proposta de título', z_index: 2, rect, text: 'Texto proposto', font_ref: 'font_supplied', font_weight: 400, line_height: 1.2, text_align: 'left' },
    { id: 'image', kind: 'image', name: 'Imagem proposta sem ativo', z_index: 1, rect },
    { id: 'shape', kind: 'shape', name: 'Forma proposta', z_index: 0, rect: { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }, shape: 'ellipse', fill_hex: '#445566' },
  ],
};
const board = { board_id: 'proposal', board_version: 'v1', direction: 'Proposta', elements: [] };
const annotation = { id: 'note_1', piece_version: 'v2', target: { kind: 'layer', layer_id: 'title' }, note: 'Revisar contraste proposto' };

test('E0/E1 return identical results and errors for valid, boundary and invalid inputs without network calls', async () => {
  const baseline = await connect();
  const guided = await connect({ guidance: 'guided_v1' });
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('unexpected network call'); };
  const cases = [];
  const add = (name, args, error = false) => cases.push({ name, arguments: args, error });
  add('list_skills', {});
  for (const id of ['entender-intencao', 'traduzir-direcao', 'explorar-moodboards', 'criar-piloto']) add('load_skill', { id, version: '0.1.0-prototype' });
  for (const args of [{ id: '../file' }, { id: 'entender-intencao', version: 'v0' }, { id: 4 }, {}]) add('load_skill', args, true);
  add('prepare_word_cloud', { words: [{ word: ' zero ', frequency: 2, suggested_weight: 3, chosen_weight: 0 }, { word: 'sugestão', suggested_weight: 0.5 }, { word: 'contagem', frequency: 2 }, { word: 'ausente' }] });
  for (const words of [[], [{ word: '' }], [{ word: 'a', frequency: 1.5 }], [{ word: 'a', suggested_weight: -1 }], [{ word: 'a', chosen_weight: '1' }], [{ word: 'a', extra: true }]]) add('prepare_word_cloud', { words }, true);
  add('prepare_moodboard', board);
  add('prepare_moodboard', { ...board, elements: [
    { id: 'ref', kind: 'reference', asset_ref: 'supplied_asset', label: 'rótulo sem significado', intent: 'inspire' },
    { id: 'cue', kind: 'color', value: '#445566', aspects: ['color'], intent: 'keep', priority: 0, origin_claim: 'proposta', geometry: { ...rect, rotation: 30 } },
    { id: 'other', kind: 'color', value: '#445566', aspects: ['color'], intent: 'avoid' },
    { id: 'empty', kind: 'shape', intent: 'vary' },
  ], restrictions: [{ aspect: 'color', value: '#445566', rule: 'must_keep' }, { aspect: 'color', value: '#445566', rule: 'must_avoid' }] });
  for (const elements of [
    [{ id: 'ref', kind: 'reference', intent: 'inspire' }],
    [{ id: 'cue', kind: 'color', asset_ref: 'asset', intent: 'inspire' }],
    [{ id: 'same', kind: 'color', intent: 'inspire' }, { id: 'same', kind: 'text', intent: 'vary' }],
    [{ id: 'shape', kind: 'shape', intent: 'keep', geometry: { x: 0.9, y: 0, width: 0.2, height: 1 } }],
    [{ id: 'cue', kind: 'color', intent: 'keep', priority: 1001 }],
  ]) add('prepare_moodboard', { ...board, elements }, true);
  add('prepare_layered_creative', { piece });
  add('prepare_layered_creative', { piece: { ...piece, product_ref: null, campaign_ref: 'campaign_supplied', variation_ref: null } });
  for (const badPiece of [
    { ...piece, layers: [] },
    { ...piece, layers: [piece.layers[0], { ...piece.layers[1], id: 'title' }] },
    { ...piece, layers: [piece.layers[0], { ...piece.layers[1], z_index: 2 }] },
    { ...piece, layers: [{ ...piece.layers[0], rect: { x: 0.9, y: 0, width: 0.2, height: 1 } }] },
    { ...piece, layers: [{ ...piece.layers[0], font_weight: 1000 }] },
    { ...piece, layers: [{ ...piece.layers[0], extra: true }] },
    { ...piece, width_px: 0 },
  ]) {
    add('prepare_layered_creative', { piece: badPiece }, true);
    add('prepare_annotation_context', { piece: badPiece, annotations: [annotation] }, true);
  }
  add('prepare_annotation_context', { piece, annotations: [annotation] });
  for (const area of [rect, { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }, { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }]) {
    add('prepare_annotation_context', { piece, annotations: [{ ...annotation, target: { kind: 'area', rect: area } }] });
  }
  for (const memory_scope_claim of ['task', 'campaign', 'product']) add('prepare_annotation_context', { piece, annotations: [{ ...annotation, memory_scope_claim, edit_scope_claim: 'layer' }] });
  add('prepare_annotation_context', { piece: { ...piece, product_ref: 'product_supplied' }, annotations: [{ ...annotation, memory_scope_claim: 'product' }] });
  for (const annotations of [
    [], [annotation, annotation], [{ ...annotation, piece_version: 'v1' }],
    [{ ...annotation, target: { kind: 'layer', layer_id: 'missing' } }],
    [{ ...annotation, target: { kind: 'area', rect: { x: 0, y: 0, width: 0, height: 1 } } }],
    [{ ...annotation, memory_scope_claim: 'global' }],
    [{ ...annotation, user_confirmed: true }], [{ ...annotation, note: ' ' }],
  ]) add('prepare_annotation_context', { piece, annotations }, true);
  add('generate_image', {}, true);
  try {
    for (const [index, { error, ...request }] of cases.entries()) {
      const original = await baseline.client.callTool(request);
      const candidate = await guided.client.callTool(request);
      assert.equal(Boolean(original.isError), error, `${index}: ${request.name} expected outcome`);
      assert.deepEqual(candidate, original, `${index}: ${request.name} output parity`);
    }
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = originalFetch; await baseline.close(); await guided.close(); }
});

test('stdio host selects E1 explicitly; unset and baseline still expose the frozen baseline', async () => {
  const guided = await connect({ guidance: 'guided_v1' });
  try {
    // Stdio serializes JSON, dropping SDK fields whose value is undefined.
    const expectedGuided = JSON.parse(JSON.stringify(await guided.client.listTools()));
    for (const setting of [undefined, 'baseline', 'guided_v1']) {
      const client = new Client({ name: 'guidance-stdio-test', version: '1' });
      const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/stdio.js'], cwd, env: setting ? { COMPOR_MCP_GUIDANCE: setting } : {}, stderr: 'pipe' });
      try {
        await client.connect(transport);
        const catalog = await client.listTools();
        if (setting === 'guided_v1') assert.deepEqual(catalog, expectedGuided);
        else assert.equal(createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), pr8CatalogSha256);
      } finally { await client.close(); }
    }
  } finally { await guided.close(); }
});

test('unsupported host variant fails before stdio negotiation rather than silently mixing arms', () => {
  for (const value of [undefined, '', 'baseline']) assert.equal(parseGuidanceVariant(value), 'baseline');
  assert.equal(parseGuidanceVariant('guided_v1'), 'guided_v1');
  assert.throws(() => parseGuidanceVariant('guided_v2'), /deve ser baseline ou guided_v1/);
  const result = spawnSync(process.execPath, ['dist/stdio.js'], { cwd, env: { ...process.env, COMPOR_MCP_GUIDANCE: 'guided_v2' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /deve ser baseline ou guided_v1/);
});
