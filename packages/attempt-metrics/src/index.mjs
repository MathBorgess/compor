import { randomUUID } from 'node:crypto';

const pricingVersion = 'openai-public-2026-11-03';
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;

export function createAttempt({ kind, model, image, clock = () => performance.now() }) {
  if (!((kind === 'agent' && model === 'gpt-6-astra') || (kind === 'image' && model === 'gpt-image-2.5-flare')) || typeof clock !== 'function') throw new TypeError('invalid attempt configuration');
  if (kind === 'image' && (image?.size !== '1024x1024' || image?.quality !== 'low')) throw new TypeError('invalid image configuration');
  const startedAt = clock();
  if (!Number.isFinite(startedAt)) throw new TypeError('invalid clock');
  let record = { id: randomUUID(), kind, model, ...(kind === 'image' ? { image: { size: '1024x1024', quality: 'low' } } : {}), state: 'started', durationMs: null, usage: null, estimatedCost: null, infrastructureCost: null };
  function snapshot() { return structuredClone(record); }
  function complete(usage) {
    if (record.state !== 'started') throw new Error('attempt already finished');
    const endedAt = clock();
    if (!Number.isFinite(endedAt) || endedAt < startedAt) throw new Error('invalid clock');
    let estimate = null;
    let safeUsage = null;
    if (kind === 'agent' && usage && nonnegativeInteger(usage.inputTokens) && nonnegativeInteger(usage.cachedInputTokens) &&
        usage.cachedInputTokens <= usage.inputTokens && nonnegativeInteger(usage.outputTokens) && usage.cacheWriteTokens === 0 && usage.context === 'short' && usage.serviceTier === 'standard') {
      safeUsage = { inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens, cacheWriteTokens: 0, context: 'short', serviceTier: 'standard' };
      estimate = { amountUsd: ((usage.inputTokens - usage.cachedInputTokens) * 10 + usage.cachedInputTokens + usage.outputTokens * 50) / 1_000_000, pricingVersion, isFinalBill: false };
    }
    if (kind === 'image' && usage && nonnegativeInteger(usage.inputTextTokens) && nonnegativeInteger(usage.inputImageTokens) && usage.cachedInputTokens === 0 && nonnegativeInteger(usage.outputImageTokens) && usage.serviceTier === 'standard') {
      safeUsage = { inputTextTokens: usage.inputTextTokens, inputImageTokens: usage.inputImageTokens, cachedInputTokens: 0, outputImageTokens: usage.outputImageTokens, serviceTier: 'standard' };
      estimate = { amountUsd: (usage.inputTextTokens * 5 + usage.inputImageTokens * 8 + usage.outputImageTokens * 30) / 1_000_000, pricingVersion, isFinalBill: false };
    }
    record = { ...record, state: 'completed', durationMs: endedAt - startedAt, usage: safeUsage, estimatedCost: estimate };
    return snapshot();
  }
  function markUnknown() {
    if (record.state !== 'started') throw new Error('attempt already finished');
    const endedAt = clock();
    if (!Number.isFinite(endedAt) || endedAt < startedAt) throw new Error('invalid clock');
    record = { ...record, state: 'unknown', durationMs: endedAt - startedAt };
    return snapshot();
  }
  return Object.freeze({ snapshot, complete, markUnknown });
}
