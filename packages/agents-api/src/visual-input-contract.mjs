/** Browser-safe metadata contract. A valid manifest is not proof of its bytes
 * or provenance; dispatch additionally requires server validation of every file. */
export const MAX_VISUAL_IMAGES = 20;
export const MAX_VISUAL_IMAGE_BYTES = 2 * 1024 * 1024;
// Agents input_image.image_url is capped at 1 MiB characters, including the
// longest data URL prefix (JPEG, 23 chars). Base64 consumes 4*ceil(bytes/3).
export const MAX_VISUAL_IMAGE_URL_CHARS = 1024 * 1024;
export const MAX_VISUAL_TRANSPORT_FILE_BYTES = 786414;
export const MAX_VISUAL_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_VISUAL_REQUEST_BYTES = 3 * 1024 * 1024;
export const MAX_VISUAL_DIMENSION = 16384;
export const MAX_VISUAL_PIXELS = 40_000_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const integer = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;
const file = (value, max) => object(value) && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) && ['image/png', 'image/jpeg'].includes(value.mime) && integer(value.byteLength, max);
function sourceValid(entry) {
  if (entry.inputOrigin === 'local-upload') return entry.source === null;
  if (entry.inputOrigin === 'generated') return exact(entry.source, ['projectId', 'imageId']) && uuid(entry.source.projectId) && uuid(entry.source.imageId);
  if (entry.inputOrigin !== 'external' || !exact(entry.source, ['originUrl', 'board'])) return false;
  return typeof entry.source.originUrl === 'string' && /^https:\/\/www\.pinterest\.com\/pin\/[A-Za-z0-9_-]{1,160}\/$/.test(entry.source.originUrl) && typeof entry.source.board === 'string' && entry.source.board.length <= 200 && /^[a-z0-9_-]+\/[a-z0-9_-]+$/.test(entry.source.board) && !/sk-[^\s]+/i.test(entry.source.originUrl + entry.source.board);
}
function entryValid(entry, index, version) {
  const keys = ['id', 'ordinal', 'role', 'inputOrigin', 'original', 'transport', 'transformation', ...(version === 2 ? ['source'] : [])];
  if (!exact(entry, keys) || !uuid(entry.id) || entry.ordinal !== index + 1 || entry.role !== 'reference' || !['none', 'optimized-v1'].includes(entry.transformation)) return false;
  if (version === 1 ? entry.inputOrigin !== 'local-upload' : !sourceValid(entry)) return false;
  const {original, transport} = entry;
  if (!exact(original, ['sha256', 'mime', 'byteLength']) || !file(original, MAX_VISUAL_SOURCE_BYTES) || !exact(transport, ['sha256', 'mime', 'byteLength', 'width', 'height']) || !file(transport, MAX_VISUAL_TRANSPORT_FILE_BYTES)) return false;
  if (!integer(transport.width, MAX_VISUAL_DIMENSION) || !integer(transport.height, MAX_VISUAL_DIMENSION) || transport.width * transport.height > MAX_VISUAL_PIXELS) return false;
  return entry.transformation !== 'none' || ['sha256', 'mime', 'byteLength'].every(key => original[key] === transport[key]);
}
export function validateVisualInputManifest(value) {
  if (!object(value) || ![1,2].includes(value.version) || !exact(value, ['version', 'policy', 'entries', ...(value.version === 2 ? ['externalConsent'] : [])]) || value.policy !== 'optimized-v1' || !Array.isArray(value.entries) || value.entries.length > MAX_VISUAL_IMAGES) return false;
  if (value.version === 2 && (typeof value.externalConsent !== 'boolean' || value.entries.some(entry => entry?.inputOrigin === 'external') && !value.externalConsent)) return false;
  return value.entries.every((entry,index) => entryValid(entry,index,value.version)) && new Set(value.entries.map(entry => entry.id)).size === value.entries.length && value.entries.reduce((sum, entry) => sum + entry.transport.byteLength, 0) <= MAX_VISUAL_IMAGE_BYTES;
}
/** Canonical key ordering, copied and deeply frozen. Array ordering is semantic. */
export function parseVisualInputManifest(value) {
  if (!validateVisualInputManifest(value)) throw Error('invalid_visual_input');
  const entries = value.entries.map(entry => {
    const source = value.version === 1 ? undefined : entry.inputOrigin === 'local-upload' ? null : Object.freeze(entry.inputOrigin === 'external' ? {originUrl:entry.source.originUrl,board:entry.source.board} : {projectId:entry.source.projectId,imageId:entry.source.imageId});
    return Object.freeze({id:entry.id, ordinal:entry.ordinal, role:entry.role, inputOrigin:entry.inputOrigin, original:Object.freeze({sha256:entry.original.sha256, mime:entry.original.mime, byteLength:entry.original.byteLength}), transport:Object.freeze({sha256:entry.transport.sha256, mime:entry.transport.mime, byteLength:entry.transport.byteLength, width:entry.transport.width, height:entry.transport.height}), transformation:entry.transformation,...(value.version === 1 ? {} : {source})});
  });
  return Object.freeze({version:value.version, policy:'optimized-v1', ...(value.version === 2 ? {externalConsent:value.externalConsent} : {}), entries:Object.freeze(entries)});
}
/** A triaged selection is an ordered subsequence, including every human upload.
 * Metadata records declarations; it does not grant ownership or prove a gesture. */
export function validateVisualReferenceSelection(manifest, referenceIds) {
  if (!validateVisualInputManifest(manifest) || !Array.isArray(referenceIds) || referenceIds.length > MAX_VISUAL_IMAGES || new Set(referenceIds).size !== referenceIds.length) return false;
  const selected = manifest.entries.filter(entry => referenceIds.includes(entry.id));
  return selected.length === referenceIds.length && selected.every((entry,index) => entry.id === referenceIds[index]) && manifest.entries.every(entry => entry.inputOrigin !== 'local-upload' || referenceIds.includes(entry.id));
}
export function visualInputMatchesProject(manifest, projectId) {
  return validateVisualInputManifest(manifest) && uuid(projectId) && manifest.entries.every(entry => entry.inputOrigin !== 'generated' || entry.source.projectId === projectId);
}
