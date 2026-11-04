import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBindings } from '../src/session-binding.mjs';
import { createProjectAgentHandler } from '../src/project-route.mjs';
const userId = '11111111-1111-4111-8111-111111111111', projectId = '22222222-2222-4222-8222-222222222222', attemptId = '33333333-3333-4333-8333-333333333333', idempotencyKey = '44444444-4444-4444-8444-444444444444';
const apiKey = 'sk-test-secret-123456789012345';
const req = (extra = {}) => new Request('https://compor.test/api/agent', { method: 'POST', headers: { origin: 'https://compor.test', 'content-type': 'application/json', 'x-compor-project-id': projectId, 'x-compor-attempt-id': idempotencyKey }, body: JSON.stringify({ apiKey, objective: 'Teste', sessionId: 'sess_browser_forged', userId: '55555555-5555-4555-8555-555555555555', ...extra }) });

test('vínculo assinado vem da resposta OpenAI e pertence à conta, projeto e tentativa', async () => {
  let now = 1000000;
  const bindings = createSessionBindings({ secret: Buffer.alloc(32, 17), now: () => now });
  const handler = createProjectAgentHandler({ appOrigin: 'https://compor.test', resolveActor: async () => ({ userId, token: 'fake-user-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attemptId, state: 'started', isNew: true }), finish: async () => {} }, bindings,
    fetch: async (_url, options) => { assert.equal(options.headers.Authorization, `Bearer ${apiKey}`); if(options.method==='GET')return Response.json({id:'sess_from_openai',status:'idle',required_actions:[]}); return new Response('data: {"type":"agent.session.created","session":{"id":"sess_from_openai"}}\n\ndata: {"type":"agent.session.turn.output_text.done","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed"}\n\n', { status: 201 }); },
  });
  const response = await handler(req()); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.sessionId, 'sess_from_openai');
  const context = { userId, projectId, attemptId };
  assert.deepEqual(bindings.verify({ token: data.sessionBinding, ...context }), { sessionId: 'sess_from_openai', ...context });
  assert.doesNotMatch(data.sessionBinding, /sk-test|fake-user-token|Teste/);
  assert.equal(bindings.verify({ token: data.sessionBinding, ...context, userId: '55555555-5555-4555-8555-555555555555' }), null);
  assert.equal(bindings.verify({ token: data.sessionBinding, ...context, projectId: '66666666-6666-4666-8666-666666666666' }), null);
  assert.equal(bindings.verify({ token: data.sessionBinding, ...context, attemptId: '77777777-7777-4777-8777-777777777777' }), null);
  const [v, payload, signature] = data.sessionBinding.split('.');
  const altered = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); altered.sessionId = 'sess_browser_forged';
  assert.doesNotMatch(Buffer.from(payload, 'base64url').toString('utf8'), /sk-test|fake-user-token|Teste|sess_browser_forged/);
  const tampered = `${v}.${Buffer.from(JSON.stringify(altered)).toString('base64url')}.${signature}`;
  assert.equal(bindings.verify({ token: tampered, ...context }), null);
  now += 11 * 60 * 1000;
  assert.equal(bindings.verify({ token: data.sessionBinding, ...context }), null);
});

test('falha ao vincular não retorna resultado nem segredo e registra desfecho incerto', async () => {
  const states = []; let paid = 0;
  const handler = createProjectAgentHandler({ appOrigin: 'https://compor.test', resolveActor: async () => ({ userId, token: 'fake-user-token' }), ownsProject: async () => true,
    attempts: { start: async () => ({ id: attemptId, state: 'started', isNew: true }), finish: async ({ state }) => states.push(state) },
    bindings: { issue: () => { throw new Error(apiKey); }, issueAction: () => { throw new Error(apiKey); } },
    fetch: async (_url,options) => { if(options.method==='GET')return Response.json({id:'sess_from_openai',status:'idle',required_actions:[]}); paid++; return new Response('data: {"type":"agent.session.created","session":{"id":"sess_from_openai"}}\n\ndata: {"type":"agent.session.turn.output_text.done","text":"Ideia"}\n\ndata: {"type":"agent.session.turn.completed"}\n\n', { status: 201 }); },
  });
  const response = await handler(req());
  assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'result_unknown', retryAutomatically: false });
  assert.deepEqual(states, ['unknown']); assert.equal(paid, 1);
  assert.throws(() => createSessionBindings({ secret: Buffer.alloc(16) }));
});

test('sem assinador confiável nem autorização, não inicia chamada externa', async () => {
  let paid = 0;
  const base = { appOrigin: 'https://compor.test', resolveActor: async () => ({ userId, token: 'fake-user-token' }), ownsProject: async () => true, attempts: { start: async () => ({ id: attemptId, state: 'started', isNew: true }), finish: async () => {} }, fetch: async () => { paid++; throw Error(); } };
  assert.equal((await createProjectAgentHandler(base)(req())).status, 503);
  const bindings = createSessionBindings({ secret: Buffer.alloc(32, 17) });
  assert.equal((await createProjectAgentHandler({ ...base, bindings, ownsProject: async () => false })(req())).status, 403);
  assert.equal(paid, 0);
});
