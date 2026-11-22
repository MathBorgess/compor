import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRemoteMcpHandler, createSupabasePieceStore } from '../src/index.js';

const project = '11111111-1111-4111-8111-111111111111';
const pieceId = n => `22222222-2222-4222-8222-${n.toString(16).padStart(12, '0')}`;
const row = (piece, version, owner = 'alice') => ({ project_id: project, piece_id: piece, version,
  content: { headline: `Peça ${piece} v${version}`, price: '', date: '', caption: '', captionOrigin: 'user' },
  created_at: '2026-11-04T00:00:00Z', projects: { owner_id: owner } });

async function clientFor(fetchImpl) {
  const store = createSupabasePieceStore({ url: 'https://project.supabase.co', anonKey: 'public-key', fetchImpl });
  const handler = createRemoteMcpHandler({ authenticate: async () => ({ userId: 'alice' }), pieceStore: store });
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://compor.test/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer alice-token' } },
    fetch: (input, init) => handler(new Request(input, init)),
  }));
  return client;
}

test('lista peças mais recentes, com cursor por peça e paginação mesmo com muitas versões', async () => {
  const rows = [];
  for (let i = 1; i <= 55; i++) for (let v = i === 1 ? 120 : 2; v >= 1; v--) rows.push(row(pieceId(i), v));
  const client = await clientFor(async (request, init) => {
    const url = new URL(request);
    assert.equal(init.headers.authorization, 'Bearer alice-token');
    assert.equal(url.searchParams.get('projects.owner_id'), 'eq.alice');
    assert.equal(url.searchParams.get('project_id'), `eq.${project}`);
    assert.equal(url.searchParams.get('order'), 'piece_id.asc,version.desc');
    assert.equal(url.searchParams.get('limit'), '101');
    const after = url.searchParams.get('piece_id')?.replace(/^gt\./, '') ?? '';
    return Response.json(rows.filter(r => r.piece_id > after).slice(0, 101));
  });
  try {
    const seen = [];
    let after;
    do {
      const result = await client.callTool({ name: 'list_pieces', arguments: { projectId: project, ...(after ? { after } : {}) } });
      assert.notEqual(result.isError, true);
      const page = result.structuredContent;
      assert.ok(page.pieces.length <= 50);
      seen.push(...page.pieces);
      after = page.nextCursor;
    } while (after);
    assert.equal(seen.length, 55);
    assert.equal(new Set(seen.map(item => item.pieceId)).size, 55);
    assert.equal(seen[0].latestVersion, 120);
    assert.equal(seen[1].latestVersion, 2);
  } finally { await client.close(); }
});

test('listas MCP incluem versões com formatos do estúdio sem expor seus campos internos', async () => {
  const piece = pieceId(1);
  const legacy = row(piece, 1);
  const story = row(piece, 2);
  const carousel = row(piece, 3);
  let rows = [legacy, { ...story, content: { ...story.content, format: 'story' } }, {
    ...carousel,
    content: {
      ...carousel.content,
      format: 'carousel',
      visualInvariants: 'Fundo creme',
      frames: [1, 2].map(position => ({
        id: pieceId(position + 1), position, role: 'quadro', headline: 'Arte', body: '', visualCue: '', assetId: null,
      })),
    },
  }];
  const client = await clientFor(async request => {
    const sort = new URL(request).searchParams.get('order');
    return Response.json(sort === 'version.asc' ? rows : [...rows].reverse());
  });
  try {
    const historyCall = { name: 'list_piece_versions', arguments: { projectId: project, pieceId: piece } };
    const summaryCall = { name: 'list_pieces', arguments: { projectId: project } };
    const history = await client.callTool(historyCall);
    assert.deepEqual(history.structuredContent.versions.map(version => version.content), [legacy.content, story.content, carousel.content]);
    const summary = await client.callTool(summaryCall);
    assert.deepEqual(summary.structuredContent, {
      pieces: [{ pieceId: piece, latestVersion: 3, headline: carousel.content.headline, createdAt: carousel.created_at }],
      nextCursor: piece,
    });

    rows = [{ ...carousel, content: { ...rows[2].content, unexpected: 'não divulgar' } }];
    for (const call of [historyCall, summaryCall]) {
      const result = await client.callTool(call);
      assert.equal(result.isError, true);
      assert.doesNotMatch(JSON.stringify(result), /não divulgar/);
    }
  } finally { await client.close(); }
});

test('nega resposta de outro dono ou projeto sem divulgar dados privados', async () => {
  for (const bad of [row(pieceId(1), 1, 'bob'), { ...row(pieceId(1), 1), project_id: pieceId(2) }]) {
    const client = await clientFor(async () => Response.json([bad]));
    try {
      const result = await client.callTool({ name: 'list_pieces', arguments: { projectId: project } });
      assert.equal(result.isError, true);
      assert.doesNotMatch(JSON.stringify(result), /alice-token|bob|Peça 222/);
    } finally { await client.close(); }
  }
});

test('projeto próprio vazio e projeto alheio não expõem dados; cursor inválido não executa consulta', async () => {
  let requests = 0;
  const client = await clientFor(async (request, init) => {
    requests++;
    const url = new URL(request);
    assert.equal(url.searchParams.get('projects.owner_id'), 'eq.alice');
    assert.equal(init.headers.authorization, 'Bearer alice-token');
    return Response.json([]);
  });
  try {
    for (const projectId of [project, pieceId(3)]) {
      const result = await client.callTool({ name: 'list_pieces', arguments: { projectId } });
      assert.deepEqual(result.structuredContent, { pieces: [], nextCursor: null });
    }
    const invalid = await client.callTool({ name: 'list_pieces', arguments: { projectId: project, after: 'not-a-uuid' } });
    assert.equal(invalid.isError, true);
    assert.equal(requests, 2);
  } finally { await client.close(); }
});

test('rejeita resultado fora de ordem e repetição do cursor em vez de pular peças', async () => {
  for (const rows of [
    [row(pieceId(2), 1), row(pieceId(1), 1)],
    [row(pieceId(1), 1)],
    [row(pieceId(2), 1), row(pieceId(2), 2)],
  ]) {
    const client = await clientFor(async () => Response.json(rows));
    try {
      const result = await client.callTool({ name: 'list_pieces', arguments: { projectId: project, after: pieceId(1) } });
      assert.equal(result.isError, true);
    } finally { await client.close(); }
  }
});

test('continua até página vazia mesmo quando PostgREST impõe limite menor', async () => {
  const rows = [row(pieceId(1), 2), row(pieceId(1), 1), row(pieceId(2), 1), row(pieceId(3), 1)];
  const client = await clientFor(async request => {
    const after = new URL(request).searchParams.get('piece_id')?.replace(/^gt\./, '') ?? '';
    return Response.json(rows.filter(item => item.piece_id > after).slice(0, 1));
  });
  try {
    const found = []; let after;
    do {
      const result = await client.callTool({ name: 'list_pieces', arguments: { projectId: project, ...(after ? { after } : {}) } });
      assert.notEqual(result.isError, true);
      found.push(...result.structuredContent.pieces);
      after = result.structuredContent.nextCursor;
    } while (after);
    assert.deepEqual(found.map(item => item.pieceId), [pieceId(1), pieceId(2), pieceId(3)]);
    assert.equal(found[0].latestVersion, 2);
  } finally { await client.close(); }
});
