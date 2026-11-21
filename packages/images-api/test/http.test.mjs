import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createImageHandler } from '../src/index.mjs';

const key = 'sk-test-secret-123456789012345';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
const request = body => new Request('http://localhost/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const byte of bytes.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

function stillImage(width, height, pixelData, interlace = 0) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[12] = interlace;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixelData, { level: 0 })),
    chunk('IEND'),
  ]);
}

test('uma pessoa autenticada solicita uma arte integral explicitamente e recebe PNG', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/images/generations');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gpt-image-2.6-flare');
    assert.equal(payload.quality, 'auto');
    assert.equal(payload.prompt, 'Uma oficina de cerâmica');
    assert.equal(payload.size, '1024x1280');
    assert.doesNotMatch(payload.prompt, /sem texto/i);
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
  const image = stillImage(1024, 1280, Buffer.alloc((1024 * 4 + 1) * 1280)).toString('base64');
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => Response.json({ data: [{ b64_json: image }] }) });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imageBase64, image);
});

test('bloqueia PNG incompleto ou inválido antes da revisão e da entrega', async () => {
  const bytes = Buffer.from(png, 'base64');
  const brokenChecksum = Buffer.from(bytes);
  brokenChecksum[32] ^= 1;
  const invalidImages = [
    bytes.subarray(0, 33),
    bytes.subarray(0, -12),
    brokenChecksum,
    Buffer.concat([bytes, Buffer.from('fora do PNG')]),
    Buffer.concat([bytes.subarray(0, 33), chunk('IDAT', Buffer.from('invalid')), chunk('IEND')]),
    stillImage(2049, 1, Buffer.alloc(2049 * 4 + 1)),
    stillImage(1, 1, Buffer.alloc(6)),
    stillImage(1, 1, Buffer.from([5, 0, 0, 0, 0])),
  ];
  for (const invalid of invalidImages) {
    const handler = createImageHandler({
      authenticate: async () => ({ userId: 'user-1' }),
      fetch: async () => Response.json({ data: [{ b64_json: invalid.toString('base64') }] }),
      reviewCandidate: async () => assert.fail('uma imagem inválida chegou à revisão'),
    });
    const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'generation_result_unknown', retryAutomatically: false });
  }
});

test('preserva os bytes de PNG entrelaçado válido', async () => {
  // An Adam7 2×2 RGBA image has two one-pixel rows and one two-pixel row.
  const imageBase64 = stillImage(2, 2, Buffer.alloc(5 + 5 + 9), 1).toString('base64');
  const handler = createImageHandler({
    authenticate: async () => ({ userId: 'user-1' }),
    fetch: async () => Response.json({ data: [{ b64_json: imageBase64 }] }),
  });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imageBase64, imageBase64);
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

test('400, 429 e 500 do provedor são classificados sem segunda chamada', async () => {
  const cases = [
    [400, 400, { error: 'generation_not_produced', closureReason: 'provider_rejected_400', providerOutcome: 'failure', retryAutomatically: false }],
    [429, 429, { error: 'generation_not_produced', closureReason: 'provider_rejected_429', providerOutcome: 'retryable', retryAutomatically: false }],
    [500, 503, { error: 'generation_not_produced', closureReason: 'result_unknown', providerOutcome: 'retryable', retryAutomatically: false }],
    [502, 503, { error: 'generation_not_produced', closureReason: 'result_unknown', providerOutcome: 'retryable', retryAutomatically: false }],
  ];
  for (const [providerStatus, status, body] of cases) {
    let calls = 0;
    const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => { calls++; return new Response('erro sintético', { status: providerStatus }); } });
    const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
    assert.equal(calls, 1);
  }
});

test('timeout do provedor continua resultado desconhecido e não repete a chamada', async () => {
  let calls = 0;
  const handler = createImageHandler({ authenticate: async () => ({ userId: 'user-1' }), fetch: async () => { calls++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); } });
  const response = await handler(request({ apiKey: key, prompt: 'Teste', authorizeGeneration: true }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'generation_result_unknown', retryAutomatically: false });
  assert.equal(calls, 1);
});

test('edição envia os pixels originais em multipart na ordem aprovada, sem URLs remotas',async()=>{
 const originals=[Buffer.from(png,'base64'),Buffer.concat([Buffer.from(png,'base64'),Buffer.from([1,2,3])])];
 let calls=0;
 const handler=createImageHandler({authenticate:async()=>({userId:'user-1'}),fetch:async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(options.headers['Content-Type'],undefined);
  const form=options.body;assert.ok(form instanceof FormData);assert.equal(form.get('model'),'gpt-image-2.6-flare');assert.equal(form.get('size'),'1024x1280');
  assert.equal(form.get('prompt'),'Título literal R$ 129,90');
  const files=form.getAll('image[]');assert.equal(files.length,2);
  for(let i=0;i<files.length;i++){assert.equal(files[i].type,'image/png');assert.deepEqual(Buffer.from(await files[i].arrayBuffer()),originals[i]);}
  return Response.json({data:[{b64_json:png}]});
 }});
 const response=await handler(request({apiKey:key,prompt:'Título literal R$ 129,90',authorizeGeneration:true,images:originals.map(data=>({mime:'image/png',data:data.toString('base64')}))}));
 assert.equal(response.status,200);assert.equal(calls,1);
 for(const images of [[{url:'http://127.0.0.1/image'}],[{mime:'image/png',data:'https://example.com/x'}],[{mime:'image/jpeg',data:png}]]){
  assert.equal((await handler(request({apiKey:key,prompt:'Teste',authorizeGeneration:true,images}))).status,400);
 }
 assert.equal(calls,1);
});
