import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readCaseEvidence, summarizeSnapshot } from './evidence.mjs';
import { evaluate } from './evaluate.mjs';
import { writePlanArtifacts } from './render-evidence.mjs';
import { collectionWeights, judgeWeights, readSuite, requiredChecks, sha256 } from './protocol.mjs';

const evidence = 'Observação sintética do teste.';
const dev = new URL('./dev-cases.json', import.meta.url);
const checked = keys => Object.fromEntries(keys.map(key => [key, { status: 'pass', evidence }]));
const scored = (keys, score) => Object.fromEntries(keys.map(key => [key, { score, evidence, evaluator: 'mock' }]));

async function tempDirectory(t) {
  const root = await mkdtemp(join(tmpdir(), 'compor-carousel-eval-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function example(t, options = {}) {
  const root = await tempDirectory(t);
  const directory = join(root, 'case-alpha');
  const firstDir = join(directory, 'first-pass');
  await mkdir(firstDir, { recursive: true });
  const files = ['slide-01.jpg', 'slide-02.jpg', 'contact-sheet.png', 'cover-grid.png', 'art-sheet.jpg'];
  const artifacts = [];
  for (const filename of files) {
    const bytes = Buffer.from(filename);
    const file = `first-pass/${filename}`;
    await writeFile(join(directory, file), bytes);
    artifacts.push({ file, sha256: sha256(bytes) });
  }
  const snapshot = {
    outcome: 'delivered',
    artifacts,
    checks: checked(Object.values(requiredChecks).flat()),
    collectionScores: scored(Object.keys(collectionWeights), 90),
    judgeScores: scored(Object.keys(judgeWeights), 4),
    migMean: 0.85,
    ddr: 0.76,
  };
  const manifest = {
    version: 1, caseId: 'case-alpha', mode: 'editorial_art',
    first_pass: snapshot, final: structuredClone(snapshot), repair_count: 0, repairs: [],
    ...options,
  };
  const testCase = {
    id: manifest.caseId, mode: manifest.mode, split: 'dev',
    expected: 'deliver_deck', briefing: 'Briefing sintético.', facts: [], strata: ['canario'],
  };
  const writeManifest = () => writeFile(join(directory, 'qa-manifest.json'), JSON.stringify(manifest));
  await writeManifest();
  return { root, directory, testCase, manifest, writeManifest };
}

test('a suíte pública contém dez casos, formatos diferentes e recusas esperadas', async () => {
  const fixture = await readSuite(dev, 'dev');
  assert.equal(fixture.cases.length, 10);
  assert.equal(fixture.cases.filter(item => item.expected === 'reject_claim').length, 2);
  assert.equal(new Set(fixture.cases.map(item => item.mode)).size, 2);
  assert.ok(fixture.cases.find(item => item.id === 'dev-brief-longo').briefing.split(/\s+/).length > 800);
});

test('suítes privadas têm seis casos e só abrem com o SHA-256 congelado', async t => {
  const root = await tempDirectory(t);
  const fixture = await readSuite(dev, 'dev');
  const source = JSON.stringify({ version: 1, split: 'holdout', cases: fixture.cases.slice(0, 6) });
  const path = join(root, 'holdout.json');
  await writeFile(path, source);
  await assert.rejects(readSuite(path, 'holdout', 'a'.repeat(64)), /SHA-256/);
  assert.equal((await readSuite(path, 'holdout', sha256(source))).cases.length, 6);
  await assert.rejects(readSuite(path, 'independent', sha256(source)), /independent/);
});

test('relatório vazio registra cobertura zero e não converte ausência em reprovação', async t => {
  const evidenceRoot = await tempDirectory(t);
  const { cases, digest } = await readSuite(dev, 'dev');
  const result = await evaluate({ cycle: 1, tests: cases, evidenceRoot, references: new Map(), suiteDigests: { dev: digest } });
  assert.equal(result.status, 'insufficient_or_failed');
  assert.equal(result.coverage.failed, 0);
  assert.equal(result.coverage.unavailable, 10);
  assert.equal(result.coverage.withManifest, 0);
  assert.equal(result.scores.cqs.value, null);
  assert.equal(result.firstPassYield.physical.unavailable, 8);
  assert.equal(result.checks.find(check => check.name === 'fpy_fisico').status, 'unavailable');
});

test('CQS não compensa veto factual e a primeira passagem permanece após reparo', async t => {
  const { root, directory, testCase, manifest, writeManifest } = await example(t);
  manifest.first_pass.checks.FACT_GROUNDING = { status: 'fail', evidence };
  manifest.repair_count = 1;
  manifest.repairs = [{ stage: 'plan', reason: 'Removeu a afirmação sem lastro.' }];
  await writeManifest();
  const result = await evaluate({ cycle: 2, tests: [testCase], evidenceRoot: root, references: new Map() });
  assert.equal(result.cases[0].first.cqs, 88);
  assert.deepEqual(result.cases[0].first.hardFails, ['FACT_GROUNDING']);
  assert.equal(result.cases[0].verdict, 'pass');
  assert.equal(result.firstPassYield.editorial.passed, 0);
  assert.equal(result.firstPassYield.editorial.failed, 1);
  assert.equal(result.repair_count, 1);

  manifest.final.checks.FACT_GROUNDING = { status: 'fail', evidence };
  await writeManifest();
  assert.equal((await evaluate({ cycle: 2, tests: [testCase], evidenceRoot: root, references: new Map() })).cases[0].verdict, 'fail');

  await writeFile(join(directory, 'first-pass', 'slide-01.jpg'), 'alterado');
  await assert.rejects(readCaseEvidence(directory, testCase), /SHA-256 divergente/);
});

test('ausência de juiz retém CQS e defeito crítico limita a dimensão', () => {
  const checks = checked(Object.values(requiredChecks).flat());
  const collectionScores = scored(Object.keys(collectionWeights), 95);
  assert.equal(summarizeSnapshot({ outcome: 'delivered', checks, collectionScores }).cqs, null);
  const judgeScores = scored(Object.keys(judgeWeights), 5);
  judgeScores.artMessage.critical = true;
  assert.throws(() => summarizeSnapshot({ outcome: 'delivered', checks, collectionScores, judgeScores }), /limita a nota/);
});

test('recusa factual comprovada cumpre o caso e fica fora do denominador de render', async t => {
  const { root, testCase, manifest, writeManifest } = await example(t);
  testCase.expected = 'reject_claim';
  manifest.first_pass = manifest.final = { outcome: 'rejected_claim', checks: checked(['FACT_GROUNDING']) };
  await writeManifest();
  const result = await evaluate({ cycle: 2, tests: [testCase], evidenceRoot: root, references: new Map() });
  assert.equal(result.coverage.rejectedAsExpected, 1);
  assert.equal(result.firstPassYield.physical.eligible, 0);
  assert.equal(result.scores.cqs.observed, 0);
});

test('julgamento pareado usa uma unidade por briefing, vínculo a controle e duas ordens concordantes', async t => {
  const control = await example(t);
  const candidate = await example(t);
  const baseline = await evaluate({ cycle: 0, tests: [control.testCase], evidenceRoot: control.root, references: new Map() });
  const references = new Map([[0, baseline]]);
  const paired = {
    againstCycle: 0, candidateFirst: 'first', controlFirst: 'first', evaluator: 'mock',
    controlManifestSha256: baseline.cases[0].manifestSha256, evidence,
  };
  candidate.manifest.pairwise = [paired];
  await candidate.writeManifest();
  const run = () => evaluate({ cycle: 1, tests: [candidate.testCase], evidenceRoot: candidate.root, references });
  const disagreement = (await run()).comparisons[0];
  assert.deepEqual([disagreement.eligible, disagreement.inconclusive, disagreement.win], [1, 1, 0]);
  paired.controlFirst = 'second';
  await candidate.writeManifest();
  assert.equal((await run()).status, 'eligible_for_review');
  paired.controlManifestSha256 = 'a'.repeat(64);
  await candidate.writeManifest();
  assert.equal((await run()).comparisons[0].unavailable, 1);
});

test('avaliação posterior é vinculada ao manifesto e preserva os checks físicos', async t => {
  const { directory, testCase, manifest, writeManifest } = await example(t);
  delete manifest.first_pass.judgeScores;
  delete manifest.final.judgeScores;
  await writeManifest();
  const raw = await readCaseEvidence(directory, testCase);
  const assessments = {
    version: 1, manifestSha256: raw.digest,
    final: { judgeScores: scored(Object.keys(judgeWeights), 4) },
  };
  const target = join(directory, 'qa-assessments.json');
  const writeAssessments = () => writeFile(target, JSON.stringify(assessments));
  await writeAssessments();
  const scoredEvidence = await readCaseEvidence(directory, testCase);
  assert.equal(scoredEvidence.first.cqs, 88);
  assert.equal(scoredEvidence.final.cqs, 88);

  assessments.final.checks = checked(['TEXT_CONTRAST']);
  await writeAssessments();
  await assert.rejects(readCaseEvidence(directory, testCase), /não pode alterar TEXT_CONTRAST/);

  assessments.manifestSha256 = 'a'.repeat(64);
  await writeAssessments();
  await assert.rejects(readCaseEvidence(directory, testCase), /desvinculada do SHA-256/);
});

test('C5 requer coorte privada inédita e relata a cobertura efetiva', async t => {
  const root = await tempDirectory(t);
  const { cases } = await readSuite(dev, 'dev');
  const fixtures = {};
  for (const split of ['holdout', 'independent']) {
    const path = join(root, split + '.json');
    const bytes = JSON.stringify({
      version: 1, split,
      cases: cases.slice(0, 6).map((item, i) => ({ ...item, id: `${split}-${i}` })),
    });
    await writeFile(path, bytes);
    fixtures[split] = { path, sha: sha256(bytes) };
  }
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const run = args => promisify(execFile)(process.execPath, [cli, 'evaluate', ...args]);
  const args = ['--cycle', '5', '--evidence', root, '--output', join(root, 'result.json'),
    '--holdout', fixtures.holdout.path, '--holdout-sha256', fixtures.holdout.sha];
  await assert.rejects(run(args), error => error.code === 1 && /suíte privada independent/.test(error.stderr));
  const { stdout } = await run([...args, '--independent', fixtures.independent.path, '--independent-sha256', fixtures.independent.sha]);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'insufficient_or_failed');
  assert.equal(result.coverage.total, 6);
  assert.equal(result.coverage.withManifest, 0);
});

test('CQS exige conjunto visual completo, com exceção explícita para a folha de arte', async t => {
  const { directory, testCase, manifest, writeManifest } = await example(t);
  const snapshot = manifest.first_pass;
  snapshot.slideCount = 2;
  snapshot.artifacts = snapshot.artifacts.filter(artifact => !artifact.file.endsWith('art-sheet.jpg'));
  const readUpdated = async () => {
    manifest.final = structuredClone(snapshot);
    await writeManifest();
    return (await readCaseEvidence(directory, testCase)).final;
  };
  assert.equal((await readUpdated()).cqs, null);

  snapshot.artSheetApplicable = false;
  snapshot.checks.ART_PURITY = { status: 'not_applicable', evidence: 'Coleção sem arte raster.' };
  assert.equal((await readUpdated()).cqs, 88);

  snapshot.slideCount = 3;
  assert.equal((await readUpdated()).sVlm, null);
  assert.equal((await readUpdated()).cqs, null);
});

test('replay com recusa de plano retém primeira passagem sem pontuação visual', async t => {
  const { root, testCase, manifest, writeManifest } = await example(t);
  manifest.first_pass = {
    outcome: 'blocked_plan', planFailures: ['S2_DEPENDENT_OPEN'], artifacts: [],
    checks: { S2_STANDALONE: { status: 'fail', evidence } },
    judgeScores: scored(Object.keys(judgeWeights), 4),
  };
  manifest.repair_count = 1;
  manifest.repairs = [{ stage: 'plan', reason: 'Reescreveu a segunda manchete.' }];
  await writeManifest();
  const result = await evaluate({ cycle: 2, tests: [testCase], evidenceRoot: root, references: new Map() });
  assert.equal(result.cases[0].first.outcome, 'blocked_plan');
  assert.equal(result.cases[0].first.sVlm, null);
  assert.equal(result.cases[0].first.cqs, null);
  assert.equal(result.cases[0].final.cqs, 88);
  assert.equal(result.firstPassYield.editorial.failed, 1);
  assert.equal(result.repair_count, 1);
});


test('C4/C5 exigem shortlist verificada e vinculada ao título renderizado', async t => {
  const { root, directory, testCase, manifest, writeManifest } = await example(t);
  const snapshot = manifest.first_pass;
  const run = cycle => evaluate({ cycle, tests: [{ ...testCase, split: cycle === 4 ? 'holdout' : 'independent' }], evidenceRoot: root, references: new Map() });
  const findCover = result => result.checks.find(check => check.name === 'lab_dez_capas');
  snapshot.coverLab = { status: 'pass', violations: [] };
  manifest.final = structuredClone(snapshot);
  await writeManifest();
  assert.equal(findCover(await run(4)).status, 'unavailable');
  assert.equal(findCover(await run(5)).status, 'unavailable');

  const headline = 'Como comparar uma escolha';
  const options = [headline, ...Array.from({ length: 8 }, (_, index) => `Outra abertura ${index + 1}`),
    'Uma manchete que consome muito espaço e passa do limite que cabe na tela'];
  const coverLab = { options, ranking: { order: [1, 2, 3, 4, 5, 6, 7, 8, 9], rationale: 'O título nomeia o que a lâmina explica.' } };
  const value = { mode: testCase.mode, slides: [{ headline }], coverLab };
  const bytes = Buffer.from(JSON.stringify(value));
  const digest = sha256(bytes);
  snapshot.inputSha256 = digest;
  const proof = await writePlanArtifacts(directory, 'first-pass', { value, bytes, digest });
  snapshot.artifacts.push(...proof);
  manifest.final = structuredClone(snapshot);
  await writeManifest();
  for (const cycle of [4, 5]) {
    const report = await run(cycle);
    assert.equal(findCover(report).status, 'pass');
    assert.equal(report.cases[0].final.coverLab.selected, 1);
    const overBudget = report.cases[0].final.coverLab.candidates[9];
    assert.equal(overBudget.eligible, false);
  }

  snapshot.inputSha256 = 'a'.repeat(64);
  manifest.final = structuredClone(snapshot);
  await writeManifest();
  await assert.rejects(run(4), /desvinculad[ao] do plano renderizado/);
  snapshot.inputSha256 = digest;
  manifest.final = structuredClone(snapshot);
  await writeManifest();
  await writeFile(join(directory, proof[1].file), '{}');
  await assert.rejects(run(4), /SHA-256 divergente/);
});

test('a confirmação selada requer recibo do briefing, partição e revisão executados', async t => {
  const { root, directory, testCase, manifest, writeManifest } = await example(t);
  const sealed = { ...testCase, split: 'independent' };
  const expectation = { cycle: 5, suiteSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), controlOnly: false };
  const run = item => readCaseEvidence(directory, item, expectation);
  assert.equal((await run(sealed)).execution.status, 'unavailable');
  const execution = { ...expectation, caseId: sealed.id, caseSha256: sha256(JSON.stringify(sealed)), split: sealed.split };
  manifest.execution = execution;
  await writeManifest();
  assert.equal((await run(sealed)).execution.status, 'unavailable');
  const receiptPath = join(root, sealed.id + '.live-receipt.json');
  await writeFile(receiptPath, JSON.stringify({ ...execution, state: 'delivered', planner: {
    state: 'completed', sessionId: 'sess_canary', turnId: 'turn_canary', promptSha256: 'c'.repeat(64),
  } }));
  assert.equal((await run(sealed)).execution.status, 'pass');
  assert.equal((await run({ ...sealed, briefing: 'Outro briefing com o mesmo ID.' })).execution.status, 'fail');
  const report = await evaluate({
    cycle: 5, tests: [sealed], evidenceRoot: root, references: new Map(), suiteDigests: { independent: expectation.suiteSha256 },
    candidateSha256: expectation.candidateSha256, controlOnly: false,
  });
  assert.equal(report.checks.find(check => check.name === 'execucao_selada').status, 'pass');
  assert.equal(report.status, 'insufficient_or_failed');
});
