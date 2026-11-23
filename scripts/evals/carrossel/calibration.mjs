import { isDeepStrictEqual } from 'node:util';
import { hasText, judgeBriefing, judgeModel, judgeRubricSha256, readBlindJudgePair, readJudgeDocument } from './judge-evidence.mjs';
import { bounded, formatVersion, isDigest, isId, judgeWeights, requireCondition, sha256 } from './protocol.mjs';

const cohort = 'judge-calibration';
const sides = ['baseline', 'candidate'];
const dimensions = Object.keys(judgeWeights);
const targets = { cases: 6, validPairs: 2, defectivePairs: 2, repetitions: 2, referenceAgreement: 0.8, sigmaBelow: 0.35, dimensionMae: 0.75 };
export const calibrationFile = 'judge-calibration.json';

export function briefingKey(briefing) {
  return sha256(briefing.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
}

function criticalKey({ slide, dimension }) {
  return `${slide}:${dimension}`;
}

function validLabel(label) {
  return isDigest(label?.deckSha256) && isDigest(label.captionSha256)
    && dimensions.every(dimension => bounded(label.scores?.[dimension], 5))
    && Array.isArray(label.criticalDefects) && label.criticalDefects.every(defect =>
      Number.isInteger(defect?.slide) && defect.slide >= 1 && defect.slide <= 20
      && Object.hasOwn(judgeWeights, defect.dimension) && hasText(defect.evidence)
      && label.scores[defect.dimension] <= 2)
    && new Set(label.criticalDefects.map(criticalKey)).size === label.criticalDefects.length;
}

function readLabels({ value, digest }, truthSha256) {
  requireCondition(isDigest(truthSha256) && digest === truthSha256, 'SHA-256 dos rótulos de referência diverge do valor congelado.');
  const reference = value?.reference;
  requireCondition(value?.version === formatVersion && value.split === cohort
    && ['human', 'independent_rubric'].includes(reference?.kind) && isId(reference.reviewerId)
    && hasText(reference.source) && reference.source.length <= 500
    && Array.isArray(value.cases) && value.cases.length >= targets.cases && value.cases.length <= 30,
  'A calibração precisa de uma coorte própria de seis a trinta casos e da origem e autoria dos rótulos de referência.');
  const ids = new Set();
  const briefings = new Set();
  const decks = new Set();
  const labels = value.cases.map(item => {
    requireCondition(isId(item?.id) && hasText(item.briefing) && Array.isArray(item.facts) && item.facts.every(hasText)
      && [...sides, 'tie'].includes(item.winner) && hasText(item.reason) && sides.every(side => validLabel(item[side])),
    'Rótulo de referência inválido. Preencha os oito escores, o veredito e a evidência dos defeitos críticos.');
    const key = briefingKey(item.briefing);
    requireCondition(!ids.has(item.id) && !briefings.has(key), 'A coorte de calibração repete um caso ou briefing.');
    ids.add(item.id);
    briefings.add(key);
    for (const side of sides) {
      requireCondition(!decks.has(item[side].deckSha256), 'A coorte de calibração repete uma coleção visual.');
      decks.add(item[side].deckSha256);
    }
    return { ...item, briefingKey: key };
  });
  const defectivePairs = labels.filter(item => sides.some(side => item[side].criticalDefects.length)).length;
  requireCondition(defectivePairs >= targets.defectivePairs && labels.length - defectivePairs >= targets.validPairs,
    'Inclua ao menos dois pares válidos e dois com defeito crítico identificado na revisão de referência.');
  return labels;
}

async function readObservations(directory, value, labels, truthSha256) {
  requireCondition(value?.version === formatVersion && value.truthSha256 === truthSha256
    && Array.isArray(value.cases) && value.cases.length === labels.length, 'Observações desvinculadas dos rótulos de referência.');
  const observations = new Map();
  const sessions = new Set();
  const turns = new Set();
  for (const item of value.cases) {
    requireCondition(isId(item?.id) && !observations.has(item.id) && Array.isArray(item.pairs)
      && item.pairs.length === targets.repetitions, 'Forneça duas repetições, com duas ordens cada, por caso de calibração.');
    const pairs = await Promise.all(item.pairs.map(pair => readBlindJudgePair(directory, pair)));
    for (const { runs } of pairs) {
      for (const { sessionId, turnId } of runs) {
        requireCondition(!sessions.has(sessionId) && !turns.has(turnId), 'Uma sessão ou turno do juiz foi reutilizado na calibração.');
        sessions.add(sessionId);
        turns.add(turnId);
      }
    }
    observations.set(item.id, pairs);
  }
  return labels.map(label => {
    const pairs = observations.get(label.id);
    const expectedInput = {
      baselineHash: label.baseline.deckSha256, candidateHash: label.candidate.deckSha256,
      briefingSha256: sha256(judgeBriefing(label)),
      baselineCaptionSha256: label.baseline.captionSha256, candidateCaptionSha256: label.candidate.captionSha256,
    };
    requireCondition(pairs?.every(pair => isDeepStrictEqual(pair.input, expectedInput)),
      'As repetições precisam avaliar o mesmo briefing, legendas e coleções da revisão de referência.');
    return { label, pairs };
  });
}

function summarizeMeasurements(cases) {
  let agreements = 0;
  let orderDisagreements = 0;
  let falsePositiveCritical = 0;
  let missedCritical = 0;
  const differences = Object.fromEntries(dimensions.map(dimension => [dimension, { repeatVariance: 0, absError: 0 }]));
  for (const { label, pairs } of cases) {
    if (pairs.every(pair => pair.choices.every(choice => choice === label.winner))) agreements += 1;
    orderDisagreements += pairs.filter(pair => pair.choices[0] !== pair.choices[1]).length;
    for (const side of sides) {
      const expected = new Set(label[side].criticalDefects.map(criticalKey));
      for (const order of [0, 1]) {
        const [first, second] = pairs.map(pair => pair.runs[order][side]);
        for (const run of [first, second]) {
          const detected = new Set(run.defects.filter(defect => defect.critical).map(criticalKey));
          falsePositiveCritical += [...detected].filter(key => !expected.has(key)).length;
          missedCritical += [...expected].filter(key => !detected.has(key)).length;
        }
        for (const dimension of dimensions) {
          const a = first.scores[dimension].value;
          const b = second.scores[dimension].value;
          const reference = label[side].scores[dimension];
          differences[dimension].repeatVariance += ((a - b) / 2) ** 2;
          differences[dimension].absError += Math.abs(a - reference) + Math.abs(b - reference);
        }
      }
    }
  }
  const groups = cases.length * sides.length * 2;
  const metrics = {
    cases: cases.length, agreementCases: agreements, referenceAgreement: agreements / cases.length,
    orderDisagreements, falsePositiveCritical, missedCritical,
    dimensions: Object.fromEntries(dimensions.map(dimension => [dimension, {
      sigma: Math.sqrt(differences[dimension].repeatVariance / groups),
      mae: differences[dimension].absError / (groups * targets.repetitions),
    }])),
  };
  const pass = metrics.referenceAgreement >= targets.referenceAgreement
    && metrics.falsePositiveCritical === 0 && metrics.missedCritical === 0
    && Object.values(metrics.dimensions).every(({ sigma, mae }) => sigma < targets.sigmaBelow && mae <= targets.dimensionMae);
  return { status: pass ? 'pass' : 'fail', targets, metrics };
}

export async function measureJudgeCalibration(directory, truthSha256) {
  const [truth, observations] = await Promise.all([
    readJudgeDocument(directory, 'reference-labels.json'), readJudgeDocument(directory, 'observations.json'),
  ]);
  const labels = readLabels(truth, truthSha256);
  const cases = await readObservations(directory, observations.value, labels, truthSha256);
  const { kind, reviewerId, source } = truth.value.reference;
  return {
    version: formatVersion, split: cohort, model: judgeModel, rubricSha256: judgeRubricSha256,
    truthSha256: truth.digest, observationsSha256: observations.digest, reference: { kind, reviewerId, source },
    ...summarizeMeasurements(cases),
    cases: cases.map(({ label, pairs }) => ({
      id: label.id, briefingKey: label.briefingKey,
      deckSha256: sides.map(side => label[side].deckSha256),
      judgments: pairs.map(pair => ({ sha256: pair.digest, receipts: pair.runs.map(run => run.receiptSha256) })),
    })),
  };
}

export async function readJudgeCalibration(directory, expectedSha256) {
  const { value, digest } = await readJudgeDocument(directory, calibrationFile);
  requireCondition(isDigest(expectedSha256) && digest === expectedSha256, 'SHA-256 do relatório de calibração diverge do valor informado.');
  const measured = await measureJudgeCalibration(directory, value.truthSha256);
  requireCondition(isDeepStrictEqual(measured, value), 'O relatório de calibração diverge dos rótulos, recibos ou métricas verificadas.');
  return { report: measured, sha256: digest };
}
