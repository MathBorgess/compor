import test from 'node:test';
import assert from 'node:assert/strict';
import { studioImagePipeline } from '../lib/studio-image-pipeline.ts';

test('o estúdio exige configuração explícita e chave dedicada para ativar a revisão', () => {
  const key = 'sk-test-review-0123456789012345';
  assert.equal(studioImagePipeline({}).qualityHoldEnabled, false);
  assert.equal(studioImagePipeline({ COMPOR_IMAGE_QUALITY_REVIEW: 'off', COMPOR_IMAGE_REVIEW_OPENAI_API_KEY: key }).qualityHoldEnabled, false);
  assert.equal(studioImagePipeline({ COMPOR_IMAGE_QUALITY_REVIEW: 'required' }), null);
  assert.equal(studioImagePipeline({ COMPOR_IMAGE_QUALITY_REVIEW: 'required', COMPOR_IMAGE_REVIEW_OPENAI_API_KEY: 'invalid' }), null);
  assert.equal(studioImagePipeline({ COMPOR_IMAGE_QUALITY_REVIEW: 'wrong', COMPOR_IMAGE_REVIEW_OPENAI_API_KEY: key }), null);
  const pipeline = studioImagePipeline({ COMPOR_IMAGE_QUALITY_REVIEW: 'required', COMPOR_IMAGE_REVIEW_OPENAI_API_KEY: key });
  assert.equal(pipeline.qualityHoldEnabled, true);
  assert.equal(typeof pipeline.createHandler(async () => null), 'function');
});
