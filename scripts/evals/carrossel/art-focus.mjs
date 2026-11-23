import { requireCondition } from './protocol.mjs';
import { readRasterReview, validNormalizedBox } from './raster-review.mjs';

const reviewType = { scope: 'raster-focus', prefix: 'art-focus', subject: 'face e foco da arte' };
const canvas = { left: 0, top: 0, right: 1080, bottom: 1350 };
const seam = {
  1: { ...canvas, left: 1032 },
  2: { ...canvas, right: 48 },
};

function validPixelBox(box, allowEmpty = false) {
  if (!box || ![box.left, box.top, box.right, box.bottom].every(Number.isFinite)) return false;
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  return Number.isFinite(width) && Number.isFinite(height)
    && (allowEmpty ? width >= 0 && height >= 0 : width > 0 && height > 0);
}

function intersection(first, second) {
  if (!first || !second) return null;
  const box = {
    left: Math.max(first.left, second.left), top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right), bottom: Math.min(first.bottom, second.bottom),
  };
  return box.left < box.right && box.top < box.bottom ? box : null;
}

function project(box, image) {
  const width = image.right - image.left;
  const height = image.bottom - image.top;
  return {
    left: image.left + box.left * width, top: image.top + box.top * height,
    right: image.left + box.right * width, bottom: image.top + box.bottom * height,
  };
}

export function measureArtFocus(observation, artPlacement, slideIndex) {
  const { verdict, faces, focalPoints } = observation;
  requireCondition(['complete', 'unknown'].includes(verdict)
    && [faces, focalPoints].every(boxes => Array.isArray(boxes) && boxes.every(validNormalizedBox)),
  'Observação de face ou foco precisa de veredito e caixas no plano normalizado do PNG incorporado.');
  const metrics = {
    observedFaces: faces.length, observedFocalPoints: focalPoints.length, visibleFaces: 0, visibleFocalPoints: 0,
    faceTextCollisions: 0, focalTextCollisions: 0, faceSeamCollisions: 0,
  };
  const findings = [];
  if (artPlacement == null) return { status: 'unavailable', reason: 'placement_unavailable', metrics, findings };
  const { image, clip, text } = artPlacement;
  requireCondition(validPixelBox(clip, true) && validPixelBox(image, true)
    && (validPixelBox(image) || !intersection(clip, canvas)) && Array.isArray(text)
    && text.every(line => validPixelBox(line) && typeof line.region === 'string' && line.region.trim() && line.region.length <= 80),
  'Geometria inválida no recibo de posicionamento do raster.');

  const visibleClip = intersection(clip, canvas);
  for (const group of [
    { boxes: faces, visible: 'visibleFaces', collisions: 'faceTextCollisions', code: 'FACE_TEXT_COLLISION', checkSeam: true },
    { boxes: focalPoints, visible: 'visibleFocalPoints', collisions: 'focalTextCollisions', code: 'FOCAL_TEXT_COLLISION' },
  ]) {
    for (const [index, box] of group.boxes.entries()) {
      const visible = intersection(project(box, image), visibleClip);
      if (!visible) continue;
      metrics[group.visible] += 1;
      for (const line of text) {
        const overlap = intersection(visible, line);
        if (!overlap) continue;
        metrics[group.collisions] += 1;
        findings.push({ code: group.code, targetIndex: index + 1, region: line.region, box: overlap });
      }
      const seamOverlap = group.checkSeam ? intersection(visible, seam[slideIndex]) : null;
      if (seamOverlap) {
        metrics.faceSeamCollisions += 1;
        findings.push({ code: 'FACE_S1_S2_SEAM', targetIndex: index + 1, box: seamOverlap });
      }
    }
  }
  const status = findings.length ? 'fail' : verdict === 'complete' ? 'pass' : 'unavailable';
  return { status, metrics, findings };
}

export async function verifyArtFocus(directory, reference, snapshot) {
  const { entries, ...trace } = await readRasterReview(directory, reference, snapshot, reviewType);
  if (!entries) return trace;
  const results = entries.map(({ tile, observation }) => ({
    slideIndex: tile.slideIndex, slideId: tile.slideId, row: tile.row, column: tile.column,
    verdict: observation.verdict,
    ...measureArtFocus(observation, tile.artPlacement, tile.slideIndex),
  }));
  const status = results.some(item => item.status === 'fail') ? 'fail'
    : results.every(item => item.status === 'pass') ? 'pass' : 'unavailable';
  return { ...trace, status, results };
}
