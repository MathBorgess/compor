import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceRoutes } from '../lib/piece-route.mjs';
const projectId = '11111111-1111-4111-8111-111111111111';
const pieceId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const content = { headline: 'Oficina', price: 'R$ 20', date: 'Amanhã', caption: 'Inscreva-se', captionOrigin: 'user' };
const actor = { userId, token: 'fake-user-token' };
const request = body => new Request('https://compor.test/api/pieces', { method: 'POST', headers: { origin: 'https://compor.test', 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('salva com token da pessoa e preserva conflito de versão', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async (a, p) => a.userId === userId && p === projectId, pieceStore: { save: async (context, input) => { calls++; assert.equal(context.token, actor.token); assert.deepEqual(input, { projectId, pieceId, expectedVersion: 1, content }); return { status: 'conflict', currentVersion: 2 }; } } });
  const result = await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }));
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { status: 'conflict', currentVersion: 2 });
  assert.equal(calls, 1);
});

test('não lê nem grava projeto de outra pessoa', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async () => false, pieceStore: { listProject: async () => { calls++; }, save: async () => { calls++; } } });
  assert.equal((await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`))).status, 404);
  assert.equal((await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }))).status, 404);
  assert.equal(calls, 0);
});

test('lista versões do projeto com o token da pessoa e rejeita proprietário diferente', async () => {
  const { createProjectPieceStore } = await import('../lib/piece-store.mjs');
  let upstream;
  const row = { project_id: projectId, piece_id: pieceId, version: 1, content, created_at: '2026-11-03T00:00:00Z', projects: { owner_id: userId } };
  let range = '0-0/1';
  const store = createProjectPieceStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => { upstream = { url, options }; return Response.json([row], { headers: { 'content-range': range } }); } });
  const routes = createPieceRoutes({ resolveActor: async () => actor, ownsProject: async () => true, pieceStore: store });
  const response = await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).versions, [{ project_id: projectId, piece_id: pieceId, version: 1, content, created_at: row.created_at }]);
  assert.equal(upstream.options.headers.authorization, 'Bearer fake-user-token');
  assert.equal(upstream.options.headers.prefer, 'count=exact');
  range = '0-0/2';
  assert.equal((await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`))).status, 503, 'lista truncada não pode parecer completa');
  range = '0-0/1';
  row.projects.owner_id = 'outra-pessoa';
  const denied = await routes.GET(new Request(`https://compor.test/api/pieces?projectId=${projectId}`));
  assert.equal(denied.status, 503);
  assert.doesNotMatch(await denied.text(), /Inscreva-se|fake-user-token/);
});

test('falha após envio retorna resultado desconhecido sem retry', async () => {
  let calls = 0;
  const routes = createPieceRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, ownsProject: async () => true, pieceStore: { save: async () => { calls++; throw new Error('provider secret'); } } });
  const response = await routes.POST(request({ projectId, pieceId, expectedVersion: 1, content }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});
