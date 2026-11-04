import test from 'node:test';
import assert from 'node:assert/strict';
import { describePendingImageCall, imageResultUnknown, createDisabledImageToolHandler } from '../src/image-tool-contract.mjs';

const event = { type: 'agent.session.requires_action', session: { id: 'sess_123', required_actions: [{ type: 'function_call', turn_id: 'turn_123', call_id: 'call_123', name: 'generate_image', arguments: { prompt: 'Crie uma fotografia sem texto' } }] } };
const binding = { userId: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222', pieceId: '33333333-3333-4333-8333-333333333333', version: 1, attemptId: '44444444-4444-4444-8444-444444444444', sessionId: 'sess_123' };

test('reconhece somente chamada pendente em sessão e autorização vinculadas', () => {
  const call = describePendingImageCall({ event, binding, explicitApproval: true });
  assert.equal(call.prompt, 'Crie uma fotografia sem texto');
  assert.equal(call.turnId, 'turn_123'); assert.equal(call.callId, 'call_123');
  assert.deepEqual(call.binding, binding);
  assert.equal(describePendingImageCall({ event, binding, explicitApproval: false }), null);
  assert.equal(describePendingImageCall({ event, binding: { ...binding, sessionId: 'sess_other' }, explicitApproval: true }), null);
  const duplicated = structuredClone(event); duplicated.session.required_actions.push(structuredClone(duplicated.session.required_actions[0]));
  assert.equal(describePendingImageCall({ event: duplicated, binding, explicitApproval: true }), null);
});

test('não aceita chave como argumento e não replica dados do provedor em resultado desconhecido', () => {
  const injected = structuredClone(event); injected.session.required_actions[0].arguments.apiKey = 'sk-test-do-not-log';
  assert.equal(describePendingImageCall({ event: injected, binding, explicitApproval: true }), null);
  injected.session.required_actions[0].arguments = { prompt: 'sk-test-do-not-log' };
  assert.equal(describePendingImageCall({ event: injected, binding, explicitApproval: true }), null);
  const call = describePendingImageCall({ event, binding, explicitApproval: true });
  const result = imageResultUnknown(call);
  assert.deepEqual(result, { type: 'agent.session.input.tool_result', turn_id: 'turn_123', call_id: 'call_123', success: false, error: 'Resultado desconhecido. Não repita automaticamente; confirme o estado da tentativa.' });
  assert.doesNotMatch(JSON.stringify(result), /sk-|Crie uma fotografia|11111111/);
});

test('fronteira HTTP sem persistência e idempotência permanece desabilitada', async () => {
  let invoked = 0;
  const handle = createDisabledImageToolHandler({ generate: () => { invoked++; } });
  const request = () => new Request('https://compor.test/internal/image-tool', { method: 'POST', headers: { authorization: 'Bearer sk-test-do-not-log' }, body: JSON.stringify(event) });
  const responses = await Promise.all([handle(request()), handle(request())]);
  for (const response of responses) { assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sk-|Crie uma fotografia/); }
  assert.equal(invoked, 0);
});
