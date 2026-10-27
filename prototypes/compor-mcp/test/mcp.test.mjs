import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHash } from 'node:crypto';
import { createComporServer } from '../dist/server.js';
import { fileURLToPath } from 'node:url';

const expectedIds = ['entender-intencao', 'traduzir-direcao', 'explorar-moodboards', 'criar-piloto'];

async function checkCatalog(client) {
  const capabilities = client.getServerCapabilities();
  assert.ok(capabilities?.tools, 'handshake announces tools');
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['list_skills', 'load_skill', 'prepare_word_cloud']);
  const listing = await client.callTool({ name: 'list_skills', arguments: {} });
  assert.equal(listing.isError, undefined);
  const catalog = listing.structuredContent.skills;
  assert.deepEqual(catalog.map(s => s.id), expectedIds);
  assert.ok(catalog.every(s => s.version === '0.1.0-prototype' && s.description));
  for (const entry of catalog) {
    const loaded = await client.callTool({ name: 'load_skill', arguments: { id: entry.id, version: entry.version } });
    assert.equal(loaded.isError, undefined);
    assert.equal(loaded.structuredContent.id, entry.id);
    assert.equal(loaded.structuredContent.version, entry.version);
    assert.ok(loaded.structuredContent.instructions.length > 200);
    assert.match(loaded.structuredContent.instructions, /revis[aá]ve|permiss|autoriza/i);
    assert.equal(loaded.structuredContent.contentSha256, createHash('sha256').update(loaded.structuredContent.instructions, 'utf8').digest('hex'));
  }
  const cloud = await client.callTool({ name: 'prepare_word_cloud', arguments: { words: [{ word: 'acolhimento', frequency: 2 }] } });
  assert.equal(cloud.isError, undefined);
  assert.equal(cloud.structuredContent.words[0].effective_weight, 2);
  assert.equal(cloud.structuredContent.words[0].effective_source, 'client_supplied_frequency');
  assert.equal(cloud.structuredContent.creates_confirmed_preference, false);
}

async function inMemory() {
  const server = createComporServer();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

test('negotiates MCP in process; lists tools and loads all skills without a network fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('unexpected network request'); };
  let connection;
  try {
    connection = await inMemory();
    await checkCatalog(connection.client);
    assert.equal(fetchCalls, 0);
  } finally {
    if (connection) { await connection.client.close(); await connection.server.close(); }
    globalThis.fetch = originalFetch;
  }
});

test('rejects unknown versions, paths and malformed arguments without revealing files', async () => {
  const { server, client } = await inMemory();
  try {
    for (const args of [
      { id: '../package.json' },
      { id: 'entender-intencao', version: 'not-a-version' },
      { id: '' },
      { id: 123 },
    ]) {
      const result = await client.callTool({ name: 'load_skill', arguments: args });
      assert.equal(result.isError, true);
      const text = JSON.stringify(result);
      assert.doesNotMatch(text, /node_modules|\/Users\/|dependencies|stack/i);
    }
    const missing = await client.callTool({ name: 'generate_image', arguments: {} });
    assert.equal(missing.isError, true);
  } finally { await client.close(); await server.close(); }
});

test('stdio child process negotiates MCP and exposes the same catalog to a harness', async () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio.js'],
    cwd,
    env: {},
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test-harness', version: '1.0.0' });
  try {
    await client.connect(transport);
    await checkCatalog(client);
    assert.ok(transport.pid);
  } finally { await client.close(); }
});

test('Agents SDK connects and calls MCP via Streamable HTTP in process without OpenAI or network', async () => {
  const originalFetch = globalThis.fetch;
  let unexpectedFetch = 0;
  globalThis.fetch = async () => { unexpectedFetch++; throw new Error('unexpected network request'); };
  process.env.OPENAI_AGENTS_DISABLE_TRACING = '1';
  const { MCPServerStreamableHttp } = await import('@openai/agents');
  const { fetchInProcess } = await import('../dist/inprocess-http.js');
  let requests = 0;
  const server = new MCPServerStreamableHttp({
    name: 'compor-local',
    url: 'https://compor.invalid/mcp',
    fetch: async (input, init) => { requests++; return fetchInProcess(input, init); },
    cacheToolsList: false,
  });
  try {
    await server.connect();
    const tools = await server.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['list_skills', 'load_skill', 'prepare_word_cloud']);
    const result = await server.callToolResult('load_skill', { id: 'entender-intencao' });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.id, 'entender-intencao');
    assert.ok(requests >= 3, 'handshake, listing and call used MCP transport');
    assert.equal(unexpectedFetch, 0);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
  }
});

test('word-cloud preparation preserves sources, priority, zero and missing weights', async () => {
  const { server, client } = await inMemory();
  try {
    const result = await client.callTool({ name: 'prepare_word_cloud', arguments: { words: [
      { word: 'acolhimento', frequency: 5, suggested_weight: 3, chosen_weight: 1 },
      { word: 'clareza', frequency: 2, suggested_weight: 4 },
      { word: 'leveza', frequency: 3 },
      { word: 'igual', frequency: 2, suggested_weight: 2, chosen_weight: 2 },
      { word: 'zero', frequency: 9, suggested_weight: 5, chosen_weight: 0 },
      { word: 'sem dados' },
    ] } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      words: [
        { word: 'acolhimento', frequency: 5, suggested_weight: 3, chosen_weight: 1, effective_weight: 1, effective_source: 'client_supplied_choice' },
        { word: 'clareza', frequency: 2, suggested_weight: 4, chosen_weight: null, effective_weight: 4, effective_source: 'client_supplied_suggestion' },
        { word: 'leveza', frequency: 3, suggested_weight: null, chosen_weight: null, effective_weight: 3, effective_source: 'client_supplied_frequency' },
        { word: 'igual', frequency: 2, suggested_weight: 2, chosen_weight: 2, effective_weight: 2, effective_source: 'client_supplied_choice' },
        { word: 'zero', frequency: 9, suggested_weight: 5, chosen_weight: 0, effective_weight: 0, effective_source: 'client_supplied_choice' },
        { word: 'sem dados', frequency: null, suggested_weight: null, chosen_weight: null, effective_weight: null, effective_source: 'unavailable' },
      ],
      creates_confirmed_preference: false,
    });
  } finally { await client.close(); await server.close(); }
});

test('word-cloud preparation rejects malformed or out-of-bounds inputs', async () => {
  const { server, client } = await inMemory();
  try {
    for (const words of [
      [],
      [{ word: ' ' }],
      [{ word: 'x', frequency: -1 }],
      [{ word: 'x', frequency: 1.5 }],
      [{ word: 'x', chosen_weight: -1 }],
      [{ word: 'x', suggested_weight: '3' }],
      [{ word: 'x', unauthorized_field: 'value' }],
      Array.from({ length: 101 }, () => ({ word: 'x' })),
    ]) {
      const result = await client.callTool({ name: 'prepare_word_cloud', arguments: { words } });
      assert.equal(result.isError, true);
    }
  } finally { await client.close(); await server.close(); }
});
