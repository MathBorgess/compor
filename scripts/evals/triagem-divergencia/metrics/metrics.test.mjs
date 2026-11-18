import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateImageCost, summarizeAblation, verifyPairedInputs } from './index.mjs';

const rateCard = { model: 'fixture-image', currency: 'USD', version: 'fixture-only',
  endpoint: 'images', tier: 'standard', usdPerMillion: { inputText: 2, inputImage: 5, outputImage: 9 } };
const usage = { input_tokens: 10, output_tokens: 4, total_tokens: 14,
  input_tokens_details: { text_tokens: 6, image_tokens: 4 }, output_tokens_details: { image_tokens: 4 } };
const cas = (id, n = 2, attrs = ['texture']) => ({ id, split: n > 2 ? 'reserved' : 'development', referenceCount: n, attributeIds: attrs });
const slot = (score, usable = true, imageCostUsd = 0.1) => ({ state: 'complete', usable, imageCostUsd, fidelity: { texture: score } });
const record = (caseId, arm, slots, planCostUsd = 0.3) => ({ caseId, arm, slots, planCostUsd });
const triple = x => [x, x, x];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, [a, b].join(' vs '));

test('estimate uses reconciled text/image counts and a matching direct standard model/rate card', () => {
  close(estimateImageCost(usage, rateCard, 'fixture-image'), 0.000068);
  for (const invalid of [null, {}, { ...usage, input_tokens: 20 }, { ...usage, total_tokens: 8 },
    { ...usage, output_tokens_details: {} }, { ...usage, input_tokens_details: { text_tokens: 6, image_tokens: 4, cached_tokens: 2 } }])
    assert.equal(estimateImageCost(invalid, rateCard, 'fixture-image'), null);
  assert.equal(estimateImageCost(usage, rateCard, 'different-model'), null);
  assert.equal(estimateImageCost(usage, { ...rateCard, tier: 'batch' }, 'fixture-image'), null);
});

test('costs include failures and unused outputs and distinguish image-only from end-to-end cost', () => {
  const failed = { state: 'failed', imageCostUsd: 0.2 };
  const unsent = { state: 'not-submitted' };
  const records = [ record('c', 'with', [slot(2, true, 0.3), failed, unsent], 0.1),
    record('c', 'without', [slot(1), slot(0, false), slot(1, true)], null) ];
  const { arms, paired } = summarizeAblation([cas('c')], records).all;
  close(arms.with.imageUsdPerUsable, 0.5);
  close(arms.with.totalUsdPerUsable, 0.6);
  close(arms.without.imageUsdPerUsable, 0.15);
  assert.equal(arms.without.totalUsdPerUsable, null);
  close(paired.imageUsdPerUsableDelta, 0.35);
  assert.equal(paired.totalUsdPerUsableDelta, null);
  assert.equal(paired.cases[0].matchedAttributeSlots, 1);
  assert.equal(paired.fullCohortMacroDeltaPoints, null);
});

test('missing arms, pending receipts, unknown costs and judge abstentions remain unknown', () => {
  const specs = [cas('c'), cas('d', 4)];
  const obs = [record('c', 'with', [slot(2), slot(null, null, 0.3), {state:'unknown', imageCostUsd: null}]),
    record('c', 'without', triple(slot(1)))];
  const { all, byReferenceCount, bySplit } = summarizeAblation(specs, obs);
  assert.equal(all.arms.with.plannedSlots, 6);
  assert.equal(all.arms.with.unknown, 4);
  assert.equal(all.arms.with.unknownUsability, 5);
  assert.equal(all.arms.with.imageUsdPerUsable, null);
  assert.equal(all.arms.without.imageUsdPerUsable, null);
  close(all.arms.with.knownImageSubtotalUsd, 0.4);
  assert.equal(all.paired.cases[0].observedMeanDeltaPoints, 1);
  assert.equal(all.paired.cases[1].observedMeanDeltaPoints, null);
  assert.deepEqual(byReferenceCount[4].caseIds, ['d']);
  assert.deepEqual(bySplit.reserved.caseIds, ['d']);
});

test('when every observed output is unusable the total is retained and the cost per usable stays undefined', () => {
  const { arms } = summarizeAblation([cas('c')], [
    record('c', 'with', triple(slot(1, false, 0.4))) ]).all;
  close(arms.with.imageCostUsd, 1.2);
  assert.equal(arms.with.imageUsdPerUsable, null);
});

test('shared planner cost is accounted once and is not duplicated along with per-arm costs', () => {
  const rows = ['with', 'without'].map(arm => record('c', arm, triple(slot(1)), null));
  const { arms } = summarizeAblation([cas('c')], rows, {c: 0.4}).all;
  close(arms.with.knownPlanSubtotalUsd + arms.without.knownPlanSubtotalUsd, 0.4);
  close(arms.with.totalUsdPerUsable, 0.5 / 3);
  assert.throws(() => summarizeAblation([cas('c')], [{ ...rows[0], planCostUsd: 0.1 }], {c:0.4}), /double counted/);
});

test('paired case macro gives equal weight to a case with one attribute and one with many', () => {
  const specs = [cas('a'), cas('b', 3, ['texture', 'placement', 'palette'])];
  const make = (id, arm, scores) => record(id, arm, triple({state:'complete', usable:true, imageCostUsd:0.2, fidelity:scores}));
  const observations = [make('a', 'with', {texture:2}), make('a','without',{texture:0}),
    make('b','with',{texture:0,placement:0,palette:0}), make('b','without',{texture:2,placement:2,palette:2})];
  assert.equal(summarizeAblation(specs, observations).all.paired.fullCohortMacroDeltaPoints, 0);
});

test('duplicate cases or arms, unplanned attributes and scores on missing pixels are rejected', () => {
  const one = cas('c'), arm = record('c', 'with', triple(slot(1)));
  assert.throws(() => summarizeAblation([one, one], []), /duplicate case/);
  assert.throws(() => summarizeAblation([one], [arm, arm]), /duplicate observation/);
  assert.throws(() => summarizeAblation([one], [{...arm, slots:triple({...slot(1), fidelity:{other:2}})}]), /unknown attribute/);
  assert.throws(() => summarizeAblation([one], [{...arm, slots:triple({state:'failed',fidelity:{texture:1}})}]), /observed pixels/);
});

const ref = (id, inputOrigin, digit) => ({id, inputOrigin, sha256: digit.repeat(64)});
const mandatory = ref('upload', 'local-upload', 'a'), optional = ref('alt', 'external', 'b');
const selection = [mandatory, optional];
const dispatch = delivered => ({promptSha256: 'c'.repeat(64), settingsSha256: 'd'.repeat(64), delivered});

test('equal prompts and options, same order, bytes and uploads verify the intervention', () => {
  const pair = verifyPairedInputs(selection, 'alt', triple(dispatch(selection)), triple(dispatch([mandatory])));
  assert.deepEqual(pair.map(p => p.status), triple('verified'));
  assert.throws(() => verifyPairedInputs(selection, 'upload', [], []), /optional reference/);
});

test('allows verified and unverified slots in a single case without inventing a pixel comparison', () => {
  const withSlots = [dispatch(selection), dispatch([mandatory]), null];
  const result = verifyPairedInputs(selection, 'alt', withSlots, triple(dispatch([mandatory])));
  assert.deepEqual(result.map(p => p.status), ['verified', 'no-contrast', 'unknown']);
  for (const bad of [dispatch([optional]), dispatch([{ ...mandatory, sha256:'e'.repeat(64) }]), dispatch([]),
    { ...dispatch([mandatory]), promptSha256:'e'.repeat(64) }, { ...dispatch([mandatory]), settingsSha256:'e'.repeat(64) }])
    assert.equal(verifyPairedInputs(selection, 'alt', triple(dispatch(selection)), triple(bad))[0].status, 'mismatch');
  assert.equal(verifyPairedInputs(selection,'alt',triple(dispatch([optional])),triple(dispatch([])))[0].status, 'mismatch');
  assert.equal(verifyPairedInputs(selection,'alt',triple(dispatch([optional,mandatory])),triple(dispatch([mandatory])))[0].status, 'mismatch');
});
