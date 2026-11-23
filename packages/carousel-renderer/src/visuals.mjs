import { createHash } from 'node:crypto';

export function usesDarkSurface(slide) {
  return slide.layout === 'hero_bleed' || slide.polarity === 'inverted';
}

function difference(a, b) {
  return Array.from(a, (bit, index) => Number(bit !== b[index])).reduce((sum, bit) => sum + bit, 0);
}

async function perceptualHash(sharp, bytes) {
  const pixels = await sharp(bytes).flatten({ background: '#ffffff' }).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  const hash = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const offset = y * 9 + x;
      hash.push(pixels[offset] > pixels[offset + 1]);
    }
  }
  return hash;
}

export async function compareArtwork(sharp, rendered) {
  const artworks = await Promise.all(rendered.flatMap(({ result, sourceArt }) => sourceArt ? [
    (async () => ({
      index: result.index,
      digest: createHash('sha256').update(sourceArt).digest('hex'),
      perceptual: await perceptualHash(sharp, sourceArt),
    }))(),
  ] : []));
  const pairs = artworks.flatMap((a, index) => artworks.slice(index + 1).map(b => ({
    slides: [a.index, b.index],
    exact: a.digest === b.digest,
    hamming: difference(a.perceptual, b.perceptual),
  })));
  return {
    id: 'DUPLICATE_VISUAL',
    status: pairs.some(pair => pair.exact) ? 'fail' : 'pass',
    observed: { pairs, nearMatchDistance: 8, sampleCount: artworks.length },
  };
}
