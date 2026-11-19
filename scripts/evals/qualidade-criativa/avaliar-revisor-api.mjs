import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, readFile, realpath } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createImageHandler, createOpenAiImageCandidateReviewer } from '../../../packages/images-api/src/index.mjs';
import { limitedText } from '../../../packages/images-api/src/limited-text.mjs';

const endpoint = 'https://api.openai.com/v1/responses';
const generationKey = 'sk-fixture-generation-0123456789012345';
const simulatedReviewKey = 'sk-fixture-review-0123456789012345';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [
  ['feira-conceito-especifico', 'feira-impressa.png', 200, null],
  ['feira-polida-mas-generica', 'feira-generica.png', 422, 'generic_direction'],
  ['feira-data-contaminada', 'feira-data-corrompida.png', 422, 'required_text'],
  ['feira-pote-fundido', 'feira-pote-fundido.png', 422, 'visual_integrity'],
  ['data-aprovada-coincide', 'feira-impressa.png', 200, null, ['Feira de compotas', '14 de agosto']],
  ['data-aprovada-conflita', 'feira-impressa.png', 422, 'required_text', ['Feira de compotas', '15 de agosto']],
];

function redactedIdentifier(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,119}$/i.test(value)
    && !/^sk-/i.test(value) ? value : null;
}

function tokens(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_100_000 ? value : null;
}

function readUsage(usage) {
  if (!usage) return null;
  return {
    input: tokens(usage.input_tokens), output: tokens(usage.output_tokens), total: tokens(usage.total_tokens),
    cached: tokens(usage.input_tokens_details?.cached_tokens), reasoning: tokens(usage.output_tokens_details?.reasoning_tokens),
  };
}

function clipboardKey() {
  const result = spawnSync('/usr/bin/pbpaste', ['-Prefer', 'txt'], { encoding: 'utf8', timeout: 5_000, maxBuffer: 4096 });
  const value = result.stdout?.trim();
  if (result.status !== 0 || !/^sk-[A-Za-z0-9_-]{20,300}$/.test(value ?? '')) {
    throw Error('A área de transferência não contém uma chave no formato esperado');
  }
  return value;
}

async function loadInputs() {
  const dataset = JSON.parse(await readFile(new URL('dataset.v1.json', import.meta.url), 'utf8'));
  const anchor = dataset.controls.find(item => item.id === cases[0][0]);
  assert.equal(dataset.cases.find(item => item.id === anchor.caseId)?.provenance.kind, 'synthetic');
  const original = anchor.artifact.imagePrompt;
  const wording = 'Sem outro texto, rótulo, faixas ou marcas.';
  assert.equal(original.split(wording).length, 2);
  const prompt = original.replace(wording, 'Sem outro texto, rótulos, marcas ou faixas decorativas separadas do pote. O friso horizontal fino na tampa é parte da ilustração.');
  const inputs = await Promise.all(cases.map(async ([id, file, expectedStatus, expectedFinding, requiredText]) => {
    const imageUrl = new URL(`fixtures/${file}`, import.meta.url);
    const frozen = `scripts/evals/qualidade-criativa/fixtures/${file}`;
    const source = dataset.controls.find(item => item.artifact.image === frozen);
    assert.equal(source?.caseId, anchor.caseId);
    assert.equal(await realpath(imageUrl), decodeURIComponent(imageUrl.pathname));
    const bytes = await readFile(imageUrl);
    const imageSha256 = sha256(bytes);
    assert.equal(imageSha256, dataset.assetSha256[frozen]);
    assert.ok(bytes.length <= 65_536);
    assert.equal(bytes.readUInt32BE(16), 720);
    assert.equal(bytes.readUInt32BE(20), 900);
    return { id, bytes, imageSha256, expectedStatus, expectedFinding, requiredText };
  }));
  return { prompt, inputs };
}

function simulate(expectedStatus, expectedFinding) {
  const checks = { visual_integrity: 'pass', required_text: 'pass', factual_fidelity: 'pass', generic_direction: 'pass' };
  const findings = [];
  const decision = expectedStatus === 422 ? 'reject' : 'approve';
  if (expectedFinding) {
    checks[expectedFinding] = 'fail';
    findings.push({ code: expectedFinding, region: 'centro', evidence: 'Evidência sintética de simulação.' });
  }
  return Response.json({
    status: 'completed', model: 'gpt-6.2-sol',
    output: [{ type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify({ decision, checks, findings }) }] }],
  });
}

async function evaluate({ input, prompt, apiKey, execute, ledger, index }) {
  const { id, bytes, imageSha256, expectedStatus, expectedFinding, requiredText } = input;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const metadata = {
    id, ordinal: index + 1, imageSha256, expectedStatus, expectedFinding,
    startedAt: new Date().toISOString(), dispatches: 0, httpStatus: null, usage: null,
  };
  let rawVerdict;
  const append = event => ledger.writeFile(`${JSON.stringify(event)}\n`);
  const reviewCandidate = createOpenAiImageCandidateReviewer({
    apiKey,
    fetch: async (url, options) => {
      assert.equal(url, endpoint);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(metadata.dispatches, 0);
      const { input: requestInputs, ...policy } = JSON.parse(options.body);
      assert.equal(policy.model, 'gpt-6.2-sol');
      assert.equal(policy.store, false);
      assert.equal(policy.max_output_tokens, 1400);
      assert.deepEqual(policy.tools, []);
      assert.equal(requestInputs[0].content[1].image_url, `data:image/png;base64,${bytes.toString('base64')}`);
      const sentText = requestInputs[0].content[0].text;
      assert.deepEqual(JSON.parse(sentText), { pedido: prompt, ...(requiredText ? { textosLiteraisAprovados: requiredText } : {}) });
      assert.ok(Buffer.byteLength(sentText) + Buffer.byteLength(JSON.stringify(policy)) < 8192);
      metadata.policySha256 = sha256(JSON.stringify({ endpoint, policy, imageDetail: requestInputs[0].content[1].detail }));
      metadata.requestedModel = policy.model;
      metadata.textSha256 = sha256(sentText);
      if (options.signal.aborted) return new Response(null, { status: 503 });
      metadata.dispatches += 1;
      await append({ type: execute ? 'dispatch' : 'simulate', ...metadata });
      await ledger.sync();

      const provider = execute ? await fetch(url, options) : simulate(expectedStatus, expectedFinding);
      metadata.httpStatus = provider.status;
      metadata.requestId = redactedIdentifier(provider.headers.get('x-request-id'));
      const raw = await limitedText(provider.body, 64 * 1024);
      const body = JSON.parse(raw);
      metadata.responseId = redactedIdentifier(body.id);
      metadata.model = redactedIdentifier(body.model);
      metadata.serviceTier = redactedIdentifier(body.service_tier);
      metadata.envelopeStatus = redactedIdentifier(body.status);
      metadata.incompleteReason = redactedIdentifier(body.incomplete_details?.reason);
      metadata.providerError = redactedIdentifier(body.error?.code);
      metadata.providerErrorType = redactedIdentifier(body.error?.type);
      metadata.usage = readUsage(body.usage);
      if (provider.ok) {
        const message = body.output?.find?.(item => item?.type === 'message');
        const content = message?.content?.find?.(item => item?.type === 'output_text');
        if (typeof content?.text === 'string') {
          try { rawVerdict = JSON.parse(content.text); } catch { /* the adapter validates the response */ }
        }
      }
      return new Response(raw, { status: provider.status, headers: { 'content-type': 'application/json' } });
    },
  });
  const handler = createImageHandler({
    authenticate: async () => ({ userId: 'sintetico' }),
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/images/generations');
      assert.equal(options.headers.Authorization, `Bearer ${generationKey}`);
      return Response.json({ data: [{ b64_json: bytes.toString('base64') }] });
    },
    reviewCandidate,
  });
  const response = await handler(new Request('https://compor.test/internal-image', {
    method: 'POST', body: JSON.stringify({ apiKey: generationKey, prompt, authorizeGeneration: true }),
  }), { requiredText, authorizeReview: async () => true });
  const body = await response.json();
  const findings = Array.isArray(rawVerdict?.findings) && response.status === 422
    ? rawVerdict.findings.map(({ code, region, evidence }) => ({ code, region, evidence })) : [];
  const released = response.status === 200 && body.imageBase64 === bytes.toString('base64');
  const row = {
    ...metadata, elapsedMs: elapsed(), appStatus: response.status, released,
    declaredDecision: redactedIdentifier(rawVerdict?.decision),
    findings, matches: response.status === expectedStatus &&
      (expectedFinding ? findings.some(item => item.code === expectedFinding) : released),
  };
  await append({ type: 'result', ...row });
  return row;
}

const [mode, output, ...extra] = process.argv.slice(2);
assert.ok(['--simular', '--executar'].includes(mode) && output && extra.length === 0,
  'Uso: avaliar-revisor-api.mjs --simular|--executar CAMINHO-NOVO.ndjson');
const execute = mode === '--executar';
const { prompt, inputs } = await loadInputs();
assert.equal(inputs.length, 6);
const apiKey = execute ? clipboardKey() : simulatedReviewKey;
assert.notEqual(apiKey, generationKey);
const ledger = await open(output, 'wx', 0o600);
try {
  const rows = [];
  for (const [index, input] of inputs.entries()) {
    const row = await evaluate({ input, prompt, apiKey, execute, ledger, index });
    rows.push(row);
    if (execute && (row.dispatches !== 1 || row.httpStatus !== 200 || !row.usage ||
      (row.appStatus === 503 && (row.envelopeStatus !== 'completed' || row.declaredDecision !== 'unsure')))) break;
  }
  const summary = {
    type: 'summary', mode: execute ? 'responses_api' : 'simulated', planned: inputs.length,
    dispatches: rows.reduce((sum, row) => sum + row.dispatches, 0),
    matches: rows.filter(row => row.matches).length, results: rows.length,
  };
  await ledger.writeFile(`${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary));
} finally {
  await ledger.close();
}
