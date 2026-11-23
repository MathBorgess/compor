import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fingerprintLiveCarouselCandidate, runLiveCarousel } from './live.mjs';
import { sha256 } from './protocol.mjs';

const fakeKey = 'sk-test-local-fixture-only-never-for-provider';
const imageFixture = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==';
const candidateSha256 = await fingerprintLiveCarouselCandidate();
const devPath = fileURLToPath(new URL('./dev-cases.json', import.meta.url));

async function writeSuite(path, split, prefix, first = {}) {
  const cases = Array.from({ length: 6 }, (_, index) => ({
    id: `${prefix}-${index}`, mode: 'editorial_art', expected: 'deliver_deck',
    briefing: `Exemplo sintético ${prefix}: situação ${index}.`, facts: [`Fato hipotético ${index}.`], strata: ['sintetico'],
    ...(index === 0 ? first : {}),
  }));
  const bytes = JSON.stringify({ version: 1, split, cases });
  await writeFile(path, bytes);
  return { path, split, sha256: sha256(bytes) };
}

function scenario(changeCovers = cover => cover) {
  const submissions = [];
  const headline = 'Um exemplo verificável';
  const deck = { mode: 'editorial_art', slides: [
    { id: 'abertura', layout: 'typo_breather', headline, alt: 'Título em fundo claro.' },
    { id: 'explicacao', layout: 'svg_diagram', headline: 'Uma escolha muda o caminho', diagram: { type: 'flow', labels: ['Antes', 'Depois'] }, alt: 'Duas etapas.' },
    { id: 'fecho', layout: 'cta_closing', headline: 'Salve o exemplo', alt: 'Convite para salvar.' },
  ] };
  const options = [headline, ...Array.from({ length: 9 }, (_, index) => `Exemplo candidato ${index}`)];
  const ranking = { order: options.map((_, index) => index + 1), rationale: 'A primeira é a mais específica.' };
  const cover = changeCovers({ coverOptions: options, coverRanking: ranking });
  const fetchApi = async (url, options) => {
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${fakeKey}`);
    const { pathname } = new URL(url);
    if (options.method === 'POST') {
      assert.equal(pathname, '/v1/agents/sessions');
      submissions.push(JSON.parse(options.body));
      return Response.json({ id: 'sess_local_mock' }, { headers: { 'x-request-id': 'req_local_mock' } });
    }
    if (pathname.endsWith('/items')) return Response.json({ data: [{
      type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', turn_id: 'turn_local_mock',
      content: [{ type: 'output_text', text: JSON.stringify({ outcome: 'delivered', deck, claims: [], ...cover }) }],
    }] });
    if (pathname.endsWith('/turns')) return Response.json({ data: [
      { id: 'turn_local_mock', session_id: 'sess_local_mock', subagent_id: null, status: 'completed' },
    ] });
    return Response.json({ usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } });
  };
  return { submissions, fetchApi };
}

function editorialFixture(change = value => value) {
  const slides = [
    { id: 'capa', layout: 'hero_bleed', headline: 'Defina a prioridade do mural' },
    { id: 'duas', layout: 'split_horizontal', headline: 'A prioridade do mural entra primeiro' },
    { id: 'tres', layout: 'split_vertical', headline: 'Arquive as opções que já passaram' },
    { id: 'quatro', layout: 'framed_plate', headline: 'Deixe um espaço para a revisão' },
    { id: 'fim', layout: 'cta_closing', headline: 'Salve antes da próxima revisão' },
  ].map(slide => ({ ...slide, alt: slide.headline + '.' }));
  const plates = [
    ['capa', 'Agulha no novelo', 'wide', 'organic', 'portrait'],
    ['duas', 'Farol de porto', 'macro', 'angular', 'landscape'],
    ['tres', 'Banco do parque', 'overhead', 'layered', 'portrait'],
    ['quatro', 'Giz no quadro', 'medium', 'linear', 'landscape'],
  ].map(([slideId, focalMetaphor, shotScale, silhouetteGeometry, panelAspect]) => ({
    slideId, focalMetaphor, shotScale, silhouetteGeometry, panelAspect, cognitiveFunction: 'anchor_metaphor',
  }));
  return scenario(value => change({
    ...value, coverArtBrief: 'Papéis coloridos sobre um mural editorial.',
    deck: { mode: 'editorial_art', tokens: { accent: '#9AB345' }, slides },
    artDirection: { master: { mediumEngine: 'cut_paper', lightAndOptics: 'soft_side' }, plates },
  }));
}

function imageResponse(call) {
  return Response.json({ data: [{ b64_json: imageFixture }], usage: { total_tokens: 12 } },
    { headers: { 'x-request-id': 'req_image_' + call } });
}

const artOptions = { key: fakeKey, cycle: 3, caseId: 'dev-amarelo-papel', render: false, artBatch: { maxImages: 4 } };

test('CLI pré-verifica o lote sem credencial, arquivo ou rede e recusa entradas fora do escopo', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-editorial-art-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidenceDir = join(root, 'new-evidence');
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const run = (overrides = {}, extra = []) => {
    const args = { cycle: '3', case: 'dev-amarelo-papel', evidence: evidenceDir, 'max-images': '4', ...overrides };
    return promisify(execFile)(process.execPath, [cli, 'art-batch', ...Object.entries(args).flatMap(([flag, value]) => ['--' + flag, value]),
      '--no-render', ...extra], { env: { PATH: process.env.PATH } });
  };
  const { stdout } = await run();
  assert.deepEqual(JSON.parse(stdout), { state: 'preflight', caseId: 'dev-amarelo-papel', cycle: 3, maxImages: 4 });
  await assert.rejects(readFile(join(evidenceDir, 'paid-active.json')), { code: 'ENOENT' });
  await assert.rejects(run({ cycle: '2' }), error => error.code === 1 && /--cycle 3/.test(error.stderr));
  await assert.rejects(run({ 'max-images': '7' }), error => error.code === 1 && /--max-images 2/.test(error.stderr));
  await assert.rejects(run({ case: 'dev-notas-revisao' }), error => error.code === 1 && /editorial_art/.test(error.stderr));
  await assert.rejects(run({}, ['--execute']), error => error.code === 1 && /Credencial inválida/.test(error.stderr));
  const link = join(root, 'repository');
  await symlink(fileURLToPath(new URL('../../../', import.meta.url)), link);
  await assert.rejects(run({ evidence: join(link, 'new-evidence') }), error => error.code === 1 && /fora do repositório/.test(error.stderr));
  await writeFile(join(root, 'paid-active.json'), 'canário');
  await assert.rejects(run({ evidence: root }), error => error.code === 1 && /aguarda reconciliação/.test(error.stderr));
});

test('gera a âncora S1, registra a onda e envia apenas seu raster como referência de estilo', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-editorial-art-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planner = editorialFixture();
  const imageCalls = [];
  const sourceHash = sha256(Buffer.from(imageFixture, 'base64'));
  const fetchApi = async (url, options) => {
    const { pathname } = new URL(url);
    if (!pathname.startsWith('/v1/images/')) return planner.fetchApi(url, options);
    const receiptPath = join(root, 'c3', artOptions.caseId + '.live-receipt.json');
    const { artBatch } = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.equal(new Headers(options.headers).get('authorization'), `Bearer ${fakeKey}`);
    let prompt;
    if (imageCalls.length === 0) {
      assert.equal(pathname, '/v1/images/generations');
      prompt = JSON.parse(options.body).prompt;
      assert.deepEqual(artBatch.plates.map(item => item.state), ['submitted', 'not_run', 'not_run', 'not_run']);
      assert.match(prompt, /Establish the editorial treatment/);
    } else {
      assert.equal(pathname, '/v1/images/edits');
      assert.ok(options.body instanceof FormData);
      const files = options.body.getAll('image[]');
      assert.equal(files.length, 1);
      assert.equal(files[0].type, 'image/png');
      assert.equal(sha256(Buffer.from(await files[0].arrayBuffer())), sourceHash);
      assert.equal(artBatch.plates[0].state, 'completed');
      if (imageCalls.length < 3) {
        assert.deepEqual(artBatch.plates.map(item => item.state), ['completed', 'submitted', 'submitted', 'not_run']);
      }
      prompt = options.body.get('prompt');
      assert.match(prompt, /strictly as a style reference/);
      assert.match(prompt, /Do not reproduce the reference subject/);
    }
    assert.match(prompt, /Zero text, letters, numbers/);
    assert.match(prompt, /cut_paper.*#9AB345/);
    imageCalls.push({ pathname, prompt });
    return imageResponse(imageCalls.length);
  };
  const result = await runLiveCarousel({ ...artOptions, root, fetchApi });
  assert.equal(result.state, 'planned');
  assert.equal(planner.submissions.length, 1);
  assert.match(planner.submissions[0].agent.instructions, /duas a 4 pranchas/);
  assert.equal(imageCalls.length, 4);
  assert.equal(result.receipt.image, null);
  assert.equal(result.receipt.artBatch.state, 'completed');
  const [anchor, ...followers] = result.receipt.artBatch.plates;
  assert.equal(anchor.sha256, sourceHash);
  assert.equal(anchor.styleReference, undefined);
  for (const follower of followers) {
    assert.equal(follower.styleReference.role, 'style_only');
    assert.equal(follower.styleReference.sourceSha256, sourceHash);
    assert.equal(follower.styleReference.transportSha256, sourceHash);
    assert.equal(follower.usage.total_tokens, 12);
  }
  const planBytes = await readFile(result.planPath);
  const materialized = JSON.parse(planBytes);
  assert.equal(materialized.slides.filter(slide => slide.art).length, 4);
  assert.equal(result.receipt.artBatch.finalPlanSha256, sha256(planBytes));
  assert.equal(result.receipt.artBatch.cadence.observed.visualCoverage, 0.8);
  for (const plate of [anchor, ...followers]) {
    const bytes = await readFile(join(root, 'c3', result.receipt.artBatch.outputDirectory, plate.file));
    assert.equal(sha256(bytes), plate.sha256);
  }
  assert.equal((await runLiveCarousel({ ...artOptions, root, fetchApi })).reused, true);
  await assert.rejects(runLiveCarousel({ ...artOptions, root, artBatch: { maxImages: 3 }, fetchApi }), /outro orçamento raster/);
  assert.equal(imageCalls.length, 4);
});

test('arte fora dos eixos, excesso ou falta de autorização bloqueiam antes do provedor de imagens', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-editorial-art-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = editorialFixture(value => {
    const [anchor, second] = value.artDirection.plates;
    Object.assign(second, { focalMetaphor: 'ÁGULHA NO NÓVELO', shotScale: anchor.shotScale });
    return value;
  });
  let images = 0;
  const fetchApi = (url, options) => {
    if (new URL(url).pathname.startsWith('/v1/images/')) {
      images += 1;
      return imageResponse(images);
    }
    return fixture.fetchApi(url, options);
  };
  const unapproved = { ...artOptions, root: join(directory, 'unapproved'), generateCover: false, fetchApi };
  await assert.rejects(runLiveCarousel(unapproved), /autorização de geração/);
  assert.equal(fixture.submissions.length, 0);
  const options = { ...artOptions, root: join(directory, 'invalid'), fetchApi };
  const invalid = await runLiveCarousel(options);
  const manifest = JSON.parse(await readFile(join(invalid.caseDirectory, 'qa-manifest.json'), 'utf8'));
  assert.ok(manifest.final.planFailures.includes('ART_ORTHOGONALITY'));
  const oversized = await runLiveCarousel({
    ...options, root: join(directory, 'oversized'), artBatch: { maxImages: 3 },
  });
  const capped = JSON.parse(await readFile(join(oversized.caseDirectory, 'qa-manifest.json'), 'utf8'));
  assert.ok(capped.final.planFailures.includes('ART_DIRECTION_CONTRACT'));
  assert.equal(images, 0);
});

test('uma edição desconhecida drena a onda, preserva raster confirmado e bloqueia reenvio', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-editorial-art-unknown-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planner = editorialFixture();
  let images = 0;
  const fetchApi = (url, options) => {
    const { pathname } = new URL(url);
    if (!pathname.startsWith('/v1/images/')) return planner.fetchApi(url, options);
    images += 1;
    if (options.body instanceof FormData && options.body.get('prompt').includes('Farol de porto')) {
      return new Response('resultado não confirmado', { status: 503 });
    }
    return imageResponse(images);
  };
  const options = { ...artOptions, root, fetchApi };
  const result = await runLiveCarousel(options);
  assert.equal(result.state, 'unknown');
  assert.equal(images, 3);
  const { artBatch: batch } = result.receipt;
  assert.deepEqual(batch.plates.map(plate => plate.state), ['completed', 'unknown', 'completed', 'not_run']);
  const bytes = await readFile(join(root, 'c3', batch.outputDirectory, batch.plates[2].file));
  assert.equal(sha256(bytes), batch.plates[2].sha256);
  assert.equal(JSON.parse(await readFile(join(root, 'paid-active.json'), 'utf8')).caseId, artOptions.caseId);
  await assert.rejects(runLiveCarousel(options), { code: 'EEXIST' });
  assert.equal(images, 3);
});

test('uma recusa confirmada da âncora encerra o lote sem consumir mais imagens', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-editorial-art-refused-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planner = editorialFixture();
  let images = 0;
  const fetchApi = (url, options) => {
    if (!new URL(url).pathname.startsWith('/v1/images/')) return planner.fetchApi(url, options);
    images += 1;
    return new Response('recusa confirmada', { status: 429 });
  };
  const options = { ...artOptions, root, fetchApi };
  const result = await runLiveCarousel(options);
  assert.equal(result.state, 'failed_execution');
  assert.deepEqual(result.receipt.artBatch.plates.map(plate => plate.state),
    ['failed_execution', 'not_run', 'not_run', 'not_run']);
  await assert.rejects(readFile(join(root, 'paid-active.json')), { code: 'ENOENT' });
  assert.equal((await runLiveCarousel(options)).reused, true);
  assert.equal(images, 1);
});

test('a opção ausente mantém a capa avulsa de C3 e suas evidências históricas', async t => {
  const root = await mkdtemp(join(tmpdir(), 'compor-editorial-art-legacy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planner = editorialFixture();
  let images = 0;
  const fetchApi = (url, options) => {
    if (new URL(url).pathname === '/v1/images/generations') return imageResponse(++images);
    return planner.fetchApi(url, options);
  };
  const { artBatch: _optIn, ...legacy } = artOptions;
  const result = await runLiveCarousel({ ...legacy, root, fetchApi });
  assert.equal(result.state, 'planned');
  assert.equal(result.receipt.artBatch, undefined);
  assert.equal(result.receipt.image.state, 'completed');
  assert.equal(images, 1);
  assert.match(planner.submissions[0].agent.instructions, /coverArtBrief/);
  assert.doesNotMatch(planner.submissions[0].agent.instructions, /artDirection/);
});

test('valida revisão, partição, caminho e integridade antes do primeiro envio', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-sealed-rejection-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'evidence');
  const sealedSuite = await writeSuite(join(directory, 'holdout.json'), 'holdout', 'reserve');
  const { submissions, fetchApi } = scenario();
  const options = { key: fakeKey, root, cycle: 4, candidateSha256, sealedSuite, render: false, fetchApi };
  await assert.rejects(runLiveCarousel({ ...options, cycle: 3 }), /holdout em C4/);
  await assert.rejects(runLiveCarousel({ ...options, candidateSha256: '0'.repeat(64) }), /candidato diverge/);
  await assert.rejects(runLiveCarousel({ ...options, sealedSuite: { ...sealedSuite, sha256: '0'.repeat(64) } }), /suíte privada diverge/);
  const link = join(directory, 'aponta-para-dev.json');
  await symlink(devPath, link);
  await assert.rejects(runLiveCarousel({ ...options, sealedSuite: { ...sealedSuite, path: link } }), /fora do repositório/);
  assert.equal(submissions.length, 0);
});

test('congela partições, conserva recibos e só envia o caso selecionado', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-sealed-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'evidence');
  const holdout = await writeSuite(join(directory, 'holdout.json'), 'holdout', 'reserve');
  const colliding = await writeSuite(join(directory, 'colliding.json'), 'independent', 'confirm', { briefing: 'Exemplo sintético reserve: situação 0.' });
  const independent = await writeSuite(join(directory, 'independent.json'), 'independent', 'confirm');
  const { submissions, fetchApi } = scenario();
  const options = { key: fakeKey, root, candidateSha256, render: false, fetchApi };

  const first = await runLiveCarousel({ ...options, cycle: 4, sealedSuite: holdout, caseIndex: 1 });
  assert.equal(first.state, 'planned');
  assert.equal(first.caseId, 'reserve-1');
  assert.equal(first.receipt.split, 'holdout');
  assert.equal(first.receipt.suiteSha256, holdout.sha256);
  assert.equal(first.receipt.candidateSha256, candidateSha256);
  const [submitted] = submissions;
  assert.match(submitted.agent.instructions, /exatamente dez strings diferentes/);
  assert.doesNotMatch(submitted.agent.instructions, /"coverOptions":\[\]/);
  assert.match(submitted.agent.instructions, /hierarchy.*split_horizontal/);
  const { coverLab } = JSON.parse(await readFile(first.planPath, 'utf8'));
  assert.equal(coverLab.options.length, 10);
  assert.equal(coverLab.ranking.order[0], 1);
  assert.deepEqual(JSON.parse(submitted.input), {
    mode: 'editorial_art', briefing: 'Exemplo sintético reserve: situação 1.', facts: [{ id: 'f1', text: 'Fato hipotético 1.' }],
  });
  assert.equal((await runLiveCarousel({ ...options, cycle: 4, sealedSuite: holdout, caseIndex: 1 })).reused, true);
  await assert.rejects(runLiveCarousel({ ...options, cycle: 4, sealedSuite: holdout, artBatch: { maxImages: 4 } }), /orçamento raster mudou/);
  const changed = await writeSuite(join(directory, 'other-holdout.json'), 'holdout', 'other');
  await assert.rejects(runLiveCarousel({ ...options, cycle: 4, sealedSuite: changed }), /partição congelada/);
  await assert.rejects(runLiveCarousel({ ...options, cycle: 4, sealedSuite: independent }), /controlOnly:true/);
  await assert.rejects(runLiveCarousel({ ...options, cycle: 5, sealedSuite: colliding }), /partições seladas compartilham/);
  assert.equal(submissions.length, 1);

  const control = await runLiveCarousel({ ...options, cycle: 4, sealedSuite: independent, controlOnly: true });
  const confirmation = await runLiveCarousel({ ...options, cycle: 5, sealedSuite: independent });
  assert.equal(control.state, 'planned');
  assert.equal(control.receipt.controlOnly, true);
  assert.equal(confirmation.state, 'planned');
  assert.equal(confirmation.receipt.controlOnly, false);
  assert.equal(control.receipt.suiteSha256, confirmation.receipt.suiteSha256);
  assert.equal(submissions.length, 3);
  const stored = JSON.parse(await readFile(first.receiptPath, 'utf8'));
  assert.equal(stored.planner.usage.total_tokens, 30);
});


test('Lab C4/C5 bloqueia a falha de primeira passagem e mantém suas opções verificáveis', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-cover-lab-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const changes = [
    ['ausente', () => ({}), 'COVER_LAB_OPTIONS', null],
    ['excedente', cover => ({ ...cover, coverOptions: [...cover.coverOptions, 'Mais uma'] }), 'COVER_LAB_OPTIONS', 11],
    ['duplicado', cover => ({ ...cover, coverOptions: ['ÚM exemplo — verificável!', ...cover.coverOptions.slice(0, 9)] }), 'COVER_LAB_DUPLICATE', 10],
    ['incompleto', cover => ({ ...cover, coverRanking: { ...cover.coverRanking, order: cover.coverRanking.order.slice(0, 9) } }), 'COVER_LAB_RANKING', 10],
    ['seleção divergente', cover => ({ ...cover, coverRanking: { ...cover.coverRanking, order: [2, 1, ...cover.coverRanking.order.slice(2)] } }), 'COVER_LAB_SELECTION', 10],
    ['rank de opção fora do orçamento', cover => ({
      ...cover, coverOptions: [...cover.coverOptions.slice(0, 9), 'Um dois três quatro cinco seis sete oito nove dez onze doze'],
    }), 'COVER_LAB_RANKING', 10],
  ];
  for (const [index, [name, change, violation, optionCount]] of changes.entries()) {
    await t.test(name, async () => {
      const { fetchApi, submissions } = scenario(change);
      const result = await runLiveCarousel({ key: fakeKey, root: join(directory, String(index)), cycle: 5, render: false, fetchApi });
      assert.equal(submissions.length, 1);
      assert.equal(result.state, 'blocked_plan');
      const manifest = JSON.parse(await readFile(join(result.caseDirectory, 'qa-manifest.json'), 'utf8'));
      const snapshot = manifest.first_pass;
      assert.deepEqual(manifest.final, snapshot);
      assert.equal(manifest.repair_count, 0);
      assert.ok(snapshot.planFailures.includes(violation));
      assert.deepEqual(snapshot.artifacts.map(item => item.file), ['first-pass/plan.json', 'first-pass/cover-lab.json']);
      const plan = await readFile(join(result.caseDirectory, 'first-pass/plan.json'));
      assert.equal(sha256(plan), snapshot.inputSha256);
      assert.equal(JSON.parse(plan).coverLab.options?.length ?? null, optionCount);
      const labFile = await readFile(join(result.caseDirectory, 'first-pass/cover-lab.json'));
      assert.equal(sha256(labFile), snapshot.artifacts[1].sha256);
      assert.equal(JSON.parse(labFile).status, 'fail');
    });
  }
});

test('marca uma promessa numérica sem fonte no manifesto antes de solicitar a capa', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'compor-grounding-block-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { submissions, fetchApi } = scenario(cover => ({
    ...cover, coverArtBrief: 'Capa que ilustra o cenário sem texto.',
    deck: { mode: 'editorial_art', slides: [
      { id: 'um', layout: 'typo_breather', headline: 'Ganhe 47% mais', alt: 'Abertura.' },
      { id: 'dois', layout: 'svg_diagram', headline: 'Uma revisão ajuda a ler', diagram: 'flow', alt: 'Diagrama.' },
      { id: 'tres', layout: 'cta_closing', headline: 'Salve para revisar', alt: 'Fechamento.' },
    ] },
  }));
  const result = await runLiveCarousel({ key: fakeKey, root: directory, cycle: 1, caseIndex: 1, render: false, fetchApi });
  assert.equal(result.state, 'blocked_plan');
  assert.equal(result.receipt.image, null);
  assert.equal(submissions.length, 1);
  const manifest = JSON.parse(await readFile(join(result.caseDirectory, 'qa-manifest.json')));
  assert.deepEqual(manifest.first_pass.planFailures, ['UNBOUND_RESULT']);
  assert.equal(manifest.first_pass.artifacts[0].file, 'first-pass/plan.json');
});
