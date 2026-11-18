/** Rates are frozen by the experiment; receipts supply the observed usage and model. */
export function estimateImageCost(usage, rateCard, observedModel) {
  if (!rateCard || !rateCard.version || rateCard.currency !== 'USD' ||
      rateCard.endpoint !== 'images' || rateCard.tier !== 'standard' ||
      typeof observedModel !== 'string' || rateCard.model !== observedModel) return null;
  const rates = rateCard.usdPerMillion;
  if (!rates || ![rates.inputText, rates.inputImage, rates.outputImage].every(money)) return null;

  const input = usage?.input_tokens_details;
  const output = usage?.output_tokens_details;
  const counts = [usage?.input_tokens, usage?.output_tokens, usage?.total_tokens,
    input?.text_tokens, input?.image_tokens, output?.image_tokens];
  if (!counts.every(count => Number.isSafeInteger(count) && count >= 0)) return null;
  if (input.text_tokens + input.image_tokens !== usage.input_tokens ||
      output.image_tokens !== usage.output_tokens ||
      usage.input_tokens + usage.output_tokens !== usage.total_tokens) return null;
  if ((input.cached_tokens ?? 0) !== 0 || (usage.cached_input_tokens ?? 0) !== 0) return null;
  return (input.text_tokens * rates.inputText + input.image_tokens * rates.inputImage +
    output.image_tokens * rates.outputImage) / 1_000_000;
}

const ARMS = ['with', 'without'];
const POSITIONS = [1, 2, 3];
const STATES = ['complete', 'failed', 'not-submitted', 'unknown'];
const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isId = value => typeof value === 'string' && value.trim().length > 0;
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const difference = (a, b) => a === null || b === null ? null : a - b;

function check(condition, explanation) {
  if (!condition) throw new TypeError(explanation);
}

function validateArm(observation, spec) {
  const { arm, planCostUsd, slots } = observation;
  check(ARMS.includes(arm), 'arm must be with or without');
  check(planCostUsd == null || money(planCostUsd), 'invalid planner cost');
  check(Array.isArray(slots) && slots.length === 3, 'each recorded arm must contain three ordered slots');
  for (const [i, slot] of slots.entries()) {
    check(slot && STATES.includes(slot.state), 'invalid slot state');
    check(slot.position === undefined || slot.position === i + 1, 'slots out of order');
    check(slot.imageCostUsd == null || money(slot.imageCostUsd), 'invalid image cost');
    check(slot.state !== 'not-submitted' || (slot.imageCostUsd ?? 0) === 0, 'unsubmitted slot with cost');
    check(slot.usable == null || typeof slot.usable === 'boolean', 'invalid usability verdict');
    check(slot.state === 'complete' || slot.usable !== true, 'only an observed output can be usable');
    check(slot.state !== 'unknown' || slot.usable == null, 'unknown outcome with usability verdict');
    const scores = slot.fidelity ?? {};
    check(typeof scores === 'object' && !Array.isArray(scores), 'invalid attribute verdict map');
    for (const [id, score] of Object.entries(scores)) {
      check(spec.attributeIds.includes(id), 'unknown attribute ID');
      check(score === null || (slot.state === 'complete' && [0, 1, 2].includes(score)),
        'numeric fidelity needs observed pixels and a 0, 1 or 2 verdict');
    }
  }
}

function scoreSlot(slot) {
  if (!slot) return { state: 'unknown', imageCostUsd: null, usable: null, fidelity: {} };
  const confirmedNoArt = slot.state === 'failed' || slot.state === 'not-submitted';
  return {
    state: slot.state,
    imageCostUsd: slot.state === 'not-submitted' ? 0 : slot.imageCostUsd ?? null,
    usable: confirmedNoArt ? false : slot.usable ?? null,
    fidelity: slot.fidelity ?? {},
  };
}

function summarizeArm(pairs, arm) {
  const totals = { plannedSlots: pairs.length * 3, complete: 0, failed: 0, unknown: 0, notSubmitted: 0,
    usable: 0, unknownUsability: 0, knownImageCosts: 0, knownImageSubtotalUsd: 0,
    knownPlanCosts: 0, knownPlanSubtotalUsd: 0,
    observedAttributeSlots: 0, expectedAttributeSlots: 0, fidelityPoints: 0 };
  for (const pair of pairs) {
    const recorded = pair[arm];
    const planCost = pair.shared ? (pair.sharedCost === null ? null : pair.sharedCost / 2) : recorded?.planCostUsd;
    if (money(planCost)) {
      totals.knownPlanCosts++;
      totals.knownPlanSubtotalUsd += planCost;
    }
    for (const n of POSITIONS) {
      const slot = scoreSlot(recorded?.slots[n - 1]);
      totals[slot.state === 'not-submitted' ? 'notSubmitted' : slot.state]++;
      if (slot.usable === null) totals.unknownUsability++;
      if (slot.usable === true) totals.usable++;
      if (slot.imageCostUsd !== null) {
        totals.knownImageCosts++;
        totals.knownImageSubtotalUsd += slot.imageCostUsd;
      }
      for (const id of pair.spec.attributeIds) {
        totals.expectedAttributeSlots++;
        if (readScore(slot.fidelity, id) != null) {
          totals.observedAttributeSlots++;
          totals.fidelityPoints += slot.fidelity[id];
        }
      }
    }
  }
  const imageCostUsd = totals.knownImageCosts === totals.plannedSlots ? totals.knownImageSubtotalUsd : null;
  const totalCostUsd = imageCostUsd !== null && totals.knownPlanCosts === pairs.length
    ? imageCostUsd + totals.knownPlanSubtotalUsd : null;
  const perUsable = cost => cost !== null && totals.usable > 0 && totals.unknownUsability === 0 ? cost / totals.usable : null;
  return { ...totals, imageCostUsd, totalCostUsd, imageUsdPerUsable: perUsable(imageCostUsd),
    totalUsdPerUsable: perUsable(totalCostUsd) };
}

function readScore(scores, id) {
  return scores && Object.hasOwn(scores, id) ? scores[id] : null;
}

function matchedFidelity(pair) {
  const perAttribute = pair.spec.attributeIds.map(attributeId => {
    const deltas = [];
    for (const n of POSITIONS) {
      const a = readScore(pair.with?.slots[n - 1].fidelity, attributeId);
      const b = readScore(pair.without?.slots[n - 1].fidelity, attributeId);
      if (a != null && b != null) deltas.push(a - b);
    }
    return { attributeId, expectedSlots: 3, matchedSlots: deltas.length, meanDeltaPoints: average(deltas) };
  });
  const matchedSlots = perAttribute.reduce((n, a) => n + a.matchedSlots, 0);
  const expected = perAttribute.length * 3;
  const sum = perAttribute.reduce((n, a) => n + (a.meanDeltaPoints ?? 0) * a.matchedSlots, 0);
  return { caseId: pair.spec.id, perAttribute, matchedAttributeSlots: matchedSlots, expectedAttributeSlots: expected,
    observedMeanDeltaPoints: matchedSlots ? sum / matchedSlots : null,
    fullCaseMeanDeltaPoints: matchedSlots === expected ? sum / expected : null };
}

function summarizeGroup(pairs) {
  const withArm = summarizeArm(pairs, 'with'), withoutArm = summarizeArm(pairs, 'without');
  const cases = pairs.map(matchedFidelity);
  const fullyScored = cases.filter(row => row.fullCaseMeanDeltaPoints !== null);
  const observed = cases.map(row => row.observedMeanDeltaPoints).filter(value => value !== null);
  return { caseIds: pairs.map(p => p.spec.id), arms: { with: withArm, without: withoutArm },
    paired: { fullCases: fullyScored.length, plannedCases: pairs.length,
      observedCaseMacroDeltaPoints: average(observed),
      fullCohortMacroDeltaPoints: fullyScored.length === pairs.length ? average(observed) : null,
      imageUsdPerUsableDelta: difference(withArm.imageUsdPerUsable, withoutArm.imageUsdPerUsable),
      totalUsdPerUsableDelta: difference(withArm.totalUsdPerUsable, withoutArm.totalUsdPerUsable), cases } };
}

/** One frozen revision per call. Missing records remain in every planned denominator. */
export function summarizeAblation(cases, observations, sharedPlanCosts = {}) {
  check(Array.isArray(cases) && cases.length > 0 && Array.isArray(observations), 'invalid evaluation roster');
  check(sharedPlanCosts && typeof sharedPlanCosts === 'object' && !Array.isArray(sharedPlanCosts), 'invalid shared costs');
  const pairs = new Map();
  for (const spec of cases) {
    check(spec && isId(spec.id) && !pairs.has(spec.id) && isId(spec.split), 'invalid or duplicate case');
    check(Number.isInteger(spec.referenceCount) && spec.referenceCount >= 1 && spec.referenceCount <= 20, 'invalid N');
    check(Array.isArray(spec.attributeIds) && spec.attributeIds.length > 0 && spec.attributeIds.every(isId) &&
      new Set(spec.attributeIds).size === spec.attributeIds.length, 'invalid attribute IDs');
    const shared = Object.hasOwn(sharedPlanCosts, spec.id);
    const sharedCost = shared ? sharedPlanCosts[spec.id] : null;
    check(!shared || sharedCost === null || money(sharedCost), 'invalid shared planner cost');
    pairs.set(spec.id, { spec, shared, sharedCost });
  }
  check(Object.keys(sharedPlanCosts).every(id => pairs.has(id)), 'shared plan outside roster');
  for (const obs of observations) {
    const pair = pairs.get(obs?.caseId);
    check(pair, 'observation outside roster');
    validateArm(obs, pair.spec);
    check(!pair[obs.arm], 'duplicate observation for this revision, case and arm');
    check(!pair.shared || obs.planCostUsd == null, 'shared and per-arm planner costs would be double counted');
    pair[obs.arm] = obs;
  }
  const roster = [...pairs.values()];
  function strata(key) {
    const groups = new Map();
    for (const pair of roster) {
      const value = pair.spec[key];
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(pair);
    }
    return Object.fromEntries([...groups].map(([value, group]) => [value, summarizeGroup(group)]));
  }
  return { currency: 'USD', direction: 'with minus without', all: summarizeGroup(roster),
    bySplit: strata('split'), byReferenceCount: strata('referenceCount') };
}

const digest = hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);

/** Compare the inputs actually recorded at each image dispatch before interpreting a paired estimate. */
export function verifyPairedInputs(selection, optionalId, withSlots, withoutSlots) {
  check(Array.isArray(selection) && selection.length > 0 && selection.length <= 20, 'invalid frozen selection');
  const entries = new Map();
  for (const item of selection) {
    check(item && isId(item.id) && !entries.has(item.id) && digest(item.sha256) &&
      ['local-upload', 'generated', 'external'].includes(item.inputOrigin), 'invalid frozen reference');
    entries.set(item.id, item);
  }
  const optional = entries.get(optionalId);
  check(optional && optional.inputOrigin !== 'local-upload', 'ablation must name a selected optional reference');
  check(Array.isArray(withSlots) && Array.isArray(withoutSlots) && withSlots.length === 3 && withoutSlots.length === 3,
    'three positions are required in both arms');
  return POSITIONS.map(position => {
    const a = withSlots[position - 1], b = withoutSlots[position - 1];
    const result = (status, reason) => ({ position, status, reason });
    if (!a || !b || !Array.isArray(a.delivered) || !Array.isArray(b.delivered) ||
        ![a.promptSha256, b.promptSha256, a.settingsSha256, b.settingsSha256].every(digest))
      return result('unknown', 'missing-dispatch-evidence');
    if (a.promptSha256 !== b.promptSha256 || a.settingsSha256 !== b.settingsSha256)
      return result('mismatch', 'prompt-or-settings-changed');

    const orderedIds = [];
    for (const ref of a.delivered) {
      const entry = entries.get(ref?.id);
      if (!entry || entry.sha256 !== ref.sha256 || orderedIds.includes(ref.id))
        return result('mismatch', 'unauthorized-modified-or-duplicate-input');
      orderedIds.push(ref.id);
    }
    const expectedOrder = selection.filter(ref => ref.inputOrigin === 'local-upload' || orderedIds.includes(ref.id));
    if (expectedOrder.length !== orderedIds.length || expectedOrder.some((ref, n) => ref.id !== orderedIds[n]))
      return result('mismatch', 'required-input-missing-or-order-changed');
    const expectedWithout = a.delivered.filter(ref => ref.id !== optionalId);
    if (b.delivered.length !== expectedWithout.length ||
        expectedWithout.some((ref, n) => ref.id !== b.delivered[n]?.id || ref.sha256 !== b.delivered[n]?.sha256))
      return result('mismatch', 'other-input-changed');
    if (!orderedIds.includes(optionalId)) return result('no-contrast', 'planner-omitted-optional');
    return result('verified', 'only-optional-file-differs');
  });
}
