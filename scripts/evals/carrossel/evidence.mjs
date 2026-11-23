import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
  const checks = snapshot.checks ?? {};
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
    retainedFiles: snapshot.artifacts?.map(artifact => artifact.file) ?? [],
    hardFails: [...planFailures, ...Object.values(staged).flatMap(stage => stage.failures)],
  };
}

async function verifyArtifacts(caseDir, input) {
  const artifacts = input.artifacts ?? [];
  requireCondition(Array.isArray(artifacts), 'Lista de artefatos inválida.');
  if (artifacts.length === 0) return false;
  const root = await realpath(caseDir);
  const seen = new Set();
  const names = new Set();
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
    requireCondition(sha256(await readFile(path)) === record.sha256, `SHA-256 divergente em ${record.file}.`);
    seen.add(record.file);
    const parts = record.file.split('/');
    sets.add(parts.slice(0, -1).join('/'));
    names.add(parts.at(-1));
  }
  const indices = [...names].filter(name => /^slide-\d{2}\.jpg$/.test(name)).sort();
  return sets.size === 1 && indices.length >= 2 && indices.length <= 20
    && indices.every((name, index) => name === `slide-${String(index + 1).padStart(2, '0')}.jpg`)
    && (input.slideCount === undefined || indices.length === input.slideCount)
    && requiredVisualArtifacts.every(name => names.has(name))
    && (names.has('art-sheet.jpg') || (input.artSheetApplicable === false && input.checks?.ART_PURITY?.status === 'not_applicable'));
}

function validatePair(pair) {
  const results = ['first', 'second', 'tie', 'abstain'];
  requireCondition(Number.isInteger(pair.againstCycle) && pair.againstCycle >= 0 && pair.againstCycle <= 4
    && results.includes(pair.candidateFirst) && results.includes(pair.controlFirst)
    && isDigest(pair.controlManifestSha256) && textEvidence(pair.evaluator) && textEvidence(pair.evidence),
  'Julgamento pareado sem as duas ordens, vínculo ou evidência.');
}

const annotatableChecks = new Set(['FACT_GROUNDING', 'S2_STANDALONE', 'CTA_SINGLE', 'ART_PURITY']);
const annotationFields = new Set(['checks', 'collectionScores', 'judgeScores', 'migMean', 'ddr']);

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

export async function readCaseEvidence(directory, testCase) {
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
  const first = {
    ...attachAssessment(value.first_pass, firstAssessment),
    assetsVerified: await verifyArtifacts(directory, value.first_pass),
  };
  const final = sameSnapshot ? first : {
    ...attachAssessment(value.final, assessments?.final),
    assetsVerified: await verifyArtifacts(directory, value.final),
  };
  return {
    digest, assessmentSha256: assessments?.digest ?? null, repairCount: value.repair_count,
    first: summarizeSnapshot(first), final: summarizeSnapshot(final), pairwise,
  };
}
