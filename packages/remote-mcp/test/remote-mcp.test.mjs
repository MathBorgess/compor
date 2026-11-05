import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler, createSupabaseAuthenticator } from '../src/index.js';

test('o endpoint MCP recusa requisições sem autenticação', async () => {
  const handle = createRemoteMcpHandler();
  const response = await handle(new Request('https://compor.example/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  assert.equal(response.status, 401);
});

test('requisição sem token válido é recusada pelo serviço de identidade', async () => {
  const authenticate = createSupabaseAuthenticator({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl: async () => new Response('{}', { status: 401 }) });
  const handle = createRemoteMcpHandler({ authenticate });
  const response = await handle(new Request('https://compor.example/mcp', {
    method: 'POST', headers: { Authorization: 'Bearer invalid-token', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  }));
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), /invalid-token/);
});

test('falha no serviço de identidade interrompe acesso sem revelar credencial', async () => {
  const authenticate = createSupabaseAuthenticator({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl: async () => { throw new Error('secret-value'); } });
  const response = await createRemoteMcpHandler({ authenticate })(new Request('https://compor.example/mcp', {
    method: 'POST', headers: { Authorization: 'Bearer secret-value' }, body: '{}',
  }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret-value/);
});

test('credencial revogada após a conexão deixa de acessar ferramentas', async () => {
  let active = true;
  const handle = createRemoteMcpHandler({ authenticate: async () => active ? { userId: 'user-1' } : null });
  const client = new Client({ name: 'teste', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer revoked-token' } },
    fetch: (input, init) => handle(new Request(input, init)),
  });
  try {
    await client.connect(transport);
    active = false;
    await assert.rejects(client.listTools(), /401|Unauthorized|unauthorized|Autenticação/);
  } finally { await client.close(); }
});

test('requisição autenticada acima do limite não é processada', async () => {
  const handle = createRemoteMcpHandler({ authenticate: async () => ({ userId: 'user-1' }) });
  const response = await handle(new Request('https://compor.example/mcp', {
    method: 'POST', headers: { Authorization: 'Bearer token', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', extra: 'x'.repeat(70_000) }),
  }));
  assert.equal(response.status, 413);
});

test('cliente autenticado negocia MCP e prepara briefing sem inventar fatos', async () => {
  const authenticate = createSupabaseAuthenticator({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl: async (url, init) => {
    assert.equal(String(url), 'https://project.supabase.co/auth/v1/user');
    assert.equal(init.headers.authorization, 'Bearer test-token');
    return Response.json({ id: 'user-1' });
  } });
  const handle = createRemoteMcpHandler({ authenticate });
  const client = new Client({ name: 'teste', version: '1.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer test-token' } },
    fetch: (input, init) => handle(new Request(input, init)),
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['prepare_deliberation', 'propose_criterion_refinement', 'prepare_brief']);
    const result = await client.callTool({ name: 'prepare_brief', arguments: { objective: 'Divulgar oficina' } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { objective: 'Divulgar oficina', audience: null, offer: null, format: null, missing: ['audience', 'offer', 'format'], persists_data: false });
  } finally { await client.close(); }
});
