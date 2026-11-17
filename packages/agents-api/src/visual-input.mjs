import {createHash} from 'node:crypto';
import {parseVisualInputManifest,validateVisualReferenceSelection,MAX_VISUAL_IMAGE_BYTES,MAX_VISUAL_DIMENSION,MAX_VISUAL_PIXELS} from './visual-input-contract.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');

function rotatedExif(bytes) {
  try {
    if (bytes.length < 8 || bytes.length > 256 * 1024) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), little = bytes[0] === 73 && bytes[1] === 73;
    if ((!little && !(bytes[0] === 77 && bytes[1] === 77)) || view.getUint16(2, little) !== 42) return false;
    const start = view.getUint32(4, little);
    if (start < 8 || start > bytes.length - 2) return false;
    const count = view.getUint16(start, little), end = start + 2 + count * 12;
    if (count > 4096 || end > bytes.length - 4) return false;
    let orientation = null;
    for (let offset = start + 2; offset < end; offset += 12) {
      if (view.getUint16(offset, little) !== 0x0112) continue;
      if (orientation !== null || view.getUint16(offset + 2, little) !== 3 || view.getUint32(offset + 4, little) !== 1) return false;
      orientation = view.getUint16(offset + 8, little);
    }
    return orientation !== null && orientation >= 5 && orientation <= 8;
  } catch { return false; }
}
function pngDimensions(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('invalid_visual_image');
  let offset = 8, width, height, idat = false, rotated = false;
  for (let count = 0; count < 4096 && offset <= bytes.length - 12; count++) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (length > bytes.length - offset - 12) throw Error('invalid_visual_image');
    if (count === 0) {
      if (type !== 'IHDR' || length !== 13) throw Error('invalid_visual_image');
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      const depths = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if (!depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) throw Error('invalid_visual_image');
    } else if (type === 'IHDR') throw Error('invalid_visual_image');
    if (type === 'IDAT') idat ||= length > 0;
    if (type === 'eXIf') rotated = rotatedExif(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length || !idat) throw Error('invalid_visual_image');
      return {width, height, rotated};
    }
  }
  throw Error('invalid_visual_image');
}
function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) throw Error('invalid_visual_image');
  let offset = 2, width, height, rotated = false;
  for (let count = 0; count < 4096 && offset + 4 <= bytes.length; count++) {
    if (bytes[offset++] !== 255) throw Error('invalid_visual_image');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || offset + 2 > bytes.length) break;
    if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw Error('invalid_visual_image');
    if (marker === 0xe1 && length >= 8 && bytes.subarray(offset + 2, offset + 8).equals(Buffer.from([69,120,105,102,0,0]))) rotated = rotatedExif(bytes.subarray(offset + 8, offset + length));
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      if (width !== undefined || length < 8 || bytes[offset + 2] !== 8) throw Error('invalid_visual_image');
      height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5);
    }
    if (marker === 0xda && width !== undefined) return {width, height, rotated};
    offset += length;
  }
  throw Error('invalid_visual_image');
}
/** Bounded structure/header validation, not a full pixel decode. The browser
 * additionally decodes uploads; no header assertion guarantees visual quality. */
function dimensionsMatch(bytes, expected) {
  const actual = expected.mime === 'image/png' ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (![actual.width, actual.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= MAX_VISUAL_DIMENSION) || actual.width * actual.height > MAX_VISUAL_PIXELS) return false;
  return actual.width === expected.width && actual.height === expected.height || actual.rotated && actual.width === expected.height && actual.height === expected.width;
}
export function visualInputDigest(value) {
  const manifest = parseVisualInputManifest(value);
  return hash(`compor-visual-input-v${manifest.version}\0${JSON.stringify(manifest)}`);
}
/** Validates the whole ordered transport, never a subset. Original hashes are
 * declarations when only transformed bytes are supplied, not proven ancestry. */
export function parseVisualInput(manifest, images) {
  const visualInput = parseVisualInputManifest(manifest);
  return parseSelectedVisualInput(visualInput, images, visualInput.entries.map(entry => entry.id));
}
/** Only call after verifying the plan/action proof binding referenceIds to this
 * manifest and request. This function validates content, not authorization. */
export function parseSelectedVisualInput(manifest, images, referenceIds) {
  const visualInput = parseVisualInputManifest(manifest);
  if (!validateVisualReferenceSelection(visualInput, referenceIds)) throw Error('invalid_visual_selection');
  const entries = visualInput.entries.filter(entry => referenceIds.includes(entry.id));
  if (!Array.isArray(images) || images.length !== entries.length) throw Error('invalid_visual_images');
  let size = 0;
  const referenceImages = images.map((image, index) => {
    const entry = entries[index];
    if (!exact(image, ['id', 'mime', 'data']) || image.id !== entry.id || image.mime !== entry.transport.mime || typeof image.data !== 'string' || image.data.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw Error('invalid_visual_image');
    const bytes = Buffer.from(image.data, 'base64'); size += bytes.length;
    if (bytes.toString('base64') !== image.data || bytes.length !== entry.transport.byteLength || size > MAX_VISUAL_IMAGE_BYTES || hash(bytes) !== entry.transport.sha256 || !dimensionsMatch(bytes, entry.transport)) throw Error('visual_images_changed');
    return Object.freeze({id:image.id, mime:image.mime, data:image.data});
  });
  return Object.freeze({visualInput, referenceImages:Object.freeze(referenceImages)});
}
