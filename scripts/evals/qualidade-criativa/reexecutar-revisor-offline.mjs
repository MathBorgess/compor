import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { createImageHandler, createOpenAiImageCandidateReviewer } from '../../../packages/images-api/src/index.mjs';

const endpoint = 'https://api.openai.com/v1/responses';
const fixturePath = 'scripts/evals/qualidade-criativa/fixtures/';
const generationKey = 'sk-fixture-generation-0123456789012345';
const reviewKey = 'sk-fixture-review-0123456789012345';
const mode = process.argv[2];
assert.ok(process.argv.length === 2 || process.argv.length === 3 && ['--politica', '--respostas'].includes(mode),
  'O replay offline aceita --politica ou --respostas.');
let capturedPolicy;
const checks = {
  visual_integrity: 'pass',
  required_text: 'pass',
  factual_fidelity: 'pass',
  generic_direction: 'pass',
};
const controls = [
  { id: 'feira-conceito-especifico', file: 'feira-impressa.png', editorial: 'pass' },
  {
    id: 'feira-polida-mas-generica', file: 'feira-generica.png', editorial: 'revise',
    finding: { code: 'generic_direction', region: 'centro', evidence: 'O pote não apresenta o motivo do calendário.' },
  },
  {
    id: 'feira-data-contaminada', file: 'feira-data-corrompida.png', editorial: 'block',
    finding: { code: 'required_text', region: 'rodapé', evidence: 'A data contém a grafia «agosfo».' },
  },
  {
    id: 'feira-pote-fundido', file: 'feira-pote-fundido.png', editorial: 'block',
    finding: { code: 'visual_integrity', region: 'pote central', evidence: 'Uma segunda borda se funde com o corpo do pote.' },
  },
];

const sha256 = value => createHash('sha256').update(value).digest('hex');
const verdictForControl = finding => finding
  ? { checks: { ...checks, [finding.code]: 'fail' }, decision: 'reject', findings: [finding] }
  : { checks, decision: 'approve', findings: [] };

function simulatedResponse(verdict) {
  return Response.json({ status: 'completed', output: [{
    type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify(verdict) }],
  }] });
}

async function replay(bytes, prompt, verdict, expectedStatus) {
  const generationRequests = [];
  const reviewRequests = [];
  const imageBase64 = bytes.toString('base64');
  const reviewCandidate = createOpenAiImageCandidateReviewer({
    apiKey: reviewKey,
    fetch: async (url, init) => {
      reviewRequests.push({ url, init });
      return simulatedResponse(verdict);
    },
  });
  const handler = createImageHandler({
    authenticate: async () => ({ userId: 'criador-sintetico' }),
    reviewCandidate,
    fetch: async (url, init) => {
      generationRequests.push({ url, init });
      return Response.json({ data: [{ b64_json: imageBase64 }] });
    },
  });
  const response = await handler(new Request('https://compor.test/internal-image', {
    method: 'POST', body: JSON.stringify({ apiKey: generationKey, prompt, authorizeGeneration: true }),
  }), { authorizeReview: async () => true });

  assert.equal(generationRequests.length, 1);
  assert.equal(generationRequests[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(JSON.parse(generationRequests[0].init.body).prompt, prompt);
  assert.equal(reviewRequests.length, 1);
  const [{ url, init }] = reviewRequests;
  assert.equal(url, endpoint);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers.Authorization, `Bearer ${reviewKey}`);
  assert.ok(!init.body.includes(generationKey) && !init.body.includes(reviewKey));
  const { input, ...policy } = JSON.parse(init.body);
  capturedPolicy ??= { endpoint, ...policy, imageDetail: input[0].content[1].detail };
  assert.equal(policy.store, false);
  assert.deepEqual(policy.tools, []);
  assert.equal(input.length, 1);
  assert.equal(input[0].role, 'user');
  const [text, image] = input[0].content;
  assert.equal(input[0].content.length, 2);
  assert.deepEqual(text, { type: 'input_text', text: JSON.stringify({ pedido: prompt }) });
  assert.equal(image.type, 'input_image');
  assert.equal(image.detail, 'high');
  assert.ok(image.image_url === `data:image/png;base64,${imageBase64}`);

  const result = await response.json();
  if (expectedStatus !== undefined) assert.equal(response.status, expectedStatus);
  if (response.status === 200) {
    assert.equal(result.mediaType, 'image/png');
    assert.ok(result.imageBase64 === imageBase64);
  } else {
    assert.ok([422, 503].includes(response.status));
    assert.deepEqual(result, {
      error: response.status === 422 ? 'image_quality_rejected' : 'image_quality_inconclusive',
      retryAutomatically: false, usage: null,
    });
  }
  return {
    policySha256: sha256(JSON.stringify({ endpoint, policy, imageDetail: image.detail })),
    injectedDecision: verdict.decision,
    status: response.status,
    pngReleased: 'imageBase64' in result,
    requestBytes: Buffer.byteLength(init.body),
  };
}

const dataset = JSON.parse(await readFile(new URL('dataset.v1.json', import.meta.url), 'utf8'));
assert.equal(dataset.version, 1);
const indexed = new Map(dataset.controls.map(case_ => [case_.id, case_]));
const canonical = indexed.get(controls[0].id);
assert.equal(dataset.cases.find(case_ => case_.id === canonical.caseId)?.provenance.kind, 'synthetic');
const prompt = canonical.artifact.imagePrompt;
assert.ok(typeof prompt === 'string' && prompt.trim());

const outcomes = [];
for (const control of controls) {
  const entry = indexed.get(control.id);
  assert.equal(entry.caseId, canonical.caseId);
  assert.equal(entry.expected.disposition, control.editorial);
  assert.equal(entry.artifact.image, `${fixturePath}${control.file}`);
  const file = new URL(`fixtures/${control.file}`, import.meta.url);
  assert.ok((await lstat(file)).isFile(), 'O controle deve ser um PNG regular do repositório.');
  const bytes = await readFile(file);
  const pngSha256 = sha256(bytes);
  assert.equal(pngSha256, dataset.assetSha256[entry.artifact.image]);
  const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.deepEqual([width, height], [720, 900]);
  const metadata = { id: control.id, pngSha256, width, height, pngBytes: bytes.length };
  outcomes.push({ ...metadata, editorialLabel: control.editorial, ...await replay(bytes, prompt, verdictForControl(control.finding), control.finding ? 422 : 200) });
  if (control.id === canonical.id) {
    outcomes.push({ ...metadata, id: `${control.id}-parecer-inconclusivo`, ...await replay(bytes, prompt, {
      checks: { ...checks, generic_direction: 'uncertain' }, decision: 'unsure', findings: [],
    }, 503) });
  }
}
const policySha256 = outcomes[0].policySha256;
assert.ok(outcomes.every(item => item.policySha256 === policySha256));
let output = {
  mode: 'offline_simulated_transport', datasetVersion: dataset.version, promptSha256: sha256(prompt), policySha256,
  outcomes: outcomes.map(({ policySha256: _, ...item }) => item),
};
if (mode === '--politica') output = capturedPolicy;
if (mode === '--respostas') {
  const answers = JSON.parse(readFileSync(0, 'utf8'));
  assert.ok(Array.isArray(answers) && answers.length <= 12);
  // The adapter validates only the verdict here, with a fixed synthetic PNG.
  const fixture = await readFile(new URL('fixtures/feira-impressa.png', import.meta.url));
  output = await Promise.all(answers.map(answer => replay(fixture, prompt, answer)));
}
console.log(JSON.stringify(output, null, 2));
