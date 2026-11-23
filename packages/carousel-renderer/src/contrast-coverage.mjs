import { cssRgbLuminance, luminance, ratio } from './color.mjs';

const red = Float64Array.from({ length: 256 }, (_, byte) => luminance([byte, 0, 0]));
const green = Float64Array.from({ length: 256 }, (_, byte) => luminance([0, byte, 0]));
const blue = Float64Array.from({ length: 256 }, (_, byte) => luminance([0, 0, byte]));

function measureFragment(data, { width, height, channels }, box) {
  const foreground = cssRgbLuminance(box.color);
  if (!Number.isFinite(foreground)) return { minimum: null, passingPixels: 0, sampledPixels: 0 };

  // Count pixels whose centers lie inside the CSS text rectangle.
  const left = Math.max(0, Math.ceil(box.left - 0.5));
  const right = Math.min(width, Math.ceil(box.right - 0.5));
  const top = Math.max(0, Math.ceil(box.top - 0.5));
  const bottom = Math.min(height, Math.ceil(box.bottom - 0.5));
  let minimum = Infinity;
  let passingPixels = 0;
  let sampledPixels = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const offset = (y * width + x) * channels;
      const background = red[data[offset]] + green[data[offset + 1]] + blue[data[offset + 2]];
      const contrast = ratio(foreground, background);
      minimum = Math.min(minimum, contrast);
      if (contrast >= box.minimum) passingPixels++;
      sampledPixels++;
    }
  }
  return { minimum: Number.isFinite(minimum) ? minimum : null, passingPixels, sampledPixels };
}

export function reviewTextContrast({ data, info }, regions) {
  const failures = [];
  for (const region of regions) {
    for (const box of region.snippets) {
      const result = measureFragment(data, info, box);
      if (!result.sampledPixels || result.passingPixels * 10 < result.sampledPixels * 9) {
        failures.push({ region: region.name, requiredRatio: box.minimum, ...result });
      }
    }
  }
  return { failures, requiredCoverage: 0.9, samplingStep: 1, method: 'solid foreground against text-hidden line fragment' };
}
