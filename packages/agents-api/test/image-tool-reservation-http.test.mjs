import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageToolReservationStore } from '../src/image-tool-reservation.mjs';
const userId = '11111111-1111-4111-8111-111111111111', projectId = '22222222-2222-4222-8222-222222222222', pieceId = '33333333-3333-4333-8333-333333333333', attemptId = '44444444-4444-4444-8444-444444444444', reservationId = '55555555-5555-4555-8555-555555555555';
const actor = { userId, token: 'fake-user-token' }, call = { actor, projectId, pieceId, version: 1, attemptId, sessionId: 'sess_123', turnId: 'turn_123', callId: 'call_123' };

test('reserva com token de usuário apenas IDs, sem prompt nem chave', async () => {
  let captured;
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, init) => { captured = { url, init }; return Response.json([{ reservation_id: reservationId, state: 'reserved', is_new: true }]); } });
  assert.deepEqual(await store.reserve({ ...call, apiKey: 'sk-test-do-not-send', prompt: 'não persistir' }), { id: reservationId, state: 'reserved', isNew: true });
  assert.equal(captured.url.pathname, '/rest/v1/rpc/reserve_image_tool_call');
  assert.equal(captured.init.headers.authorization, 'Bearer fake-user-token');
  assert.doesNotMatch(captured.init.body, /sk-test|não persistir|fake-user-token/);
  assert.deepEqual(JSON.parse(captured.init.body), { p_project_id: projectId, p_piece_id: pieceId, p_piece_version: 1, p_attempt_id: attemptId, p_session_id: 'sess_123', p_turn_id: 'turn_123', p_call_id: 'call_123' });
});

test('desconhecido e falha de transporte nunca indicam nova execução', async () => {
  let count = 0;
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async () => { count++; if (count === 1) return Response.json([{ reservation_id: reservationId, state: 'unknown', is_new: false }]); throw new Error('sk-test-secret'); } });
  assert.deepEqual(await store.reserve(call), { id: reservationId, state: 'unknown', isNew: false });
  await assert.rejects(store.reserve(call), error => error.message === 'reservation status unknown');
  assert.equal(count, 2);
  assert.throws(() => createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_secret_test' }));
});

test('marca resultado incerto com metadados limitados e não recebe corpo do provedor', async () => {
  let captured;
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, init) => { captured = { url, init }; return Response.json(true); } });
  await store.markUnknown({ ...call, apiKey: 'sk-secret-never-serialize', prompt: 'prompt privado' });
  assert.equal(captured.url.pathname, '/rest/v1/rpc/mark_image_tool_call_unknown');
  assert.doesNotMatch(captured.init.body, /sk-secret|prompt privado|fake-user-token/);
  assert.deepEqual(JSON.parse(captured.init.body), { p_project_id: projectId, p_session_id: 'sess_123', p_turn_id: 'turn_123', p_call_id: 'call_123' });
});

test('declaração de consentimento usa apenas confirmação explícita e não serializa chave ou prompt', async () => {
  let captured, count = 0;
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, init) => { count++; captured = { url, init }; return Response.json([{ declaration_id: reservationId, is_new: true }]); } });
  await assert.rejects(store.declareConsent({ actor, reservationId, confirmed: false }));
  assert.equal(count, 0);
  assert.deepEqual(await store.declareConsent({ actor, reservationId, confirmed: true, apiKey: 'sk-never-save', prompt: 'privado' }), { id: reservationId, isNew: true });
  assert.equal(captured.url.pathname, '/rest/v1/rpc/declare_image_generation_consent');
  assert.equal(captured.init.headers.authorization, 'Bearer fake-user-token');
  assert.deepEqual(JSON.parse(captured.init.body), { p_reservation_id: reservationId, p_confirmed: true });
  assert.doesNotMatch(captured.init.body, /sk-|privado|fake-user-token/);
});

test('claim e resultado usam IDs estáveis sem prompt, chave ou repetição automática', async () => {
  const executionId = '66666666-6666-4666-8666-666666666666', assetId = '77777777-7777-4777-8777-777777777777';
  const sent = [];
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async (url, init) => {
    sent.push({ path: url.pathname, body: init.body, auth: init.headers.authorization });
    if (url.pathname.endsWith('/claim_image_tool_execution')) return Response.json([{ execution_id: executionId, asset_id: assetId, state: 'running', is_new: sent.length === 1 }]);
    return Response.json(true);
  } });
  const input = { actor, reservationId, apiKey: 'sk-never-send', prompt: 'texto privado' };
  assert.deepEqual(await store.claimExecution(input), { id: executionId, assetId, state: 'running', isNew: true });
  assert.deepEqual(await store.claimExecution(input), { id: executionId, assetId, state: 'running', isNew: false });
  await store.markExecutionUnknown({ actor, executionId });
  await store.completeExecution({ actor, executionId });
  assert.ok(sent.every(item => item.auth === 'Bearer fake-user-token' && !/sk-|texto privado|fake-user-token/.test(item.body)));
  assert.deepEqual(sent.map(item => JSON.parse(item.body)), [{ p_reservation_id: reservationId }, { p_reservation_id: reservationId }, { p_execution_id: executionId }, { p_execution_id: executionId }]);
});

test('desconexão na reserva do claim mantém resultado desconhecido sem repetição', async () => {
  let count = 0;
  const store = createImageToolReservationStore({ url: 'https://example.supabase.co', anonKey: 'sb_publishable_test', fetch: async () => { count++; throw new Error('sk-private'); } });
  await assert.rejects(store.claimExecution({ actor, reservationId }), error => error.message === 'reservation status unknown');
  assert.equal(count, 1);
});

test('claim distingue espera e bloqueio conhecidos antes do envio ao provedor', async () => {
  for (const state of ['busy','blocked']) {
    const store=createImageToolReservationStore({url:'https://example.supabase.co',anonKey:'sb_publishable_test',fetch:async()=>Response.json([{execution_id:null,asset_id:null,state,is_new:false}])});
    assert.deepEqual(await store.claimExecution({actor,reservationId}),{state});
  }
});
