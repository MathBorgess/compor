import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler, createSupabaseProjectStore } from '../src/index.js';

test('pessoas criam e retomam somente seus próprios projetos pelo MCP', async () => {
  const rows = [];
  // Test double for the external PostgREST service, including its role/RLS boundary.
  const fetchImpl = async (url, init) => {
    const owner = init.headers.authorization === 'Bearer alice-token' ? 'alice' : 'bob';
    if (init.method === 'POST') {
      const input = JSON.parse(init.body);
      assert.equal('owner_id' in input, false);
      const row = { id: `project-${rows.length + 1}`, owner_id: owner, title: input.title, created_at: '2026-11-03T00:00:00Z' };
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    return Response.json(rows.filter(row => row.owner_id === owner));
  };
  const projectStore = createSupabaseProjectStore({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl });
  const handle = createRemoteMcpHandler({ authenticate: async token => ({ userId: token === 'alice-token' ? 'alice' : 'bob' }), projectStore });
  const connect = async token => {
    const client = new Client({ name: 'teste', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (input, init) => handle(new Request(input, init)),
    }));
    return client;
  };
  const alice = await connect('alice-token');
  const bob = await connect('bob-token');
  try {
    const created = await alice.callTool({ name: 'create_project', arguments: { title: 'Oficina' } });
    assert.deepEqual(created.structuredContent.project, { id: 'project-1', title: 'Oficina', created_at: '2026-11-03T00:00:00Z' });
    assert.deepEqual((await bob.callTool({ name: 'list_projects', arguments: {} })).structuredContent.projects, []);
    assert.deepEqual((await alice.callTool({ name: 'list_projects', arguments: {} })).structuredContent.projects, [created.structuredContent.project]);
  } finally { await alice.close(); await bob.close(); }
});

test('resposta de outro proprietário é rejeitada sem expor dados ou credenciais', async () => {
  const projectStore = createSupabaseProjectStore({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl: async () => Response.json([
    { id: 'secret-project', owner_id: 'bob', title: 'Segredo', created_at: '2026-11-03T00:00:00Z' },
  ]) });
  const handle = createRemoteMcpHandler({ authenticate: async () => ({ userId: 'alice' }), projectStore });
  const client = new Client({ name: 'teste', version: '1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer alice-token' } }, fetch: (input, init) => handle(new Request(input, init)),
  }));
  try {
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.equal(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /secret-project|Segredo|alice-token/);
  } finally { await client.close(); }
});
