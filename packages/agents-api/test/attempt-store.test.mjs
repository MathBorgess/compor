import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAttemptStore } from '../src/attempt-store.mjs';

const user = '63de811f-c75c-4571-968c-38a8b3f0accd';
const project = '0a3be452-5152-41d1-a3e8-fc2be56d67e1';
const key = '82b7e98a-8145-4020-882a-f6c7f61debe2';
const id = 'ad20cd16-5f36-447b-af81-c75824ecb4da';

test('reserva tentativa com token de usuário e apenas metadados de projeto e idempotência', async () => {
  let call;
  const store = createSupabaseAttemptStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, options) => {
    call = { url, options };
    return Response.json([{ attempt_id: id, state: 'started', is_new: true }]);
  }});
  const result = await store.start({ actor: { userId: user, token: 'fake-token' }, projectId: project, idempotencyKey: key });
  assert.deepEqual(result, { id, state: 'started', isNew: true });
  assert.equal(call.url.pathname, '/rest/v1/rpc/reserve_agent_attempt');
  assert.equal(call.options.headers.authorization, 'Bearer fake-token');
  assert.deepEqual(JSON.parse(call.options.body), { p_project_id: project, p_idempotency_key: key });
});

test('conclui somente estado reconhecido e recusa erros de armazenamento', async () => {
  let call;
  const actor = { userId: user, token: 'fake-token' };
  const store = createSupabaseAttemptStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, options) => { call = { url, options }; return Response.json(true); } });
  await store.finish({ actor, projectId: project, attemptId: id, state: 'unknown' });
  assert.equal(call.url.pathname, '/rest/v1/rpc/finish_agent_attempt');
  assert.deepEqual(JSON.parse(call.options.body), { p_project_id: project, p_attempt_id: id, p_state: 'unknown' });
  await assert.rejects(() => store.finish({ actor, projectId: project, attemptId: id, state: 'started' }));
  const broken = createSupabaseAttemptStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async () => new Response('private', { status: 503 }) });
  await assert.rejects(() => broken.start({ actor, projectId: project, idempotencyKey: key }), /attempt store unavailable/);
});

test('chaves secretas ou service-role não são aceitas pelo armazenamento', () => {
  assert.throws(() => createSupabaseAttemptStore({ url: 'https://example.supabase.co', anonKey: 'sb_secret_test' }), /invalid configuration/);
  const jwt = ['header', Buffer.from('{"role":"service_role"}').toString('base64url'), 'signature'].join('.');
  assert.throws(() => createSupabaseAttemptStore({ url: 'https://example.supabase.co', anonKey: jwt }), /invalid configuration/);
});
