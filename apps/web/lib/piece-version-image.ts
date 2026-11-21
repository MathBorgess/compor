import * as z from './schema.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const versionImageNamespace = 'c0a1e5e0-0000-4000-8000-000000000015';
const readSchema = z.object({assetId: z.nullable(z.string())});
const storedSchema = z.object({status: z.literal('stored'), assetId: z.string()});
const bindSchema = z.object({status: z.enum(['bound', 'conflict', 'not_found']), assetId: z.optional(z.string())});
export type VersionImagePublication = 'published' | 'conflict' | 'unknown';

const isUuid = (value: string) => uuidPattern.test(value);
function parseUuid(value: string) {
  const hex = value.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw Error('invalid id');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}
function formatUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable asset id for one saved version. A repeat addresses the same object. */
export async function versionImageAssetId(projectId: string, pieceId: string, version: number) {
  if (!isUuid(projectId) || !isUuid(pieceId) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) throw Error('invalid version image');
  const name = new TextEncoder().encode(`compor-piece-version-image/${projectId.toLowerCase()}/${pieceId.toLowerCase()}/${version}`);
  const data = new Uint8Array(16 + name.length);
  data.set(parseUuid(versionImageNamespace));
  data.set(name, 16);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const assetId = formatUuid(digest);
  if (!isUuid(assetId)) throw Error('invalid version image');
  return assetId;
}

async function readJson(response: Response) {
  try { return await response.json(); }
  catch { return null; }
}

export async function readVersionImage({projectId, pieceId, version, fetchImpl = fetch}: {projectId: string; pieceId: string; version: number; fetchImpl?: typeof fetch}) {
  if (!isUuid(projectId) || !isUuid(pieceId) || !Number.isSafeInteger(version) || version < 1) return null;
  try {
    const query = new URLSearchParams({projectId, pieceId, version: String(version)});
    const response = await fetchImpl(`/api/piece-version-images?${query}`, {cache: 'no-store', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    const parsed = readSchema.safeParse(await readJson(response));
    if (!parsed.success || parsed.data.assetId === null || !isUuid(parsed.data.assetId)) return null;
    return parsed.data.assetId.toLowerCase();
  } catch { return null; }
}

export async function bindVersionImage({projectId, pieceId, version, assetId, fetchImpl = fetch}: {projectId: string; pieceId: string; version: number; assetId: string; fetchImpl?: typeof fetch}) {
  if (!isUuid(projectId) || !isUuid(pieceId) || !isUuid(assetId) || !Number.isSafeInteger(version) || version < 1) return 'unknown' as const;
  try {
    const response = await fetchImpl('/api/piece-version-images', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({projectId, pieceId, version, assetId}),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const parsed = bindSchema.safeParse(await readJson(response));
    if (!response.ok || !parsed.success) return 'unknown' as const;
    if (parsed.data.status === 'bound' && parsed.data.assetId?.toLowerCase() === assetId.toLowerCase()) return 'published' as const;
    if (parsed.data.status === 'conflict' && parsed.data.assetId && isUuid(parsed.data.assetId)) return 'conflict' as const;
    return 'unknown' as const;
  } catch { return 'unknown' as const; }
}

/** Upload the version PNG once. A repeat of the same asset id does not replace bytes. */
export async function publishVersionPng({projectId, pieceId, version, png, fetchImpl = fetch}: {projectId: string; pieceId: string; version: number; png: Blob; fetchImpl?: typeof fetch}): Promise<VersionImagePublication> {
  if (png.type !== 'image/png' || png.size < 1 || png.size > 8 * 1024 * 1024) return 'unknown';
  const assetId = await versionImageAssetId(projectId, pieceId, version);
  let response: Response;
  try {
    const query = new URLSearchParams({projectId, pieceId, version: String(version), assetId});
    response = await fetchImpl(`/api/images?${query}`, {
      method: 'POST',
      headers: {'content-type': 'image/png'},
      body: png,
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
  } catch { return 'unknown'; }
  if (response.status === 409) {
    const body = z.object({error: z.optional(z.string())}).safeParse(await readJson(response));
    if (!body.success || body.data.error !== 'asset_exists') return 'unknown';
  } else if (response.status !== 201) return 'unknown';
  else {
    const stored = storedSchema.safeParse(await readJson(response));
    if (!stored.success || stored.data.assetId.toLowerCase() !== assetId) return 'unknown';
  }
  return bindVersionImage({projectId, pieceId, version, assetId, fetchImpl});
}
