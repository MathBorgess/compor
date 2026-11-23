import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { calibrationFile, measureJudgeCalibration, readJudgeCalibration } from './calibration.mjs';
import { evaluate } from './evaluate.mjs';
import { readCaseEvidence } from './evidence.mjs';
import { judgeBriefing, judgeDeckHash, judgeModel, judgeRubricSha256 } from './judge-evidence.mjs';
import { judgeWeights, readDocument, sha256 } from './protocol.mjs';

const dimensions = Object.keys(judgeWeights);
const evidence = 'Simulação offline para testar a validação.';
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const run = promisify(execFile);
const defect = { slide: 2, dimension: 'reentry', evidence };

async function jsonFile(root, name, object) {
  const bytes = JSON.stringify(object);
  await writeFile(join(root, name), bytes);
  return sha256(bytes);
}

function sideLabel(deckSha256, criticalDefects = []) {
  const scores = Object.fromEntries(dimensions.map(dimension => [dimension,
    criticalDefects.some(item => item.dimension === dimension) ? 2 : 4,
  ]));
  return { deckSha256, captionSha256: sha256(''), criticalDefects, scores };
}

function judgeSide({ criticalDefects, scores }) {
  return {
    defects: criticalDefects.map(item => ({ ...item, critical: true })),
    scores: Object.fromEntries(dimensions.map(key => [key, { value: scores[key], evidence }])),
  };
}

async function writePair(root, stem, label, adjust = () => {}) {
  const input = {
    baselineHash: label.baseline.deckSha256, candidateHash: label.candidate.deckSha256,
    baselineCaptionSha256: label.baseline.captionSha256, candidateCaptionSha256: label.candidate.captionSha256,
    briefingSha256: sha256(judgeBriefing(label)),
  };
  const identity = { model: judgeModel, rubricSha256: judgeRubricSha256, input };
  const [forward, reverse] = await Promise.all(['ab', 'ba'].map(async order => {
    const first = order === 'ab' ? 'baseline' : 'candidate';
    const second = order === 'ab' ? 'candidate' : 'baseline';
    const output = { A: judgeSide(label[first]), B: judgeSide(label[second]), reason: evidence,
      winner: label.winner === 'tie' ? 'tie' : label.winner === first ? 'A' : 'B' };
    adjust(output, order);
    const receipt = {
      ...identity, order, state: 'completed', httpStatus: 200,
      sessionId: 'sess_' + stem + '-' + order, turnId: 'turn_' + stem + '-' + order, output,
    };
    const receiptSha256 = await jsonFile(root, stem + '-' + order + '.receipt.json', receipt);
    const choice = output.winner === 'A' ? first : output.winner === 'B' ? second : output.winner;
    return { state: 'completed', receiptSha256, output, choice };
  }));
  const file = stem + '.pair.json';
  const digest = await jsonFile(root, file, { version: 1, ...identity, forward, reverse, results: [forward.choice, reverse.choice] });
  return { file, sha256: digest };
}

async function tempDirectory(t) {
  const root = await mkdtemp(join(tmpdir(), 'compor-judge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t, adjust = () => {}) {
  const root = await tempDirectory(t);
  const cases = Array.from({ length: 6 }, (_, index) => ({
    id: 'calibration-fixture-' + index, briefing: 'Briefing de teste ' + index, facts: [], reason: evidence,
    winner: index < 2 ? 'candidate' : 'tie',
    baseline: sideLabel(sha256('baseline ' + index), index < 2 ? [defect] : []),
    candidate: sideLabel(sha256('candidate ' + index)),
  }));
  const truthSha256 = await jsonFile(root, 'reference-labels.json', {
    version: 1, split: 'judge-calibration', reference: { kind: 'independent_rubric', reviewerId: 'fixture-test', source: evidence }, cases,
  });
  const items = await Promise.all(cases.map(async (label, index) => ({
    id: label.id,
    pairs: await Promise.all([0, 1].map(repetition => writePair(root, 'sample-' + index + '-' + repetition, label,
      (output, order) => adjust(output, { order, index, repetition })))),
  })));
  await jsonFile(root, 'observations.json', { version: 1, truthSha256, cases: items });
  return { root, truthSha256, cases, items };
}

test('calibrate recalcula duas repetições e exige que evaluate confira os insumos congelados', async t => {
  const { root, truthSha256 } = await fixture(t);
  const { stdout } = await run(process.execPath, [cli, 'calibrate', '--bundle', root, '--truth-sha256', truthSha256]);
  assert.equal(JSON.parse(stdout).status, 'pass');
  const { value, digest } = await readDocument(join(root, calibrationFile));
  const calibration = await readJudgeCalibration(root, digest);
  assert.equal(calibration.report.metrics.agreementCases, 6);
  assert.deepEqual(calibration.report.metrics.dimensions.reentry, { sigma: 0, mae: 0 });
  assert.equal(calibration.report.cases.flatMap(item => item.judgments.flatMap(pair => pair.receipts)).length, 24);
  const changed = await jsonFile(root, calibrationFile, { ...value, status: 'fail' });
  await assert.rejects(readJudgeCalibration(root, digest), /SHA-256 do relatório/);
  await assert.rejects(readJudgeCalibration(root, changed), /diverge dos rótulos/);
});

test('uma nota instável e um defeito crítico perdido falham apesar da preferência correta', async t => {
  const { root, truthSha256 } = await fixture(t, (output, { index, repetition }) => {
    if (index !== 0 || repetition !== 1) return;
    output.A.scores.cover.value = 0;
    output.B.scores.cover.value = 0;
    output.A.defects = [];
    output.B.defects = [];
  });
  const report = await measureJudgeCalibration(root, truthSha256);
  assert.equal(report.status, 'fail');
  assert.equal(report.metrics.referenceAgreement, 1);
  assert.equal(report.metrics.missedCritical, 2);
  assert.ok(report.metrics.dimensions.cover.sigma >= report.targets.sigmaBelow);
});

test('calibração rejeita rótulos trocados, sessões reaproveitadas e recibos adulterados', async t => {
  const { root, truthSha256, items } = await fixture(t);
  await assert.rejects(measureJudgeCalibration(root, sha256('outros rótulos')), /rótulos de referência diverge/);
  const [original, second] = items[0].pairs;
  items[0].pairs = [original, original];
  await jsonFile(root, 'observations.json', { version: 1, truthSha256, cases: items });
  await assert.rejects(measureJudgeCalibration(root, truthSha256), /turno do juiz foi reutilizado/);
  items[0].pairs = [original, second];
  await jsonFile(root, 'observations.json', { version: 1, truthSha256, cases: items });
  const receipt = await readDocument(join(root, 'sample-0-0-ab.receipt.json'));
  await jsonFile(root, 'sample-0-0-ab.receipt.json', { ...receipt.value, sessionId: 'sess_changed' });
  await assert.rejects(measureJudgeCalibration(root, truthSha256), /Recibo incompleto ou desvinculado/);
});

async function renderedFixture(root, testCase, salt) {
  const directory = join(root, testCase.id);
  await mkdir(directory, { recursive: true });
  const files = ['slide-01.jpg', 'slide-02.jpg', 'art-sheet.jpg', 'contact-sheet.png', 'cover-grid.png'];
  const artifacts = await Promise.all(files.map(async file => {
    const bytes = salt + file;
    await writeFile(join(directory, file), bytes);
    return { file, sha256: sha256(bytes) };
  }));
  const deckSha256 = judgeDeckHash(artifacts.slice(0, 2).map(item => item.sha256));
  const snapshot = { outcome: 'delivered', artifacts };
  const manifest = { version: 1, caseId: testCase.id, mode: testCase.mode, repair_count: 0, repairs: [], first_pass: snapshot, final: snapshot };
  const manifestSha256 = await jsonFile(directory, 'qa-manifest.json', manifest);
  return { directory, deckSha256, manifestSha256, manifest };
}

test('C4 exige avaliação rastreável e recusa coorte sobreposta mesmo para um relatório aprovado', async t => {
  const { root, truthSha256, cases } = await fixture(t);
  const report = await measureJudgeCalibration(root, truthSha256);
  const judgeCalibration = { directory: root, sha256: await jsonFile(root, calibrationFile, report) };
  const subject = { id: 'case-alpha', briefing: 'Outro briefing.', facts: [], split: 'dev', mode: 'editorial_art', expected: 'deliver_deck' };
  const evaluateSubject = options => evaluate({ cycle: 4, tests: [subject], evidenceRoot: root, references: new Map(), ...options });
  const unavailable = await evaluateSubject({});
  assert.equal(unavailable.checks.find(check => check.name === 'calibracao_do_juiz').status, 'unavailable');
  const current = await evaluateSubject({ judgeCalibration });
  assert.equal(current.checks.find(check => check.name === 'calibracao_do_juiz').status, 'pass');
  assert.equal(current.checks.find(check => check.name === 'notas_do_juiz_verificadas').status, 'unavailable');
  assert.equal(current.status, 'insufficient_or_failed');
  await assert.rejects(evaluateSubject({ judgeCalibration, cohorts: [subject, { id: 'outro-holdout', briefing: cases[0].briefing + '!' }] }),
    /calibração reutiliza/);

  const candidate = await renderedFixture(root, subject, 'candidate');
  const pair = await writePair(candidate.directory, 'review', { ...subject, winner: 'candidate',
    baseline: sideLabel(sha256('other baseline')), candidate: sideLabel(candidate.deckSha256),
  });
  const assessment = judgeEvidence => ({ version: 1, manifestSha256: candidate.manifestSha256, final: { judgeEvidence } });
  await jsonFile(candidate.directory, 'qa-assessments.json', assessment({ ...pair, side: 'candidate' }));
  const verified = await evaluateSubject({ judgeCalibration });
  assert.equal(verified.cases[0].final.sVlm, 80);
  assert.equal(verified.checks.find(check => check.name === 'notas_do_juiz_verificadas').status, 'pass');
  await jsonFile(candidate.directory, 'qa-assessments.json', assessment({ ...pair, side: 'baseline' }));
  await assert.rejects(readCaseEvidence(candidate.directory, subject), /outro conjunto de lâminas/);
});

async function sealFixture(root, output, testCase, { cycle, suiteSha256, candidateSha256, controlOnly }) {
  const execution = { caseId: testCase.id, caseSha256: sha256(JSON.stringify(testCase)), split: testCase.split,
    cycle, suiteSha256, candidateSha256, controlOnly };
  await jsonFile(root, testCase.id + '.live-receipt.json', { ...execution, state: 'delivered',
    planner: { state: 'completed', sessionId: 'sess_canary', turnId: 'turn_canary', promptSha256: sha256('prompt') } });
  return jsonFile(output.directory, 'qa-manifest.json', { ...output.manifest, execution });
}

test('C5 só usa o voto calibrado que corresponde às lâminas do controle selado e da candidata', async t => {
  const { root, truthSha256 } = await fixture(t);
  const report = await measureJudgeCalibration(root, truthSha256);
  const judgeCalibration = { directory: root, sha256: await jsonFile(root, calibrationFile, report) };
  const testCase = { id: 'independent-fixture', briefing: 'Outro briefing para a comparação.', facts: [],
    split: 'independent', mode: 'editorial_art', expected: 'deliver_deck' };
  const suiteSha256 = sha256('suite fixture');
  const suiteDigests = { independent: suiteSha256 };
  const controlRoot = join(root, 'control');
  const control = await renderedFixture(controlRoot, testCase, 'control');
  const oldRevision = sha256('c4');
  const controlManifestSha256 = await sealFixture(controlRoot, control, testCase, {
    cycle: 4, candidateSha256: oldRevision, suiteSha256, controlOnly: true,
  });
  const baselineReport = await evaluate({ cycle: 4, tests: [testCase], evidenceRoot: controlRoot, references: new Map(),
    candidateSha256: oldRevision, suiteDigests, controlOnly: true });
  assert.equal(baselineReport.cases[0].execution.status, 'pass');
  const candidateRoot = join(root, 'candidate');
  const candidate = await renderedFixture(candidateRoot, testCase, 'candidate');
  const candidateSha256 = sha256('c5');
  const candidateManifestSha256 = await sealFixture(candidateRoot, candidate, testCase, {
    cycle: 5, candidateSha256, suiteSha256, controlOnly: false,
  });
  const label = { ...testCase, winner: 'candidate', baseline: sideLabel(control.deckSha256), candidate: sideLabel(candidate.deckSha256) };
  const correct = await writePair(candidate.directory, 'correct', label);
  const wrong = await writePair(candidate.directory, 'wrong', { ...label, baseline: sideLabel(sha256('another deck')) });
  const assess = async (judgeEvidence, candidateFirst = 'first') => jsonFile(candidate.directory, 'qa-assessments.json', {
    version: 1, manifestSha256: candidateManifestSha256, pairwise: [
      { againstCycle: 4, candidateFirst, controlFirst: 'second', controlManifestSha256, evaluator: judgeModel, evidence, judgeEvidence },
    ],
  });
  const evaluateCandidate = () => evaluate({ cycle: 5, tests: [testCase], evidenceRoot: candidateRoot,
    references: new Map([[4, baselineReport]]), candidateSha256, suiteDigests, controlOnly: false, judgeCalibration });
  await assess(wrong);
  assert.equal((await evaluateCandidate()).comparisons[0].rate, null);
  await assess(correct);
  assert.equal((await evaluateCandidate()).comparisons[0].rate, 1);
  await assess(correct, 'second');
  await assert.rejects(evaluateCandidate(), /votos anotados divergem/);
});
