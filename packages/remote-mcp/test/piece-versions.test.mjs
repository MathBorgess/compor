import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler, createSupabasePieceStore } from '../src/index.js';

const project = '11111111-1111-4111-8111-111111111111';
const piece = '22222222-2222-4222-8222-222222222222';
const content = { headline: 'Oficina', price: 'R$ 20', date: '10/12', caption: 'Inscreva-se', captionOrigin: 'user' };

test('salvar versão pela fronteira MCP preserva histórico, conflito e isolamento', async () => {
  const versions = [];
  const fetchImpl = async (url, init) => {
    const user = init.headers.authorization === 'Bearer alice-token' ? 'alice' : 'bob';
    if (String(url).includes('/rpc/save_piece_version')) {
      const input = JSON.parse(init.body);
      assert.equal('owner_id' in input, false);
      if (user !== 'alice') return Response.json({ status: 'not_found' });
      if (input.p_expected_version !== versions.length) return Response.json({ status: 'conflict', currentVersion: versions.length });
      const version = { project_id: input.p_project_id, piece_id: input.p_piece_id, version: versions.length + 1, content: input.p_content, created_at: '2026-11-03T00:00:00Z' };
      versions.push(version);
      return Response.json({ status: 'saved', version });
    }
    return Response.json(user === 'alice' ? versions.map(v => ({ ...v, projects: { owner_id: user } })) : []);
  };
  const pieceStore = createSupabasePieceStore({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl });
  const handle = createRemoteMcpHandler({ authenticate: async token => ({ userId: token === 'alice-token' ? 'alice' : 'bob' }), pieceStore });
  const connect = async token => {
    const client = new Client({ name: 'teste', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: (input, init) => handle(new Request(input, init)) }));
    return client;
  };
  const alice = await connect('alice-token');
  const bob = await connect('bob-token');
  try {
    const save = async (client, expectedVersion, draft = content) => (await client.callTool({ name: 'save_piece_version', arguments: { projectId: project, pieceId: piece, expectedVersion, content: draft } })).structuredContent;
    assert.equal((await save(alice, 0)).version.version, 1);
    assert.equal((await save(bob, 1)).status, 'not_found');
    assert.equal((await save(alice, 1, { ...content, headline: 'Nova oficina' })).version.version, 2);
    const field = { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label:'Inscrições', value:'Abertas', origin:'agent' };
    assert.deepEqual((await save(alice, 2, { ...content, fields:[field] })).version.content.fields, [field]);
    assert.deepEqual(await save(alice, 1), { status: 'conflict', currentVersion: 3 });
    const args = { projectId: project, pieceId: piece };
    assert.deepEqual((await bob.callTool({ name: 'list_piece_versions', arguments: args })).structuredContent.versions, []);
    const history = (await alice.callTool({ name: 'list_piece_versions', arguments: args })).structuredContent.versions;
    assert.equal(history.length, 3);
    assert.deepEqual(history[0].content, content);
    assert.equal(history[1].content.caption, content.caption);
    assert.deepEqual(history[2].content.fields, [field]);
    for (const fields of [[field,{...field,id:field.id.toUpperCase()}], [{...field,label:'  '}], [{...field,value:'sk-example'}], [{...field,unexpected:true}]]) {
      const result=await alice.callTool({name:'save_piece_version',arguments:{projectId:project,pieceId:piece,expectedVersion:3,content:{...content,fields}}});
      assert.equal(result.isError,true);
    }
    const storyWrite = { ...args, expectedVersion: 3, content: { ...content, format: 'story' } };
    const rejected = await alice.callTool({ name: 'save_piece_version', arguments: storyWrite });
    assert.equal(rejected.isError, true);
    await assert.rejects(() => pieceStore.save({ actor: { userId: 'alice' }, token: 'alice-token' }, storyWrite));
    assert.equal(versions.length,3);
  } finally { await alice.close(); await bob.close(); }
});

test('lista que retorna dados de outro proprietário é rejeitada sem divulgá-los', async () => {
  const pieceStore = createSupabasePieceStore({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl: async () => Response.json([
    { project_id: project, piece_id: piece, version: 1, content, created_at: '2026-11-03T00:00:00Z', projects: { owner_id: 'bob' } },
  ]) });
  const handle = createRemoteMcpHandler({ authenticate: async () => ({ userId: 'alice' }), pieceStore });
  const client = new Client({ name: 'teste', version: '1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.example/mcp'), { requestInit: { headers: { Authorization: 'Bearer alice-token' } }, fetch: (input, init) => handle(new Request(input, init)) }));
  try {
    const result = await client.callTool({ name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } });
    assert.equal(result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /Inscreva-se|alice-token/);
  } finally { await client.close(); }
});
