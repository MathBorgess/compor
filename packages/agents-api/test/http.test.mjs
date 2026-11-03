import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentHandler } from '../src/index.mjs';

test('an authenticated creator receives the completed creative response', async () => {
  const key = 'sk-test-secret-123456789012345';
  let upstream;
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async (url, options) => {
    upstream = { url, options };
    return new Response([
      'data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\n',
      'data: {"type":"agent.session.turn.output_text.delta","delta":"Uma ideia"}\n\n',
      'data: {"type":"agent.session.turn.completed"}\n\n',
      'data: {"type":"agent.session.idle"}\n\n',
    ].join(''), { status: 201 });
  }});
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: key, objective: 'Promover café' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sessionId: 'sess_123', text: 'Uma ideia', usage: null });
  assert.equal(upstream.url, 'https://api.openai.com/v1/agents/sessions');
  assert.equal(upstream.options.headers.Authorization, `Bearer ${key}`);
  const payload = JSON.parse(upstream.options.body);
  assert.deepEqual(payload.environment, { type: 'none' });
  assert.equal(payload.input, 'Promover café');
  assert.equal(payload.stream, true);
  assert.equal(upstream.options.body.includes(key), false);
});

test('a rejected OpenAI credential returns a useful error without exposing the upstream body', async () => {
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response('secret upstream message', { status: 401 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: 'sk-test-secret-123456789012345', objective: 'Teste' }) }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'openai_credentials_rejected' });
});

test('quota or rate limit failure is surfaced without leaking provider content', async () => {
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response('provider response', { status: 429 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: 'sk-test-secret-123456789012345', objective: 'Teste' }) }));
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'openai_quota_or_rate_limit' });
});

test('the session credential is never sent as part of the creative objective', async () => {
  const key = 'sk-test-secret-123456789012345';
  let called = false;
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => { called = true; return new Response(); } });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: key, objective: `Help with ${key}` }) }));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('a completed text event works even when the provider sends no deltas', async () => {
  const events = [
    { type: 'agent.session.created', session: { id: 'sess_123' } },
    { type: 'agent.session.turn.output_text.done', item_id: 'msg_1', output_index: 0, content_index: 0, text: 'Direção final' },
    { type: 'agent.session.turn.completed' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response(events, { status: 201 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: 'sk-test-secret-123456789012345', objective: 'Teste' }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, 'Direção final');
});

test('rejects callers without identity before contacting the provider', async () => {
  let called = false;
  const handler = createAgentHandler({ authenticate: async () => null, fetch: async () => { called = true; } });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test('a disconnected stream is not mistaken for a completed turn', async () => {
  const events = 'data: {"type":"agent.session.created","session":{"id":"sess_123"}}\n\ndata: {"type":"agent.session.idle"}\n\n';
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response(events, { status: 201 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: 'sk-test-secret-123456789012345', objective: 'Teste' }) }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'incomplete_turn' });
});

test('redacts the credential if a provider result repeats it', async () => {
  const key = 'sk-test-secret-123456789012345';
  const events = [
    { type: 'agent.session.created', session: { id: 'sess_123' } },
    { type: 'agent.session.turn.output_text.done', text: `never disclose ${key}` },
    { type: 'agent.session.turn.completed' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response(events, { status: 201 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: key, objective: 'Teste' }) }));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes(key), false);
  assert.equal(JSON.parse(text).text, 'never disclose [redacted]');
});

test('rejects an oversized request without calling the provider', async () => {
  let called = false;
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => { called = true; } });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: 'x'.repeat(17 * 1024) }));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('a provider stream exceeding the limit is rejected without returning its content', async () => {
  const handler = createAgentHandler({ authenticate: async () => ({ userId: 'creator' }), fetch: async () => new Response('x'.repeat(1024 * 1024 + 1), { status: 201 }) });
  const response = await handler(new Request('http://localhost/agent', { method: 'POST', body: JSON.stringify({ apiKey: 'sk-test-secret-123456789012345', objective: 'Teste' }) }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'upstream_error' });
});
