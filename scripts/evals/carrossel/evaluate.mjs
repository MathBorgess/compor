import { join } from 'node:path';
import { readCaseEvidence } from './evidence.mjs';
import { formatVersion, requiredChecks, sha256 } from './protocol.mjs';

const baselineNote = {
  revision: '2c96e22',
  source: 'docs/evals/pr61/05-post.md',
  readyCarousels: 2,
  observedCarousels: 2,
  limit: 'Proxy histórico de dois carrosséis de desenvolvimento. A reserva histórica foi exposta. Sem equivalência com CQS ou FPY.',
};

function reached(snapshot, stage) {
  return snapshot?.staged[stage].complete === true && snapshot.staged[stage].failures.length === 0;
}

function expectedResult(item, snapshot) {
  if (!snapshot || ['unknown', 'failed_execution'].includes(snapshot.outcome)) return 'unavailable';
  if (item.expected === 'reject_claim') {
    if (snapshot.outcome === 'delivered') return 'fail';
    if (snapshot.outcome !== 'rejected_claim') return 'unavailable';
    const grounding = snapshot.staged.editorial;
    if (grounding.failures.includes('FACT_GROUNDING')) return 'fail';
    return grounding.passed.includes('FACT_GROUNDING') ? 'pass' : 'unavailable';
  }
  if (snapshot.outcome !== 'delivered' || snapshot.hardFails.length) return 'fail';
  return snapshot.assetsVerified && Object.keys(requiredChecks).every(stage => reached(snapshot, stage)) ? 'pass' : 'unavailable';
}

function yieldFor(cases, stage) {
  const eligible = cases.filter(item => item.expected === 'deliver_deck');
  const passed = eligible.filter(item => reached(item.first, stage)
    && (stage !== 'physical' || item.first.assetsVerified)).length;
  const failed = eligible.filter(item => (item.first?.staged[stage].failures.length ?? 0) > 0).length;
  return { eligible: eligible.length, passed, failed, unavailable: eligible.length - passed - failed,
    rate: eligible.length ? passed / eligible.length : null };
}

function average(cases, readValue) {
  const values = cases.map(readValue).filter(Number.isFinite);
  return { eligible: cases.length, observed: values.length,
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

function completeAverage(cases, readValue) {
  const summary = average(cases, readValue);
  return summary.eligible === summary.observed ? summary.value : null;
}

function pairResult(candidate, control, againstCycle) {
  const vote = candidate.pairwise.find(pair => pair.againstCycle === againstCycle);
  if (!candidate.final?.assetsVerified || !control?.final?.assetsVerified || candidate.caseFingerprint !== control.caseFingerprint
    || vote?.controlManifestSha256 !== control.manifestSha256) return 'unavailable';
  if (vote.candidateFirst === 'first' && vote.controlFirst === 'second') return 'win';
  if (vote.candidateFirst === 'second' && vote.controlFirst === 'first') return 'loss';
  if (vote.candidateFirst === 'tie' && vote.controlFirst === 'tie') return 'tie';
  return 'inconclusive';
}

function compare(cases, reference, againstCycle) {
  const controls = new Map((reference?.cases ?? []).map(item => [item.id, item]));
  const observed = { win: 0, loss: 0, tie: 0, inconclusive: 0, unavailable: 0 };
  for (const candidate of cases) observed[pairResult(candidate, controls.get(candidate.id), againstCycle)] += 1;
  const matched = cases.map(candidate => [candidate, controls.get(candidate.id)])
    .filter(([candidate, control]) => candidate.caseFingerprint === control?.caseFingerprint
      && Number.isFinite(candidate.final?.cqs) && Number.isFinite(control.final?.cqs));
  const delta = matched.length && matched.length === cases.length
    ? matched.reduce((sum, [candidate, control]) => sum + candidate.final.cqs - control.final.cqs, 0) / matched.length
    : null;
  return { againstCycle, eligible: cases.length, ...observed, delta,
    rate: cases.length && observed.unavailable === 0 ? observed.win / cases.length : null };
}

function minimum(name, value, target) {
  return { name, observed: value, target, status: !Number.isFinite(value) ? 'unavailable' : value >= target ? 'pass' : 'fail' };
}

function minimumYield(name, tally, target) {
  const upperBound = tally.eligible ? (tally.passed + tally.unavailable) / tally.eligible : null;
  const check = minimum(name, tally.rate, target);
  if (check.status === 'fail' && upperBound >= target) check.status = 'unavailable';
  return { ...check, eligible: tally.eligible, observedCases: tally.passed + tally.failed };
}

function expectedCoverage(cases, checkName = 'desfecho_esperado') {
  const observed = cases.filter(item => item.verdict === 'pass').length;
  const status = cases.some(item => item.verdict === 'fail') ? 'fail'
    : cases.length && observed === cases.length ? 'pass' : 'unavailable';
  return { name: checkName, observed, target: cases.length, status };
}

function physicsPass(cases) {
  const observed = cases.filter(item => reached(item.final, 'physical') && item.final.assetsVerified).length;
  const status = cases.some(item => item.final?.staged.physical.failures.length) ? 'fail'
    : cases.length && observed === cases.length ? 'pass' : 'unavailable';
  return { name: 'fisica_sem_falhas', observed, target: cases.length, status };
}

function dimensionFloor(cases) {
  const items = cases.flatMap(item => Object.values(item.final?.dimensions ?? {}));
  return cases.every(item => Number.isFinite(item.final?.sVlm)) && items.length ? Math.min(...items) : null;
}

function promotionChecks(cycle, cases, split, references) {
  const selected = cycle === 4 ? cases.filter(item => item.split === 'holdout')
    : cases.filter(item => item.split === split);
  const decks = selected.filter(item => item.expected === 'deliver_deck');
  const final = key => completeAverage(decks, item => item.final?.[key]);
  const pair = (againstCycle, minimumRate) => {
    const result = compare(decks, references.get(againstCycle), againstCycle);
    return { result, check: minimum(`pareado_c${againstCycle}`, result.rate, minimumRate) };
  };
  if (cycle === 0) {
    return { checks: [
      minimum('cobertura_baseline', completeAverage(decks, item => Number.isFinite(item.final?.cqs) && item.final.assetsVerified ? 1 : null), 1),
      minimum('cobertura_primeira_passagem', completeAverage(decks, item => item.first?.assetsVerified && Object.values(item.first.staged).every(stage => stage.complete) ? 1 : null), 1),
      expectedCoverage(selected.filter(item => item.expected === 'reject_claim'), 'canarios_de_recusa'),
    ], comparisons: [] };
  }
  if (cycle === 1) {
    const c0 = pair(0, 0.65);
    return { checks: [physicsPass(decks), minimumYield('fpy_fisico', yieldFor(decks, 'physical'), 0.90),
      minimum('s_det', final('sDet'), 88), c0.check], comparisons: [c0.result] };
  }
  if (cycle === 2) {
    const c1 = pair(1, 0.60);
    return { checks: [expectedCoverage(selected), minimumYield('fpy_editorial', yieldFor(decks, 'editorial'), 0.85),
      minimum('mig_medio', final('migMean'), 0.75), minimum('delta_cqs', c1.result.delta, 5), c1.check], comparisons: [c1.result] };
  }
  if (cycle === 3) {
    const c2 = pair(2, 0.60);
    const artPurity = completeAverage(decks, item => {
      if (item.final?.staged.collection.failures.includes('ART_PURITY')) return 0;
      return item.final?.staged.collection.passed.includes('ART_PURITY') ? 1 : null;
    });
    return { checks: [minimum('s_col', final('sCol'), 85), minimum('ddr', final('ddr'), 0.75),
      minimum('arte_mensagem', completeAverage(decks, item => item.final?.dimensions.artMessage), 4),
      minimum('arte_limpa', artPurity, 1), minimum('delta_cqs', c2.result.delta, 4), c2.check], comparisons: [c2.result] };
  }
  const allDecks = cases.filter(item => item.expected === 'deliver_deck');
  const controls = cycle === 4 ? [pair(0, 0.85), pair(3, 0.60)] : [pair(4, 0.60)];
  return { checks: [expectedCoverage(cases), minimum('cqs', completeAverage(allDecks, item => item.final?.cqs), 85),
    minimum('s_vlm', completeAverage(allDecks, item => item.final?.sVlm), 82),
    minimum('piso_dimensoes_vlm', dimensionFloor(allDecks), 3.5), ...controls.map(control => control.check)],
  comparisons: controls.map(control => control.result) };
}

async function evaluateCase(testCase, evidenceRoot) {
  const evidence = await readCaseEvidence(join(evidenceRoot, testCase.id), testCase);
  const { id, split, expected, mode, strata } = testCase;
  return {
    id, split, expected, mode, strata, caseFingerprint: sha256(JSON.stringify(testCase)),
    manifestSha256: evidence?.digest ?? null, assessmentSha256: evidence?.assessmentSha256 ?? null, repairCount: evidence?.repairCount ?? null,
    first: evidence?.first ?? null, final: evidence?.final ?? null, pairwise: evidence?.pairwise ?? [],
    verdict: expectedResult(testCase, evidence?.final),
  };
}

export async function evaluate({ cycle, tests, evidenceRoot, references, controlOnly, suiteDigests }) {
  const cases = [];
  for (const testCase of tests) cases.push(await evaluateCase(testCase, evidenceRoot));
  const split = cycle === 5 ? 'independent' : 'dev';
  const { checks, comparisons } = controlOnly ? { checks: [], comparisons: [] }
    : promotionChecks(cycle, cases, split, references);
  const hardFailDecks = cases.filter(item => item.expected === 'deliver_deck' && item.final?.hardFails.length).length;
  const pass = checks.length > 0 && checks.every(check => check.status === 'pass');
  return {
    version: formatVersion, cycle, suiteDigests, controlOnly, historicalBaseline: baselineNote,
    status: controlOnly ? 'control_only' : pass ? (cycle === 0 ? 'baseline_recorded' : 'eligible_for_review') : 'insufficient_or_failed',
    checks, comparisons,
    coverage: {
      total: cases.length, withManifest: cases.filter(item => item.manifestSha256).length,
      accepted: cases.filter(item => item.expected === 'deliver_deck' && item.verdict === 'pass').length,
      rejectedAsExpected: cases.filter(item => item.expected === 'reject_claim' && item.verdict === 'pass').length,
      failed: cases.filter(item => item.verdict === 'fail').length,
      unavailable: cases.filter(item => item.verdict === 'unavailable').length,
      hardFailDecks,
    },
    firstPassYield: Object.fromEntries(Object.keys(requiredChecks).map(stage => [stage, yieldFor(cases, stage)])),
    repair_count: cases.reduce((count, item) => count + (item.repairCount ?? 0), 0),
    scores: Object.fromEntries(['sDet', 'sCol', 'sVlm', 'cqs'].map(key => [key, average(
      cases.filter(item => item.expected === 'deliver_deck'), item => item.final?.[key],
    )])),
    cases,
  };
}
