import { reviewNovelty } from './novelty.mjs';
import { inspectClaimLedger } from './grounding.mjs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { coverLabArtifact } from './cover-lab.mjs';
import { verifyArtPurity } from './art-purity.mjs';
import { judgeBriefing, judgeDeckHash, judgeSideScores, readBlindJudgePair } from './judge-evidence.mjs';
import {
  bounded, collectionWeights, formatVersion, isDigest, judgeWeights,
  readDocument, requireCondition, requiredChecks, sha256,
} from './protocol.mjs';

const outcomes = ['delivered', 'rejected_claim', 'blocked_plan', 'failed_execution', 'unknown'];
const checkStatuses = ['pass', 'fail', 'not_run', 'unknown', 'not_applicable'];
const requiredVisualArtifacts = ['contact-sheet.png', 'cover-grid.png'];

function textEvidence(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCheck(check) {
  requireCondition(check && checkStatuses.includes(check.status), 'Verificação sem estado reconhecido.');
  requireCondition(!['pass', 'fail', 'not_applicable'].includes(check.status) || textEvidence(check.evidence),
    'Verificação conclusiva sem evidência.');
}

function weightedScore(values, weights, scale, requireReference) {
  if (!values) return null;
  for (const key of Object.keys(weights)) {
    const item = values[key];
    if (item === undefined) continue;
    requireCondition(bounded(item.score, scale) && textEvidence(item.evidence),
      `Pontuação inválida ou sem evidência em ${key}.`);
    if (requireReference && item.critical === true) {
      requireCondition(item.score <= 2, `Um defeito crítico limita a nota de ${key} a dois.`);
    }
    if (requireReference) {
      requireCondition(typeof item.evaluator === 'string' && textEvidence(item.evaluator),
        `Avaliação sem identificação do avaliador em ${key}.`);
    }
  }
  if (!Object.keys(weights).every(key => values[key])) return null;
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key].score / scale * weight, 0);
}

export function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  requireCondition(outcomes.includes(snapshot.outcome), 'Desfecho de avaliação inválido.');
  const checks = { ...(snapshot.checks ?? {}) };
  const artPurity = snapshot.artPurity;
  if (artPurity?.sha256) {
    checks.ART_PURITY = artPurity.status === 'unavailable'
      ? { status: 'unknown' }
      : { status: artPurity.status, evidence: 'Parecer da folha de arte vinculado ao recibo do renderer.' };
  }
  if (snapshot.factualTrace?.status === 'fail') {
    checks.FACT_GROUNDING = { status: 'fail', evidence: 'O plano tem citações inexistentes ou resultados sem fonte verificável no briefing.' };
  }
  const planFailures = snapshot.planFailures ?? [];
  requireCondition(Array.isArray(planFailures) && planFailures.every(textEvidence), 'Falha de plano sem identificação.');
  const staged = Object.fromEntries(Object.entries(requiredChecks).map(([stage, keys]) => {
    const found = keys.map(key => checks[key] ?? { status: 'not_run' });
    found.forEach(validateCheck);
    const failures = keys.filter((_, index) => found[index].status === 'fail');
    const passed = keys.filter((key, index) => found[index].status === 'pass'
      || (key === 'ART_PURITY' && found[index].status === 'not_applicable'));
    return [stage, { failures, passed, complete: failures.length + passed.length === keys.length }];
  }));
  const sDet = staged.physical.complete
    ? 100 * staged.physical.passed.length / requiredChecks.physical.length
    : null;
  const sCol = weightedScore(snapshot.collectionScores, collectionWeights, 100, false);
  const judgeScore = weightedScore(snapshot.judgeScores, judgeWeights, 5, true);
  const assetsVerified = snapshot.assetsVerified === true;
  const sVlm = snapshot.outcome === 'delivered' && assetsVerified ? judgeScore : null;
  const measured = [sDet, sCol, sVlm].every(score => score !== null);
  const cqs = measured ? 0.25 * sDet + 0.30 * sCol + 0.45 * sVlm : null;
  for (const value of [snapshot.migMean, snapshot.ddr]) {
    requireCondition(value === undefined || bounded(value, 1), 'MIG ou DDR fora da escala [0, 1].');
  }
  const dimensions = Object.fromEntries(Object.keys(judgeWeights).map(key => [key, snapshot.judgeScores?.[key]?.score ?? null]));
  return {
    outcome: snapshot.outcome, reason: snapshot.reason ?? null, staged, sDet, sCol, sVlm, cqs, dimensions,
    migMean: snapshot.migMean ?? null,
    ddr: snapshot.ddr ?? null,
    assetsVerified,
    coverLab: snapshot.coverLab ?? null,
    factualTrace: snapshot.factualTrace ?? null,
    artPurity: artPurity ?? null,
    judgeInput: snapshot.judgeInput ?? null,
    judgeTrace: snapshot.judgeTrace ?? null,
    novelty: snapshot.novelty ?? null,
    retainedFiles: snapshot.artifacts?.map(artifact => artifact.file) ?? [],
    hardFails: [...new Set([...planFailures, ...Object.values(staged).flatMap(stage => stage.failures), ...(snapshot.coverLab?.violations ?? []), ...(snapshot.factualTrace?.issues.map(issue => issue.id) ?? []), ...(snapshot.novelty?.status === 'fail' ? ['NOVELTY'] : []), ...(artPurity?.status === 'fail' ? ['TEXT_IN_ART_LAYER'] : [])])],
  };
}

async function verifiedNovelty(root, plan, reference) {
  if (reference === undefined) return null;
  requireCondition(plan && typeof reference?.file === 'string' && /^novelty-(?:first-pass|final)\.json$/.test(reference.file)
    && isDigest(reference.sha256), 'Evidência de novidade inválida.');
  const path = join(root, reference.file);
  const file = await lstat(path);
  requireCondition(file.isFile() && file.size <= 1_000_000, 'Observação de novidade precisa ser um arquivo local regular.');
  const assessment = await readDocument(path);
  requireCondition(assessment.digest === reference.sha256, 'SHA-256 da observação de novidade divergente.');
  return reviewNovelty(plan, assessment);
}

async function verifyArtifacts(caseDir, input, facts, assessment) {
  const artifacts = input.artifacts ?? [];
  requireCondition(Array.isArray(artifacts), 'Lista de artefatos inválida.');
  if (artifacts.length === 0) {
    const artPurity = await verifyArtPurity(caseDir, assessment?.artPurityEvidence, { rasterDeclared: input.artSheetApplicable === true });
    return { assetsVerified: false, coverLab: null, judgeInput: null, artPurity };
  }
  const root = await realpath(caseDir);
  const seen = new Set();
  const names = new Set();
  const documents = new Map();
  requireCondition(input.slideCount === undefined
    || (Number.isInteger(input.slideCount) && input.slideCount >= 0 && input.slideCount <= 20),
  'Contagem de lâminas inválida no snapshot.');
  const sets = new Set();
  for (const record of artifacts) {
    requireCondition(typeof record.file === 'string' && !isAbsolute(record.file)
      && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(record.file)
      && !record.file.split('/').some(part => part === '.' || part === '..')
      && !seen.has(record.file) && isDigest(record.sha256),
    'Caminho, duplicidade ou SHA-256 inválido no artefato.');
    const path = await realpath(resolve(root, record.file));
    const local = relative(root, path);
    requireCondition(local && !isAbsolute(local) && local !== '..' && !local.startsWith('..' + sep), 'Artefato fora do diretório do caso.');
    const stat = await lstat(path);
    requireCondition(stat.isFile() && stat.size <= 64_000_000, 'O artefato precisa ser um arquivo regular de até 64 MB.');
    const bytes = await readFile(path);
    requireCondition(sha256(bytes) === record.sha256, `SHA-256 divergente em ${record.file}.`);
    seen.add(record.file);
    const parts = record.file.split('/');
    const name = parts.at(-1);
    sets.add(parts.slice(0, -1).join('/'));
    names.add(name);
    if (name === 'plan.json' || name === 'cover-lab.json' || name === 'render-checks.json') {
      requireCondition(!documents.has(name), 'Documento de evidência duplicado no snapshot.');
      documents.set(name, { value: JSON.parse(bytes), digest: record.sha256 });
    }
  }
  const indices = [...names].filter(name => /^slide-\d{2}\.jpg$/.test(name)).sort();
  const plan = documents.get('plan.json');
  const lab = documents.get('cover-lab.json');
  const renderChecks = documents.get('render-checks.json');
  const rasterDeclared = input.artSheetApplicable === true
    || (Array.isArray(plan?.value?.slides) && plan.value.slides.some(slide => Boolean(slide?.art)))
    || (Array.isArray(renderChecks?.value?.slides) && renderChecks.value.slides.some(slide => Boolean(slide?.artSource)))
    || (Array.isArray(renderChecks?.value?.artifacts) && renderChecks.value.artifacts.some(artifact => artifact?.file === 'art-sheet.jpg'));
  const assetsVerified = sets.size === 1 && indices.length >= 2 && indices.length <= 20
    && indices.every((name, index) => name === `slide-${String(index + 1).padStart(2, '0')}.jpg`)
    && (input.slideCount === undefined || indices.length === input.slideCount)
    && requiredVisualArtifacts.every(name => names.has(name))
    && (names.has('art-sheet.jpg') || (!rasterDeclared && input.artSheetApplicable === false && input.checks?.ART_PURITY?.status === 'not_applicable'));
  if (plan) requireCondition(sets.size === 1 && plan.digest === input.inputSha256, 'Evidência desvinculada do plano renderizado.');
  const factualTrace = plan && Object.hasOwn(plan.value ?? {}, 'claims')
    ? inspectClaimLedger(plan.value, plan.value.claims, facts)
    : null;
  const novelty = await verifiedNovelty(root, plan, assessment?.noveltyEvidence);
  const slideHashes = new Map(artifacts.map(record => [record.file.split('/').at(-1), record.sha256]));
  const artPurity = await verifyArtPurity(root, assessment?.artPurityEvidence, {
    planSha256: input.inputSha256, artSheetSha256: slideHashes.get('art-sheet.jpg'), renderChecks, rasterDeclared,
  });
  const judgeInput = assetsVerified ? {
    deckSha256: judgeDeckHash(indices.map(name => slideHashes.get(name))),
    captionSha256: sha256(plan?.value?.caption ?? ''),
  } : null;
  if (!lab) return { assetsVerified, coverLab: null, factualTrace, novelty, judgeInput, artPurity };
  requireCondition(plan && lab.value?.inputSha256 === plan.digest, 'Lab de capas desvinculado do plano renderizado.');
  const observed = coverLabArtifact(plan.value, plan.digest);
  requireCondition(observed && isDeepStrictEqual(lab.value, observed), 'O Lab de capas diverge dos dados verificados do plano.');
  return { assetsVerified, coverLab: observed, factualTrace, novelty, judgeInput, artPurity };
}

function validatePair(pair) {
  const results = ['first', 'second', 'tie', 'abstain'];
  requireCondition(Number.isInteger(pair.againstCycle) && pair.againstCycle >= 0 && pair.againstCycle <= 4
    && results.includes(pair.candidateFirst) && results.includes(pair.controlFirst)
    && isDigest(pair.controlManifestSha256) && textEvidence(pair.evaluator) && textEvidence(pair.evidence),
  'Julgamento pareado sem as duas ordens, vínculo ou evidência.');
}

const annotatableChecks = new Set(['FACT_GROUNDING', 'S2_STANDALONE', 'CTA_SINGLE', 'ART_PURITY']);
const annotationFields = new Set(['checks', 'collectionScores', 'judgeScores', 'migMean', 'ddr', 'noveltyEvidence', 'judgeEvidence', 'artPurityEvidence']);

async function caseJudgePair(directory, testCase, reference) {
  const pair = await readBlindJudgePair(directory, reference);
  requireCondition(pair.input.briefingSha256 === sha256(judgeBriefing(testCase)), 'O parecer cego pertence a outro briefing ou conjunto de fatos.');
  return pair;
}

function judgeTrace({ digest, model, rubricSha256, input, runs }) {
  return { sha256: digest, model, rubricSha256, input, receiptSha256: runs.map(run => run.receiptSha256) };
}

async function verifySnapshotJudge(directory, testCase, snapshot) {
  const reference = snapshot.judgeEvidence;
  if (reference === undefined) return { ...snapshot, judgeTrace: null };
  const { side } = reference ?? {};
  const pair = await caseJudgePair(directory, testCase, reference);
  requireCondition(['baseline', 'candidate'].includes(side)
    && pair.input[side + 'Hash'] === snapshot.judgeInput?.deckSha256
    && pair.input[side + 'CaptionSha256'] === snapshot.judgeInput?.captionSha256,
  'As notas do juiz pertencem a outro conjunto de lâminas ou legenda.');
  return { ...snapshot, judgeScores: judgeSideScores(pair, side), judgeTrace: judgeTrace(pair) };
}

async function verifyPairwiseJudge(directory, testCase, vote) {
  if (vote.judgeEvidence === undefined) return { ...vote, judgeTrace: null };
  const pair = await caseJudgePair(directory, testCase, vote.judgeEvidence);
  const orderVote = (choice, first) => ['baseline', 'candidate'].includes(choice) ? choice === first ? 'first' : 'second' : choice;
  requireCondition(vote.controlFirst === orderVote(pair.choices[0], 'baseline')
    && vote.candidateFirst === orderVote(pair.choices[1], 'candidate') && vote.evaluator === pair.model,
  'Os votos anotados divergem do parecer cego.');
  return { ...vote, judgeTrace: judgeTrace(pair) };
}

function attachAssessment(snapshot, assessment) {
  if (assessment === undefined) return snapshot;
  requireCondition(assessment && typeof assessment === 'object' && !Array.isArray(assessment)
    && Object.keys(assessment).every(key => annotationFields.has(key)),
  'Uma avaliação adicional só pode fornecer observações editoriais ou pontuações.');
  const checks = { ...snapshot.checks };
  for (const [id, check] of Object.entries(assessment.checks ?? {})) {
    requireCondition(annotatableChecks.has(id), `A avaliação adicional não pode alterar ${id}.`);
    validateCheck(check);
    const previous = checks[id];
    requireCondition(!previous || ['not_run', 'unknown'].includes(previous.status) || previous.status === check.status,
      `A avaliação adicional contradiz um veredito preservado em ${id}.`);
    checks[id] = check;
  }
  return { ...snapshot, ...assessment, checks };
}

async function readAssessments(directory, manifestSha256) {
  try {
    const { value, digest } = await readDocument(join(directory, 'qa-assessments.json'));
    requireCondition(value?.version === formatVersion && value.manifestSha256 === manifestSha256,
      'Avaliação adicional desvinculada do SHA-256 do manifesto.');
    requireCondition(value.pairwise === undefined || Array.isArray(value.pairwise), 'Comparações adicionais inválidas.');
    return { ...value, digest };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function verifySealedExecution(directory, manifest, testCase, expectation) {
  if (!expectation || !['holdout', 'independent'].includes(testCase.split)) return null;
  const trace = manifest.execution;
  const required = {
    caseId: testCase.id, caseSha256: sha256(JSON.stringify(testCase)),
    split: testCase.split, cycle: expectation.cycle, suiteSha256: expectation.suiteSha256,
    candidateSha256: expectation.candidateSha256, controlOnly: expectation.controlOnly,
  };
  if (!trace || !isDigest(required.suiteSha256) || !isDigest(required.candidateSha256)) return { status: 'unavailable' };
  const matches = data => Object.entries(required).every(([key, value]) => data?.[key] === value);
  if (!matches(trace)) return { status: 'fail' };
  const path = join(directory, '..', `${testCase.id}.live-receipt.json`);
  try {
    const file = await lstat(path);
    if (!file.isFile() || file.size > 32_000) return { status: 'fail' };
    const { value: receipt, digest } = await readDocument(path);
    if (!matches(receipt) || receipt.state !== manifest.final.outcome) return { status: 'fail' };
    if (!['delivered', 'rejected_claim', 'blocked_plan'].includes(receipt.state)) return { status: 'unavailable' };
    if (receipt.planner?.state !== 'completed' || !/^sess_[\w-]+$/.test(receipt.planner.sessionId ?? '') ||
      !/^turn_[\w-]+$/.test(receipt.planner.turnId ?? '') || !isDigest(receipt.planner.promptSha256)) return { status: 'fail' };
    return { status: 'pass', receiptSha256: digest, candidateSha256: receipt.candidateSha256 };
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'unavailable' };
    throw error;
  }
}

export async function readCaseEvidence(directory, testCase, expectation) {
  const path = join(directory, 'qa-manifest.json');
  let source;
  try {
    source = await readDocument(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const { value, digest } = source;
  requireCondition(value?.version === formatVersion && value.caseId === testCase.id && value.mode === testCase.mode,
    'Manifesto desvinculado do caso, do modo ou da versão esperada.');
  requireCondition(value.first_pass && value.final && Array.isArray(value.repairs), 'Manifesto sem snapshots ou registro de reparos.');
  requireCondition(Number.isInteger(value.repair_count) && value.repair_count === value.repairs.length
    && value.repairs.every(repair => textEvidence(repair.stage) && textEvidence(repair.reason)),
  'Contagem ou evidência de reparos inválida.');
  requireCondition(value.pairwise === undefined || Array.isArray(value.pairwise), 'Comparações inválidas.');
  const assessments = await readAssessments(directory, digest);
  const pairwise = [...(value.pairwise ?? []), ...(assessments?.pairwise ?? [])];
  requireCondition(new Set(pairwise.map(pair => pair.againstCycle)).size === pairwise.length,
    'Comparações duplicadas ou inválidas.');
  pairwise.forEach(validatePair);
  requireCondition(value.repair_count > 0 || isDeepStrictEqual(value.first_pass, value.final),
    'Snapshots distintos exigem registro de reparo.');
  const sameSnapshot = value.repair_count === 0;
  if (sameSnapshot && assessments?.first_pass && assessments.final) {
    requireCondition(isDeepStrictEqual(assessments.first_pass, assessments.final),
      'Use uma avaliação comum quando não houve reparo.');
  }
  const firstAssessment = assessments?.first_pass ?? (sameSnapshot ? assessments?.final : undefined);
  const first = await verifySnapshotJudge(directory, testCase, {
    ...attachAssessment(value.first_pass, firstAssessment),
    ...await verifyArtifacts(directory, value.first_pass, testCase.facts, firstAssessment),
  });
  const final = sameSnapshot ? first : await verifySnapshotJudge(directory, testCase, {
    ...attachAssessment(value.final, assessments?.final),
    ...await verifyArtifacts(directory, value.final, testCase.facts, assessments?.final),
  });
  return {
    digest, assessmentSha256: assessments?.digest ?? null, repairCount: value.repair_count,
    execution: await verifySealedExecution(directory, value, testCase, expectation),
    first: summarizeSnapshot(first), final: summarizeSnapshot(final),
    pairwise: await Promise.all(pairwise.map(vote => verifyPairwiseJudge(directory, testCase, vote))),
  };
}
