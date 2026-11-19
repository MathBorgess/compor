import { promisify } from 'node:util';
import { inflate } from 'node:zlib';

export const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const inflateImageData = promisify(inflate);
const maxDimension = 2048; // Largest generated extent the private asset path accepts.
const maxBytes = 8 * 1024 * 1024;
const maxChunks = 4096;
const colorTypes = {
  0: { samples: 1, depths: [1, 2, 4, 8, 16] },
  2: { samples: 3, depths: [8, 16] },
  3: { samples: 1, depths: [1, 2, 4, 8] },
  4: { samples: 2, depths: [8, 16] },
  6: { samples: 4, depths: [8, 16] },
};
const adam7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
const standard = [[0, 0, 1, 1]];
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  for (let bit = 0; bit < 8; bit++) index = (index >>> 1) ^ ((index & 1) * 0xedb88320);
  return index;
});

function chunkCrc(bytes, start, end) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[offset]) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function readImageHeader(data) {
  if (data.length !== 13) return null;
  const width = data.readUInt32BE(0), height = data.readUInt32BE(4);
  const depth = data[8], color = data[9], interlace = data[12];
  const format = colorTypes[color];
  if (width < 1 || width > maxDimension || height < 1 || height > maxDimension
    || !format?.depths.includes(depth) || data[10] !== 0 || data[11] !== 0 || interlace > 1) return null;
  return { width, height, depth, color, interlace, bitsPerPixel: depth * format.samples };
}

function imageData(bytes) {
  if (bytes.length > maxBytes || !bytes.subarray(0, 8).equals(pngSignature)) return null;
  let offset = 8, header, hasPalette = false, endedImageData = false;
  const compressed = [];
  for (let count = 0; count < maxChunks && offset <= bytes.length - 12; count++) {
    const length = bytes.readUInt32BE(offset);
    const dataEnd = offset + 8 + length;
    if (dataEnd + 4 > bytes.length || chunkCrc(bytes, offset + 4, dataEnd) !== bytes.readUInt32BE(dataEnd)) return null;
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, dataEnd);
    offset = dataEnd + 4;
    if (count === 0) {
      if (type !== 'IHDR') return null;
      header = readImageHeader(data);
      if (!header) return null;
      continue;
    }
    if (type === 'IDAT') {
      if (endedImageData || (header.color === 3 && !hasPalette)) return null;
      compressed.push(data);
      continue;
    }
    endedImageData = compressed.length > 0;
    if (type === 'IEND') return length === 0 && offset === bytes.length && endedImageData ? { header, compressed } : null;
    if (type === 'PLTE') {
      const entries = length / 3;
      if (hasPalette || endedImageData || !Number.isInteger(entries) || entries < 1 || entries > 256
        || header.color === 0 || header.color === 4 || (header.color === 3 && entries > 2 ** header.depth)) return null;
      hasPalette = true;
    } else if (!/^[a-z][A-Za-z][A-Z][A-Za-z]$/.test(type) || ['acTL', 'fcTL', 'fdAT'].includes(type)) return null;
  }
  return null;
}

/** Check a still PNG container and its complete filtered image data before sharing or delivering it. */
export async function validGeneratedPng(bytes) {
  const image = imageData(bytes);
  if (!image) return false;
  const { width, height, bitsPerPixel, interlace } = image.header;
  const passes = (interlace ? adam7 : standard).filter(([x, y]) => width > x && height > y)
    .map(([x, y, stepX, stepY]) => ({
      stride: Math.ceil(Math.ceil((width - x) / stepX) * bitsPerPixel / 8) + 1,
      rows: Math.ceil((height - y) / stepY),
    }));
  const length = passes.reduce((total, { stride, rows }) => total + stride * rows, 0);
  let pixels;
  try { pixels = await inflateImageData(Buffer.concat(image.compressed), { maxOutputLength: length }); }
  catch { return false; }
  if (pixels.length !== length) return false;
  let offset = 0;
  for (const { stride, rows } of passes) {
    for (let row = 0; row < rows; row++, offset += stride) {
      if (pixels[offset] > 4) return false;
    }
  }
  return true;
}
