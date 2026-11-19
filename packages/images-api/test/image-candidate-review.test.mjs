import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageHandler, createOpenAiImageCandidateReviewer } from '../src/index.mjs';

const apiKey = 'sk-test-secret-123456789012345';
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
const prompt = 'Oficina de cerâmica: sábado, R$ 85';
const usage = { input_tokens: 16, output_tokens: 196, total_tokens: 212 };
const finding = { code: 'required_text', region: 'rodapé', evidence: 'A arte mostra R$ 35.' };

function request(body = {}, signal) {
  const input = { apiKey, prompt, authorizeGeneration: true, ...body };
  return new Request('http://localhost/image', { method: 'POST', body: JSON.stringify(input), signal });
}

function fixture(reviewCandidate, { validImage = true, userId = 'user-1' } = {}) {
  const calls = { generate: 0, review: 0 };
  const handler = createImageHandler({
    authenticate: async () => ({ userId }),
    fetch: async () => {
      calls.generate++;
      return Response.json({ data: [{ b64_json: validImage ? imageBase64 : 'invalid' }], usage });
    },
    reviewCandidate: async value => {
      calls.review++;
      return reviewCandidate(value);
    },
  });
  return { handler, calls };
}

test('revisa a imagem e o prompt da operação antes de devolver os mesmos bytes', async () => {
  const { handler, calls } = fixture(async candidate => {
    assert.deepEqual(candidate, { prompt, imageBase64, mediaType: 'image/png', signal: candidate.signal });
    assert.ok(candidate.signal instanceof AbortSignal);
    return { decision: 'approve', findings: [] };
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { imageBase64, mediaType: 'image/png', usage });
  assert.deepEqual(calls, { generate: 1, review: 1 });
});

test('detém uma imagem reprovada mesmo quando a requisição pede sua aprovação', async () => {
  const { handler, calls } = fixture(async () => ({ decision: 'reject', findings: [finding] }));
  const response = await handler(request({ reviewCandidate: { decision: 'approve', findings: [] } }));
  assert.equal(response.status, 422);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'image_quality_rejected', retryAutomatically: false, usage });
  assert.deepEqual(calls, { generate: 1, review: 1 });
});

test('detém a imagem em caso de dúvida, resposta ambígua ou erro de transporte do juiz', async () => {
  const results = [
    async () => ({ decision: 'unsure', findings: [] }),
    async () => ({ decision: 'approve', findings: [finding] }),
    async () => ({ decision: 'reject', findings: [] }),
    async () => ({ decision: 'reject', findings: [{ ...finding, evidence: '' }] }),
    async () => ({ decision: 'approve', findings: [], extra: 'text' }),
    async () => ({ decision: 'approve' }),
    async () => 'approve',
    async () => { throw Error(`provider response ${apiKey}`); },
  ];
  for (const review of results) {
    const { handler, calls } = fixture(review);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
    assert.deepEqual(calls, { generate: 1, review: 1 });
  }
});

test('retém após o prazo mesmo se o juiz só responder depois', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const started = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const { handler, calls } = fixture(({ signal }) => {
    started.resolve(signal);
    return pending.promise;
  });

  const responsePromise = handler(request());
  const signal = await started.promise;
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(15_000);
  const response = await responsePromise;
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
  pending.resolve({ decision: 'approve', findings: [] });
  assert.deepEqual(calls, { generate: 1, review: 1 });
});

test('identidade, autorização e resultado da geração continuam sendo verificados antes da revisão', async () => {
  const review = async () => ({ decision: 'approve', findings: [] });
  const unauthorized = fixture(review, { userId: null });
  assert.equal((await unauthorized.handler(request())).status, 401);
  assert.deepEqual(unauthorized.calls, { generate: 0, review: 0 });

  const invalidImage = fixture(review, { validImage: false });
  assert.equal((await invalidImage.handler(request({ authorizeGeneration: false }))).status, 400);
  assert.deepEqual(invalidImage.calls, { generate: 0, review: 0 });
  const response = await invalidImage.handler(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'generation_result_unknown', retryAutomatically: false });
  assert.deepEqual(invalidImage.calls, { generate: 1, review: 0 });
});

const reviewKey = 'sk-test-review-0123456789012345';
const allPass = {
  visual_integrity: 'pass',
  required_text: 'pass',
  factual_fidelity: 'pass',
  generic_direction: 'pass',
};
const approve = { checks: allPass, decision: 'approve', findings: [] };
const message = content => ({ type: 'message', role: 'assistant', status: 'completed', content });
const completed = value => Response.json({
  status: 'completed',
  output: [{ type: 'reasoning' }, message([{ type: 'output_text', text: JSON.stringify(value) }])],
});

test('envia somente prompt e PNG ao juiz sem ferramentas, com a credencial de revisão', async () => {
  const captured = [];
  const review = createOpenAiImageCandidateReviewer({
    apiKey: reviewKey,
    fetch: async (url, init) => {
      captured.push({ url, init });
      return completed(approve);
    },
  });
  const { handler } = fixture(review);
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imageBase64, mediaType: 'image/png', usage });
  assert.equal(captured.length, 1);
  const [{ url, init }] = captured;
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.headers.Authorization, `Bearer ${reviewKey}`);
  assert.ok(!init.body.includes(apiKey) && !init.body.includes(reviewKey));
  const body = JSON.parse(init.body);
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, []);
  assert.ok(!body.instructions.includes(prompt));
  assert.deepEqual(body.input, [{ role: 'user', content: [
    { type: 'input_text', text: JSON.stringify({ pedido: prompt }) },
    { type: 'input_image', detail: 'high', image_url: `data:image/png;base64,${imageBase64}` },
  ] }]);
});

test('uma falha concreta do juiz volta como reprovação e não expõe a imagem nem o parecer', async () => {
  const review = createOpenAiImageCandidateReviewer({
    apiKey: reviewKey,
    fetch: async () => completed({
      checks: { ...allPass, required_text: 'fail' }, decision: 'reject', findings: [finding],
    }),
  });
  const { handler } = fixture(review);
  const response = await handler(request());
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'image_quality_rejected', retryAutomatically: false, usage });
});

test('separa os textos literais aprovados do pedido e ignora campo de revisão vindo do corpo HTTP', async () => {
  const transmitted = [];
  const review = createOpenAiImageCandidateReviewer({
    apiKey: reviewKey,
    fetch: async (_url, init) => {
      transmitted.push(JSON.parse(JSON.parse(init.body).input[0].content[0].text));
      return completed(approve);
    },
  });
  const { handler } = fixture(review);
  const posted = { requiredText: ['Domingo'] };
  assert.equal((await handler(request(posted), { requiredText: ['Sábado', 'R$ 85'] })).status, 200);
  assert.equal((await handler(request(posted))).status, 200);
  assert.deepEqual(transmitted, [
    { pedido: prompt, textosLiteraisAprovados: ['Sábado', 'R$ 85'] },
    { pedido: prompt },
  ]);
});

test('limita o texto literal aprovado e impede transferência de credenciais', async () => {
  const generated = fixture(async () => ({ decision: 'approve', findings: [] }));
  for (const requiredText of [[apiKey], [' '], Array(24).fill('Sábado'), ['f'.repeat(501)]]) {
    const response = await generated.handler(request(), { requiredText });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }
  assert.deepEqual(generated.calls, { generate: 0, review: 0 });
  let dedicatedCalls = 0;
  const dedicated = createOpenAiImageCandidateReviewer({
    apiKey: reviewKey,
    fetch: async () => { dedicatedCalls++; return completed(approve); },
  });
  const requestToJudge = fixture(dedicated);
  const response = await requestToJudge.handler(request(), { requiredText: [reviewKey] });
  assert.equal(response.status, 503);
  assert.equal(dedicatedCalls, 0);
  assert.deepEqual(await response.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
});

test('contradição, recusa, payload excedente e falha HTTP retêm os bytes sem nova tentativa', async () => {
  const cases = [
    () => completed({ ...approve, checks: { ...allPass, factual_fidelity: 'uncertain' } }),
    () => completed({ ...approve, checks: { ...allPass, factual_fidelity: 'fail' }, decision: 'reject', findings: [finding] }),
    () => Response.json({ status: 'completed', output: [message([{ type: 'refusal', refusal: 'sem parecer' }])] }),
    () => Response.json({ status: 'incomplete', output: [] }),
    () => completed({ ...approve, extra: true }),
    () => new Response('x'.repeat(65_537)),
    () => Response.json({ error: 'over quota' }, { status: 429 }),
    () => { throw Error('connection lost'); },
  ];
  for (const result of cases) {
    let calls = 0;
    const review = createOpenAiImageCandidateReviewer({
      apiKey: reviewKey,
      fetch: async () => {
        calls++;
        return result();
      },
    });
    const { handler } = fixture(review);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
    assert.equal(calls, 1);
  }
});

test('verifica autorização antes do envio e imediatamente antes de liberar o PNG', async () => {
  const review = async () => ({ decision: 'approve', findings: [] });
  const precheck = fixture(review);
  const refused = await precheck.handler(request(), { authorizeReview: async () => false });
  assert.equal(refused.status, 503);
  assert.deepEqual(precheck.calls, { generate: 1, review: 0 });

  const postcheck = fixture(review);
  let checked = 0;
  const revoked = await postcheck.handler(request(), { authorizeReview: async () => ++checked === 1 });
  assert.equal(revoked.status, 503);
  assert.deepEqual(await revoked.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
  assert.equal(checked, 2);
  assert.deepEqual(postcheck.calls, { generate: 1, review: 1 });
});

test('cancelamento da requisição aborta o parecer e impede aprovação atrasada', async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const { handler, calls } = fixture(({ signal }) => {
    started.resolve(signal);
    return pending.promise;
  });
  const result = handler(request({}, controller.signal));
  const signal = await started.promise;
  controller.abort();
  const response = await result;
  pending.resolve({ decision: 'approve', findings: [] });
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'image_quality_inconclusive', retryAutomatically: false, usage });
  assert.deepEqual(calls, { generate: 1, review: 1 });
});
