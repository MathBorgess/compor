import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAgentScope, withAgentMcpTool } from '../src/agent-scope.js';

const user = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const otherProject = '33333333-3333-4333-8333-333333333333';
const piece = '44444444-4444-4444-8444-444444444444';
const secret = Buffer.alloc(32, 7), token = 'synthetic-user-token';

test('delegação limita chamada MCP ao projeto e token verificados e expira', async () => {
  let now = 1000000, calls = 0, owned = true, identityValid = true;
  const scope = createAgentScope({ secret, now: () => now,
    authenticate: async value => identityValid && [token, 'another-valid-session'].includes(value) ? { userId: user } : null,
    ownsProject: async (actor, candidate) => owned && actor.userId === user && candidate === project,
    pieceStore: { list: async () => { calls++; return []; }, save: async () => { calls++; return { status: 'saved' }; } },
  });
  const grant = await scope.issue({ token, projectId: project });
  assert.ok(grant);
  assert.doesNotMatch(Buffer.from(grant, 'base64url').toString('utf8'), /synthetic-user-token/);
  assert.equal(await scope.issue({ token, projectId: otherProject }), null);
  const connect = async (proof, handler = scope.handle) => {
    const client = new Client({ name: 'test', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.example/api/agent-mcp'), {
      requestInit: { headers: { authorization: `Bearer ${proof}` } },
      fetch: (input, init) => handler(new Request(input, init)),
    }));
    return client;
  };
  const otherEnvironment = createAgentScope({ secret: Buffer.alloc(32, 9), now: () => now, authenticate: async () => ({ userId: user }), ownsProject: async () => true, pieceStore: { list: async () => [], save: async () => ({}) } });
  const client = await connect(grant);
  try {
    await assert.rejects(() => connect('another-valid-session'));
    await assert.rejects(() => connect(grant, otherEnvironment.handle));
    await assert.rejects(() => connect(`${grant.slice(0, -1)}${grant.endsWith('A') ? 'B' : 'A'}`));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name).sort(), ['list_piece_versions', 'prepare_brief', 'prepare_deliberation', 'propose_criterion_refinement', 'save_piece_version']);
    const denied = await client.callTool({ name: 'list_piece_versions', arguments: { projectId: otherProject, pieceId: piece } });
    assert.equal(denied.isError, true); assert.equal(calls, 0);
    const deniedWrite = await client.callTool({ name: 'save_piece_version', arguments: { projectId: otherProject, pieceId: piece, expectedVersion: 0, content: { headline: '', price: '', date: '', caption: '', captionOrigin: 'user' } } });
    assert.equal(deniedWrite.isError, true); assert.equal(calls, 0);
    const allowed = await client.callTool({ name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } });
    assert.equal(allowed.isError, undefined); assert.equal(calls, 1);
    owned = false;
    const revoked = await client.callTool({ name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } });
    assert.equal(revoked.isError, true); assert.equal(calls, 1);
    owned = true;
    identityValid = false;
    await assert.rejects(() => client.callTool({ name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } }));
    identityValid = true;
    now += 301000;
    await assert.rejects(() => client.callTool({ name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } }));
    assert.equal(calls, 1);
  } finally { await client.close().catch(() => {}); }
  await assert.rejects(() => connect(`${grant}x`));
});

test('configuração de sessão usa destino fixo HTTPS e não devolve credenciais ao chamador', async () => {
  const scope = createAgentScope({ secret, authenticate: async () => ({ userId: user }), ownsProject: async () => true,
    pieceStore: { list: async () => [], save: async () => ({}) } });
  let sent;
  const result = await withAgentMcpTool({ appOrigin: 'https://compor.vercel.app', scope, token, projectId: project }, async tool => { sent = tool; return token; });
  assert.deepEqual(result, { status: 'invoked' });
  assert.match(sent.transport.authorization, /^Bearer [A-Za-z0-9_-]+$/);
  assert.doesNotMatch(sent.transport.authorization, new RegExp(token));
  assert.equal(sent.transport.server_url, 'https://compor.vercel.app/api/agent-mcp');
  assert.equal(sent.connection_origin, 'service');
  assert.deepEqual(sent.allowed_tools, ['prepare_brief', 'prepare_deliberation', 'propose_criterion_refinement', 'list_piece_versions', 'save_piece_version']);
  assert.equal(sent.transport.headers, undefined);
  for (const appOrigin of ['http://localhost:3000', 'https://127.0.0.1', 'https://example.internal', 'https://compor.vercel.app@evil.com', 'https://compor.vercel.app/path', 'https://compor.vercel.app?x=y']) {
    assert.deepEqual(await withAgentMcpTool({ appOrigin, scope, token, projectId: project }, () => { throw Error('should not run'); }), { status: 'unavailable' });
  }
  assert.deepEqual(await withAgentMcpTool({ appOrigin: 'https://compor.vercel.app', scope, token, projectId: project }, () => { throw Error(token); }), { status: 'result_unknown', retryAutomatically: false });
});

test('dependências ausentes ou rejeição de titularidade não produzem delegação', async () => {
  assert.throws(() => createAgentScope({ secret: Buffer.alloc(16) }), /invalid configuration/);
  const scope = createAgentScope({ secret, authenticate: async () => ({ userId: user }), ownsProject: async () => { throw Error(token); }, pieceStore: { list: async () => [], save: async () => ({}) } });
  assert.equal(await scope.issue({ token, projectId: project }), null);
  assert.deepEqual(await withAgentMcpTool({ appOrigin: 'https://compor.vercel.app', scope, token, projectId: project }, () => { throw Error('should not run'); }), { status: 'unavailable' });
});
