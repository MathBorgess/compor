import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewTextContrast } from '../src/contrast-coverage.mjs';

function bitmap(shades) {
  return {
    data: Uint8Array.from(shades.flatMap(shade => [shade, shade, shade])),
    info: { width: shades.length, height: 1, channels: 3 },
  };
}

const fragment = (left, right, color = 'rgb(0, 0, 0)', minimum = 4.5) =>
  ({ left, right, top: 0, bottom: 1, color, minimum });

test('WCAG gate observes every covered pixel and admits exactly 10% under contrast', () => {
  const text = [{ name: 'headline', snippets: [fragment(0, 20)] }];
  const bright = Array(20).fill(255);
  bright.fill(0, 5, 7);
  assert.deepEqual(reviewTextContrast(bitmap(bright), text).failures, []);
  bright[7] = 0;
  assert.deepEqual(reviewTextContrast(bitmap(bright), text).failures, [{
    region: 'headline', requiredRatio: 4.5, minimum: 1, sampledPixels: 20, passingPixels: 17,
  }]);
});

test('measures each foreground color independently and uses the fragment threshold', () => {
  const grey = bitmap(Array(40).fill(100));
  const text = [{ name: 'headline', snippets: [fragment(0, 36, 'rgb(255, 255, 255)'), fragment(36, 40)] }];
  const review = reviewTextContrast(grey, text);
  assert.equal(review.samplingStep, 1);
  assert.equal(review.failures.length, 1);
  assert.equal(review.failures[0].passingPixels, 0);
  assert.equal(review.failures[0].sampledPixels, 4);
  text[0].snippets[1].minimum = 3;
  assert.deepEqual(reviewTextContrast(grey, text).failures, []);
});
