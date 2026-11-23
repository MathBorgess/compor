import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measureArtFocus } from './art-focus.mjs';

const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const line = (region, left, top, right, bottom) => ({ region, ...box(left, top, right, bottom) });

test('projeção cover conta apenas a face e o foco visíveis sob as linhas de texto', () => {
  const observation = {
    verdict: 'complete', faces: [box(0, 0.125, 0.0625, 0.375), box(0.125, 0.125, 0.5, 0.25)],
    focalPoints: [box(0.75, 0.125, 0.875, 0.25)],
  };
  const placement = {
    image: box(-100, 0, 1100, 1200), clip: box(100, 50, 850, 550),
    text: [line('headline', 50, 200, 240, 320), line('body', 825, 160, 950, 225)],
  };
  const result = measureArtFocus(observation, placement, 1);
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.metrics, {
    observedFaces: 2, observedFocalPoints: 1, visibleFaces: 1, visibleFocalPoints: 1,
    faceTextCollisions: 1, focalTextCollisions: 1, faceSeamCollisions: 0,
  });
  assert.deepEqual(result.findings, [
    { code: 'FACE_TEXT_COLLISION', targetIndex: 2, region: 'headline', box: box(100, 200, 240, 300) },
    { code: 'FOCAL_TEXT_COLLISION', targetIndex: 1, region: 'body', box: box(825, 160, 850, 225) },
  ]);
});

test('projeção contain usa o quadro da imagem e ignora letterbox e bordas sem área', () => {
  const observation = {
    verdict: 'complete', faces: [box(0, 0, 0.25, 0.25)],
    focalPoints: [box(0.75, 0.5, 1, 0.75)],
  };
  const placement = {
    image: box(150, 275, 750, 725), clip: box(88, 112, 992, 900),
    text: [line('headline', 90, 310, 150, 450), line('caption', 750, 498, 900, 670)],
  };
  const result = measureArtFocus(observation, placement, 3);
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.findings, []);
  assert.equal(result.metrics.visibleFaces, 1);
  assert.equal(result.metrics.visibleFocalPoints, 1);
  const empty = { ...placement, image: box(0, 0, 0, 0), clip: box(0, 0, 0, 0) };
  assert.equal(measureArtFocus(observation, empty, 3).metrics.visibleFaces, 0);
});

test('S1 e S2 vetam área de face na faixa de 48px da costura dentro do recorte', () => {
  const placement = { image: box(0, 0, 1080, 1350), clip: box(0, 0, 1080, 1350), text: [] };
  const faces = [box(0, 0.125, 0.0625, 0.25), box(0.9375, 0.125, 1, 0.25)];
  const observation = { verdict: 'complete', faces, focalPoints: [faces[0]] };
  const expected = ['FACE_S1_S2_SEAM'];
  const first = measureArtFocus(observation, placement, 1);
  const second = measureArtFocus(observation, placement, 2);
  assert.deepEqual(first.findings.map(finding => finding.code), expected);
  assert.deepEqual(second.findings.map(finding => finding.code), expected);
  assert.deepEqual(first.findings[0].box, box(1032, 168.75, 1080, 337.5));
  assert.deepEqual(second.findings[0].box, box(0, 168.75, 48, 337.5));
  assert.equal(measureArtFocus(observation, { ...placement, clip: box(48, 0, 1032, 1350) }, 1).status, 'pass');
  assert.equal(measureArtFocus(observation, { ...placement, clip: box(48, 0, 1032, 1350) }, 2).status, 'pass');
  assert.equal(measureArtFocus(observation, placement, 3).status, 'pass');
});

test('um parecer parcial mantém vetos observados e geometria ausente fica indisponível', () => {
  const observation = { verdict: 'unknown', faces: [box(0.25, 0.25, 0.5, 0.5)], focalPoints: [] };
  const placement = {
    image: box(0, 0, 400, 400), clip: box(0, 0, 400, 400), text: [line('body', 140, 145, 250, 190)],
  };
  assert.equal(measureArtFocus(observation, placement, 3).status, 'fail');
  assert.equal(measureArtFocus(observation, { ...placement, text: [] }, 3).status, 'unavailable');
  assert.equal(measureArtFocus({ ...observation, verdict: 'complete' }, undefined, 3).status, 'unavailable');
  assert.throws(() => measureArtFocus({ ...observation, faces: [box(0.1, 0, 1.05, 1)] }, placement, 3), /normalizado/);
  assert.throws(() => measureArtFocus(observation, { ...placement, clip: box(400, 0, 300, 200) }, 3), /Geometria inválida/);
});
