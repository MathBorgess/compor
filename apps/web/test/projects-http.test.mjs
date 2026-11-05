import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseProjectStore } from '@compor/remote-mcp';
import { createProjectRoutes } from '../lib/project-route.ts';

const userId = '63de811f-c75c-4571-968c-38a8b3f0accd';
const actor = { userId, token: 'fake-user-token' };
const row = { id: 'p1', owner_id: userId, title: 'Oficina', created_at: '2026-11-03T00:00:00Z' };

test('a pessoa autenticada lista seus projetos com o próprio token', async () => {
  let upstream;
  const store = createSupabaseProjectStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => { upstream = { url, options }; return Response.json([row]); } });
  const routes = createProjectRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, projectStore: store });
  const response = await routes.GET(new Request('https://compor.test/api/projects'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projects: [{ id: 'p1', title: 'Oficina', created_at: row.created_at }] });
  assert.equal(upstream.options.headers.authorization, 'Bearer fake-user-token');
  assert.equal(upstream.url.searchParams.get('owner_id'), `eq.${userId}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('a pessoa autenticada cria projeto próprio mediante pedido da origem do app', async () => {
  let upstream;
  const store = createSupabaseProjectStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async (url, options) => { upstream = { url, options }; return Response.json([row]); } });
  const routes = createProjectRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, projectStore: store });
  const response = await routes.POST(new Request('https://compor.test/api/projects', { method: 'POST', headers: { origin: 'https://compor.test', 'content-type': 'application/json' }, body: JSON.stringify({ title: '  Oficina  ' }) }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { project: { id: 'p1', title: 'Oficina', created_at: row.created_at } });
  assert.equal(upstream.options.headers.authorization, 'Bearer fake-user-token');
  assert.deepEqual(JSON.parse(upstream.options.body), { title: 'Oficina' });
});

test('dados de outra conta nunca são retornados mesmo se o banco os enviar', async () => {
  const store = createSupabaseProjectStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetchImpl: async () => Response.json([{ ...row, owner_id: 'outra-pessoa', title: 'privado' }]) });
  const response = await createProjectRoutes({ resolveActor: async () => actor, projectStore: store }).GET(new Request('https://compor.test/api/projects'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /privado/);
});

test('requisições sem identidade ou de origem externa não acessam o banco', async () => {
  let calls = 0;
  const store = { list: async () => { calls++; }, create: async () => { calls++; } };
  const routes = createProjectRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => null, projectStore: store });
  assert.equal((await routes.GET(new Request('https://compor.test/api/projects'))).status, 401);
  const post = new Request('https://compor.test/api/projects', { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{"title":"Teste"}' });
  assert.equal((await routes.POST(post)).status, 403);
  assert.equal(calls, 0);
});

test('uma criação interrompida é incerta e não é repetida automaticamente', async () => {
  let calls = 0;
  const routes = createProjectRoutes({ appOrigin: 'https://compor.test', resolveActor: async () => actor, projectStore: { create: async () => { calls++; throw Error('sensitive'); } } });
  const response = await routes.POST(new Request('https://compor.test/api/projects', { method: 'POST', headers: { origin: 'https://compor.test', 'content-type': 'application/json' }, body: '{"title":"Teste"}' }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});
