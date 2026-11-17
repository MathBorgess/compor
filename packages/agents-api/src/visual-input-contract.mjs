/** Browser-safe metadata contract. A valid manifest is not proof of its bytes
 * or provenance; dispatch additionally requires server validation of every file. */
export const MAX_VISUAL_IMAGES = 20;
export const MAX_VISUAL_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_VISUAL_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_VISUAL_REQUEST_BYTES = 3 * 1024 * 1024;
export const MAX_VISUAL_DIMENSION = 16384;
export const MAX_VISUAL_PIXELS = 40_000_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;
const file = (value, max) => object(value) && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) && ['image/png', 'image/jpeg'].includes(value.mime) && integer(value.byteLength, max);
function entryValid(entry, index) {
  if (!exact(entry, ['id', 'ordinal', 'role', 'inputOrigin', 'original', 'transport', 'transformation']) || !uuid(entry.id) || entry.ordinal !== index + 1 || entry.role !== 'reference' || entry.inputOrigin !== 'local-upload' || !['none', 'optimized-v1'].includes(entry.transformation)) return false;
  const {original, transport} = entry;
  if (!exact(original, ['sha256', 'mime', 'byteLength']) || !file(original, MAX_VISUAL_SOURCE_BYTES) || !exact(transport, ['sha256', 'mime', 'byteLength', 'width', 'height']) || !file(transport, MAX_VISUAL_IMAGE_BYTES)) return false;
  if (!integer(transport.width, MAX_VISUAL_DIMENSION) || !integer(transport.height, MAX_VISUAL_DIMENSION) || transport.width * transport.height > MAX_VISUAL_PIXELS) return false;
  return entry.transformation !== 'none' || ['sha256', 'mime', 'byteLength'].every(key => original[key] === transport[key]);
}
export function validateVisualInputManifest(value) {
  if (!exact(value, ['version', 'policy', 'entries']) || value.version !== 1 || value.policy !== 'optimized-v1' || !Array.isArray(value.entries) || value.entries.length > MAX_VISUAL_IMAGES) return false;
  return value.entries.every(entryValid) && new Set(value.entries.map(entry => entry.id)).size === value.entries.length && value.entries.reduce((sum, entry) => sum + entry.transport.byteLength, 0) <= MAX_VISUAL_IMAGE_BYTES;
}
/** Canonical key ordering, copied and deeply frozen. Array ordering is semantic. */
export function parseVisualInputManifest(value) {
  if (!validateVisualInputManifest(value)) throw Error('invalid_visual_input');
  const entries = value.entries.map(entry => Object.freeze({id:entry.id, ordinal:entry.ordinal, role:entry.role, inputOrigin:entry.inputOrigin, original:Object.freeze({sha256:entry.original.sha256, mime:entry.original.mime, byteLength:entry.original.byteLength}), transport:Object.freeze({sha256:entry.transport.sha256, mime:entry.transport.mime, byteLength:entry.transport.byteLength, width:entry.transport.width, height:entry.transport.height}), transformation:entry.transformation}));
  return Object.freeze({version:1, policy:'optimized-v1', entries:Object.freeze(entries)});
}
