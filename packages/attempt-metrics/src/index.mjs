import { randomUUID } from 'node:crypto';

const pricingVersion = 'openai-public-2026-11-03';
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;

export function createAttempt({ kind, model, image, clock = () => performance.now() }) {
  if (!((kind === 'agent' && model === 'gpt-6-astra') || (kind === 'image' && model === 'gpt-image-2.5-flare')) || typeof clock !== 'function') throw new TypeError('invalid attempt configuration');
  if (kind === 'image' && (image?.size !== '1024x1024' || !['auto', 'low'].includes(image?.quality))) throw new TypeError('invalid image configuration');
  const startedAt = clock();
  if (!Number.isFinite(startedAt)) throw new TypeError('invalid clock');
  let record = { id: randomUUID(), kind, model, ...(kind === 'image' ? { image: { size: '1024x1024', quality: image.quality } } : {}), state: 'started', durationMs: null, usage: null, estimatedCost: null, infrastructureCost: null };
  function snapshot() { return structuredClone(record); }
  function complete(usage) {
    if (record.state !== 'started') throw new Error('attempt already finished');
    const endedAt = clock();
    if (!Number.isFinite(endedAt) || endedAt < startedAt) throw new Error('invalid clock');
    let estimate = null;
    let safeUsage = null;
    if (kind === 'agent' && usage && typeof usage === 'object') {
      const inputTokens = nonnegativeInteger(usage.inputTokens) ? usage.inputTokens : null;
      const outputTokens = nonnegativeInteger(usage.outputTokens) ? usage.outputTokens : null;
      const cachedInputTokens = nonnegativeInteger(usage.cachedInputTokens) && (inputTokens === null || usage.cachedInputTokens <= inputTokens) ? usage.cachedInputTokens : null;
      const cacheWriteTokens = nonnegativeInteger(usage.cacheWriteTokens) ? usage.cacheWriteTokens : null;
      const context = ['short', 'long'].includes(usage.context) ? usage.context : null;
      const serviceTier = ['standard', 'flex', 'batch', 'fast', 'ultrafast'].includes(usage.serviceTier) ? usage.serviceTier : null;
      if ([inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens].some(value => value !== null)) {
        safeUsage = { inputTokens, cachedInputTokens, outputTokens, cacheWriteTokens, context, serviceTier };
      }
      if (inputTokens !== null && inputTokens <= 272_000 && cachedInputTokens !== null && outputTokens !== null && cacheWriteTokens === 0 && context === 'short' && serviceTier === 'standard') {
        estimate = { amountUsd: ((inputTokens - cachedInputTokens) * 10 + cachedInputTokens + outputTokens * 50) / 1_000_000, pricingVersion, isFinalBill: false };
      }
    }
    if (kind === 'image' && usage && typeof usage === 'object') {
      const inputTextTokens = nonnegativeInteger(usage.inputTextTokens) ? usage.inputTextTokens : null;
      const inputImageTokens = nonnegativeInteger(usage.inputImageTokens) ? usage.inputImageTokens : null;
      const cachedInputTokens = nonnegativeInteger(usage.cachedInputTokens) && (inputTextTokens === null || inputImageTokens === null || usage.cachedInputTokens <= inputTextTokens + inputImageTokens) ? usage.cachedInputTokens : null;
      const outputImageTokens = nonnegativeInteger(usage.outputImageTokens) ? usage.outputImageTokens : null;
      const serviceTier = ['standard', 'batch'].includes(usage.serviceTier) ? usage.serviceTier : null;
      if ([inputTextTokens, inputImageTokens, cachedInputTokens, outputImageTokens].some(value => value !== null)) {
        safeUsage = { inputTextTokens, inputImageTokens, cachedInputTokens, outputImageTokens, serviceTier };
      }
      if (inputTextTokens !== null && inputImageTokens !== null && cachedInputTokens === 0 && outputImageTokens !== null && serviceTier === 'standard') {
        estimate = { amountUsd: (inputTextTokens * 5 + inputImageTokens * 8 + outputImageTokens * 30) / 1_000_000, pricingVersion, isFinalBill: false };
      }
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
