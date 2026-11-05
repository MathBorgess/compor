import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageHandler } from '../src/index.mjs';

const key = 'sk-test-secret-123456789012345';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const request = body => new Request('http://localhost/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('uma pessoa autenticada solicita imagem base explicitamente e recebe PNG', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/images/generations');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gpt-image-2.6-flare');
    assert.equal(payload.quality, 'auto');
    assert.match(payload.prompt, /sem texto/i);
    assert.equal(options.body.includes(key), false);
    return Response.json({ data: [{ b64_json: png }] });
  } });
  const response = await handler(request({ apiKey: key, prompt: 'Uma oficina de cerâmica', authorizeGeneration: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imageBase64: png, mediaType: 'image/png', usage: null });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);
});

test('uso informado pelo provedor é retornado sem texto ou campos desconhecidos', async () => {
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => Response.json({ data: [{ b64_json: png }], usage: { total_tokens: 300, input_tokens: 100, output_tokens: 200, detail: `não expor ${key}` } }) });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.deepEqual((await response.json()).usage, { input_tokens: 100, output_tokens: 200, total_tokens: 300 });
});

test('uso parcial preserva contagens válidas e marca os demais campos desconhecidos', async () => {
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => Response.json({ data: [{ b64_json: png }], usage: { input_tokens: 100, output_tokens: -1, detail: key } }) });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.deepEqual((await response.json()).usage, { input_tokens: 100, output_tokens: null, total_tokens: null });
});

test('preserva detalhamento numérico de texto e imagem sem copiar conteúdo arbitrário', async () => {
  const handler=createImageHandler({authenticate:async()=>({userId:'user-1'}),fetch:async()=>Response.json({data:[{b64_json:png}],usage:{input_tokens:16,output_tokens:196,total_tokens:212,input_tokens_details:{text_tokens:16,image_tokens:0,extra:key},output_tokens_details:{image_tokens:196,extra:key}}})});
  const response=await handler(request({apiKey:key,prompt:'Teste',authorizeGeneration:true}));const usage=(await response.json()).usage;
  assert.deepEqual(usage,{input_tokens:16,output_tokens:196,total_tokens:212,input_tokens_details:{text_tokens:16,image_tokens:0},output_tokens_details:{image_tokens:196}});
  assert.doesNotMatch(JSON.stringify(usage),/sk-/);
});

test('não inicia uma operação paga sem identidade e autorização explícita', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw new Error('should not be called'); };
  const anonymous = createImageHandler({ authenticate: async () => null, fetch });
  const authenticated = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch });
  assert.equal((await anonymous(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }))).status, 401);
  assert.equal((await authenticated(request({ apiKey: key, prompt: 'Teste' }))).status, 400);
  assert.equal(calls, 0);
});

test('após desconexão, resultado e gasto são desconhecidos e não há retry automático', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => { calls++; throw new Error(`transport ${key}`); } });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.doesNotMatch(text, /sk-test-secret/);
  assert.deepEqual(JSON.parse(text), { error: 'generation_result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});

test('chave no prompt ou requisição excessiva nunca chegam ao provedor', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => { calls++; } });
  assert.equal((await handler(request({ apiKey: key, prompt: `Texto ${key}`, authorizeGeneration: true }))).status, 400);
  assert.equal((await handler(request({ apiKey: key, prompt: 'x'.repeat(17000), authorizeGeneration: true }))).status, 400);
  assert.equal(calls, 0);
});

test('resposta excessiva do provedor é tratada como resultado desconhecido sem retry', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => { calls++; return new Response('x'.repeat(12 * 1024 * 1024 + 1)); } });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'generation_result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});

test('imagem PNG com vários megabytes é aceita dentro do limite documentado', async () => {
  const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(4 * 1024 * 1024)]).toString('base64');
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => Response.json({ data: [{ b64_json: image }] }) });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imageBase64, image);
});

test('credencial recusada e imagem inválida não expõem respostas do provedor', async () => {
  for (const status of [401, 403]) {
    const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => new Response(key, { status }) });
    const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'openai_credentials_rejected' });
  }
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => Response.json({ data: [{ b64_json: 'not-an-image' }] }) });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'generation_result_unknown', retryAutomatically: false });
});
