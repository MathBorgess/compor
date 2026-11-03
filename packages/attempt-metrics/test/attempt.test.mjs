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

test('uso e estimativa de imagem são separados dos de agente', () => {
  const attempt = createAttempt({ kind: 'image', model: 'gpt-image-1', image: { size: '1024x1024', quality: 'low' }, clock: () => 5 });
  const result = attempt.complete({ inputTextTokens: 100, inputImageTokens: 0, cachedInputTokens: 0, outputImageTokens: 275, serviceTier: 'standard' });
  assert.equal(result.kind, 'image');
  assert.deepEqual(result.image, { size: '1024x1024', quality: 'low' });
  assert.deepEqual(result.estimatedCost, { amountUsd: 0.0115, pricingVersion: 'openai-public-2026-11-03', isFinalBill: false });
  assert.deepEqual(result.usage, { inputTextTokens: 100, inputImageTokens: 0, cachedInputTokens: 0, outputImageTokens: 275, serviceTier: 'standard' });
});

test('uso incompleto permanece desconhecido e conteúdo adicional não é armazenado', () => {
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => 0, apiKey: 'sk-secret', prompt: 'conteúdo confidencial' });
  const result = attempt.complete({ inputTokens: 100, outputTokens: 10, prompt: 'conteúdo confidencial', apiKey: 'sk-secret' });
  assert.equal(result.state, 'completed');
  assert.equal(result.usage, null);
  assert.equal(result.estimatedCost, null);
  assert.equal(result.infrastructureCost, null);
  assert.doesNotMatch(JSON.stringify(result), /sk-secret|conteúdo confidencial/);
});

test('observações não podem ser alteradas pelo chamador nem finalizadas duas vezes', () => {
  const attempt = createAttempt({ kind: 'agent', model: 'gpt-6-astra', clock: () => 0 });
  const result = attempt.complete();
  result.state = 'started';
  assert.equal(attempt.snapshot().state, 'completed');
  assert.throws(() => attempt.markUnknown(), /already finished/);
});
