import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { bounded, formatVersion, isDigest, judgeWeights, readDocument, requireCondition, sha256 } from './protocol.mjs';

export const judgeModel = 'gpt-6.2-astra';
const judgeSource = await readFile(new URL('./blind-judge.mjs', import.meta.url));
export const judgeRubricSha256 = sha256(JSON.stringify({ model: judgeModel, source: sha256(judgeSource), weights: judgeWeights }));
const resultStates = ['baseline', 'candidate', 'tie', 'abstain'];

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function judgeBriefing({ briefing, facts }) {
  return JSON.stringify({ briefing, facts });
}

export function judgeDeckHash(slideHashes) {
  return sha256(JSON.stringify(slideHashes));
}

export function validateJudgeResult(result) {
  requireCondition(['A', 'B', 'tie', 'abstain'].includes(result?.winner) && hasText(result.reason), 'judge_verdict_invalid');
  for (const label of ['A', 'B']) {
    const answer = result[label];
    requireCondition(Array.isArray(answer?.defects) && answer.defects.every(defect =>
      Number.isInteger(defect?.slide) && defect.slide >= 1 && defect.slide <= 20 && Object.hasOwn(judgeWeights, defect.dimension) &&
      hasText(defect.evidence) && typeof defect.critical === 'boolean'), 'judge_defects_invalid');
    for (const key of Object.keys(judgeWeights)) {
      const score = answer.scores?.[key];
      requireCondition(bounded(score?.value, 5) && hasText(score.evidence), 'judge_score_invalid');
      if (answer.defects.some(defect => defect.critical && defect.dimension === key)) {
        requireCondition(score.value <= 2, 'judge_critical_cap_invalid');
      }
    }
  }
  return result;
}

export function canonicalJudgeChoice({ winner }, baselineSlot) {
  return winner === baselineSlot ? 'baseline' : ['A', 'B'].includes(winner) ? 'candidate' : winner;
}

export async function readJudgeDocument(directory, file) {
  const path = join(directory, file);
  const stat = await lstat(path);
  requireCondition(stat.isFile() && stat.size <= 1_000_000, 'A evidência do juiz deve ser um arquivo local regular de até 1 MB.');
  return readDocument(path);
}

export async function readBlindJudgePair(directory, reference) {
  requireCondition(/^[a-z0-9-]{1,80}\.pair\.json$/.test(reference?.file ?? '') && isDigest(reference.sha256),
    'Referência inválida aos pareceres cegos.');
  const { value: pair, digest } = await readJudgeDocument(directory, reference.file);
  requireCondition(digest === reference.sha256, 'SHA-256 divergente no relatório do julgamento cego.');
  requireCondition(pair?.version === formatVersion && pair.model === judgeModel && pair.rubricSha256 === judgeRubricSha256
    && ['baselineHash', 'candidateHash', 'briefingSha256', 'baselineCaptionSha256', 'candidateCaptionSha256']
      .every(key => isDigest(pair.input?.[key])), 'O par precisa de rubrica atual e insumos identificáveis.');
  const stem = reference.file.slice(0, -'.pair.json'.length);
  const runs = await Promise.all(['ab', 'ba'].map(async (order, index) => {
    const { digest: receiptSha256, value: receipt } = await readJudgeDocument(directory, stem + '-' + order + '.receipt.json');
    const reported = index === 0 ? pair.forward : pair.reverse;
    requireCondition(receipt?.state === 'completed' && receipt.httpStatus >= 200 && receipt.httpStatus < 300
      && receipt.model === judgeModel && receipt.rubricSha256 === judgeRubricSha256 && receipt.order === order
      && isDeepStrictEqual(receipt.input, pair.input) && reported?.receiptSha256 === receiptSha256
      && isDeepStrictEqual(receipt.output, reported.output)
      && /^sess_[\w-]{1,128}$/.test(receipt.sessionId ?? '') && /^turn_[\w-]{1,128}$/.test(receipt.turnId ?? ''),
    'Recibo incompleto ou desvinculado do julgamento cego.');
    const output = validateJudgeResult(receipt.output);
    const baselineSlot = index === 0 ? 'A' : 'B';
    return {
      sessionId: receipt.sessionId, turnId: receipt.turnId, receiptSha256, baseline: output[baselineSlot],
      candidate: output[index === 0 ? 'B' : 'A'], choice: canonicalJudgeChoice(output, baselineSlot),
    };
  }));
  const choices = runs.map(run => run.choice);
  requireCondition(runs[0].sessionId !== runs[1].sessionId && runs[0].turnId !== runs[1].turnId
    && choices.every(choice => resultStates.includes(choice))
    && isDeepStrictEqual(pair.results, choices), 'O relatório precisa de vereditos coerentes em duas sessões independentes.');
  return { digest, model: pair.model, rubricSha256: pair.rubricSha256, input: pair.input, choices, runs };
}

export function judgeSideScores(pair, side) {
  const scores = Object.entries(judgeWeights).map(([dimension]) => {
    const notes = pair.runs.map(run => run[side].scores[dimension]);
    const critical = pair.runs.some(run => run[side].defects.some(defect => defect.critical && defect.dimension === dimension));
    const score = (notes[0].value + notes[1].value) / 2;
    return [dimension, {
      evaluator: pair.model, score: critical ? Math.min(2, score) : score, critical,
      evidence: notes.map(note => note.evidence).join(' / '),
    }];
  });
  return Object.fromEntries(scores);
}
