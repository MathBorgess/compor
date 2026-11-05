import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt } from '../src/index.mjs';

test('uma tentativa de agente informa estado, duração e custo estimado com uso conhecido', () => {
  let now = 100;
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => now });
  const started = attempt.snapshot();
  assert.equal(started.state, 'started');
  assert.equal(started.usage, null);
  assert.equal(started.estimatedCost, null);
  now = 850;
  const finished = attempt.complete({ inputTokens: 1000, cachedInputTokens: 100, outputTokens: 200, cacheWriteTokens: 0, context: 'short', serviceTier: 'standard' });
  assert.equal(finished.state, 'completed');
  assert.equal(finished.durationMs, 750);
  assert.deepEqual(finished.usage, { inputTokens: 1000, cachedInputTokens: 100, outputTokens: 200, cacheWriteTokens: 0, context: 'short', serviceTier: 'standard' });
  assert.deepEqual(finished.estimatedCost, { amountUsd: 0.0191, pricingVersion: 'openai-public-2026-11-03', isFinalBill: false });
});

test('resultado desconhecido registra duração sem custo zero nem retry automático', () => {
  let now = 200;
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => now });
  now = 500;
  const result = attempt.markUnknown();
  assert.equal(result.state, 'unknown');
  assert.equal(result.durationMs, 300);
  assert.equal(result.usage, null);
  assert.equal(result.estimatedCost, null);
  assert.throws(() => attempt.complete(), /already finished/);
});

test('estimativa Astra de contexto curto para no limite oficial de 272 mil tokens de entrada', () => {
  const measure = inputTokens => createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => 0 }).complete({
    inputTokens, cachedInputTokens: 0, outputTokens: 10, cacheWriteTokens: 0, context: 'short', serviceTier: 'standard',
  });
  assert.equal(measure(272000).estimatedCost.amountUsd, 2.7205);
  const long = measure(272001);
  assert.equal(long.estimatedCost, null);
  assert.equal(long.usage.inputTokens, 272001);
});

test('uso e estimativa de imagem são separados dos de agente', () => {
  const attempt = createAttempt({ kind: 'image', model: 'gpt-image-2.5-flare', image: { size: '1024x1024', quality: 'auto' }, clock: () => 5 });
  const result = attempt.complete({ inputTextTokens: 100, inputImageTokens: 200, cachedInputTokens: 0, outputImageTokens: 275, serviceTier: 'standard' });
  assert.equal(result.kind, 'image');
  assert.deepEqual(result.image, { size: '1024x1024', quality: 'auto' });
  assert.deepEqual(result.estimatedCost, { amountUsd: 0.01035, pricingVersion: 'openai-public-2026-11-03', isFinalBill: false });
  assert.deepEqual(result.usage, { inputTextTokens: 100, inputImageTokens: 200, cachedInputTokens: 0, outputImageTokens: 275, serviceTier: 'standard' });
});

test('estimativa calcula o preço de uma imagem com uso conhecido, sem chamada paga', () => {
  const attempt = createAttempt({ kind: 'image', model: 'gpt-image-2.5-flare', image: { size: '1024x1024', quality: 'low' }, clock: () => 0 });
  assert.equal(attempt.complete({ inputTextTokens: 16, inputImageTokens: 0, cachedInputTokens: 0, outputImageTokens: 196, serviceTier: 'standard' }).estimatedCost.amountUsd, 0.00596);
});

test('uso parcial é preservado sem conteúdo adicional e custo permanece desconhecido', () => {
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => 0, apiKey: 'sk-secret', prompt: 'conteúdo confidencial' });
  const result = attempt.complete({ inputTokens: 100, outputTokens: 10, prompt: 'conteúdo confidencial', apiKey: 'sk-secret' });
  assert.equal(result.state, 'completed');
  assert.deepEqual(result.usage, { inputTokens: 100, cachedInputTokens: null, outputTokens: 10, cacheWriteTokens: null, context: null, serviceTier: null });
  assert.equal(result.estimatedCost, null);
  assert.equal(result.infrastructureCost, null);
  assert.doesNotMatch(JSON.stringify(result), /sk-secret|conteúdo confidencial/);
});

test('preserva contagens válidas de imagem mesmo sem dados suficientes para preço', () => {
  const attempt = createAttempt({ kind: 'image', model: 'gpt-image-2.5-flare', image: { size: '1024x1024', quality: 'auto' }, clock: () => 0 });
  const result = attempt.complete({ inputTextTokens: 16, outputImageTokens: 196, prompt: 'texto privado', serviceTier: 'not-a-tier' });
  assert.deepEqual(result.usage, { inputTextTokens: 16, inputImageTokens: null, cachedInputTokens: null, outputImageTokens: 196, serviceTier: null });
  assert.equal(result.estimatedCost, null);
  assert.doesNotMatch(JSON.stringify(result), /texto privado|not-a-tier/);
});

test('observações não podem ser alteradas pelo chamador nem finalizadas duas vezes', () => {
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => 0 });
  const result = attempt.complete();
  result.state = 'started';
  assert.equal(attempt.snapshot().state, 'completed');
  assert.throws(() => attempt.markUnknown(), /already finished/);
});


test('o modelo 2.6 tem estimativa própria e preserva suporte ao histórico 2.5', () => {
  for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.6-flare']) {
    const result = createAttempt({ kind: 'image', model, image: { size: '1024x1024', quality: 'auto' }, clock: () => 0 })
      .complete({ inputTextTokens: 16, inputImageTokens: 0, cachedInputTokens: 0, outputImageTokens: 196, serviceTier: 'standard' });
    assert.equal(result.model, model);
    assert.equal(result.estimatedCost.amountUsd, 0.00596);
    assert.equal(result.estimatedCost.pricingVersion, model === 'gpt-image-2.6-flare' ? 'openai-public-2026-11-04' : 'openai-public-2026-11-03');
  }
});
