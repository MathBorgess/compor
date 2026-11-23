import {sha256Hex} from './browser-bytes.ts';
import {versionImageIdForName} from './piece-version-image.ts';
import {fetchPrivateImage, PrivateImageNotFound} from './private-image-fetch.ts';
import {composeStudioPng} from './studio-compose.ts';
import type {PieceContent, PieceFrame} from './studio-domain.ts';
import {studioImageDimensions} from './studio-image.ts';

const MAX_SAVED_BYTES = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type VersionAddress = {projectId: string; pieceId: string; version: number};
type FrameAddress = VersionAddress & {frameId: string; assetId: string};
type FrameImage = {address: FrameAddress; png: Blob};

function imageQuery({projectId, pieceId, version, assetId}: FrameAddress) {
  return new URLSearchParams({projectId, pieceId, version: String(version), assetId});
}

function validAddress({projectId, pieceId, version, frameId}: Omit<FrameAddress, 'assetId'>) {
  return uuid.test(projectId) && uuid.test(pieceId) && uuid.test(frameId)
    && Number.isInteger(version) && version >= 1 && version <= 2147483647;
}

/** The same slot and same bytes address one private object, even after a lost save response. */
export async function frameVersionAssetId(input: Omit<FrameAddress, 'assetId'>, png: Blob) {
  if (!validAddress(input) || png.type !== 'image/png' || !png.size || png.size > MAX_SAVED_BYTES) throw Error('invalid frame image');
  const {projectId, pieceId, version, frameId} = input;
  const hash = await sha256Hex(await png.arrayBuffer());
  return versionImageIdForName(`compor-piece-version-frame/${projectId.toLowerCase()}/${pieceId.toLowerCase()}/${version}/${frameId.toLowerCase()}/${hash}`);
}

export async function readSavedFrameImage(address: FrameAddress, fetchImpl = fetch): Promise<Blob | null> {
  if (!validAddress(address) || !uuid.test(address.assetId)) throw Error('invalid frame image');
  try {
    const png = await fetchPrivateImage(imageQuery(address), {fetch: fetchImpl, signal: AbortSignal.timeout(30000)});
    // Existing generated assets use UUIDv4. Saved content-bound assets use UUIDv5.
    if (address.assetId[14] === '5' && await frameVersionAssetId(address, png) !== address.assetId.toLowerCase()) {
      throw Error('frame image changed');
    }
    return png;
  } catch (error) {
    if (error instanceof PrivateImageNotFound) return null;
    throw error;
  }
}

export async function publishSavedFrameImage({address, png}: FrameImage, fetchImpl = fetch): Promise<Blob | null> {
  if (await frameVersionAssetId(address, png) !== address.assetId) return null;
  const result = await fetchImpl(`/api/images?${imageQuery(address)}`, {
    method: 'POST', headers: {'content-type': 'image/png'}, body: png,
    cache: 'no-store', signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  // The committed object is the evidence. The receipt can be lost or replaced by a collision.
  if (result && ![201, 409, 502, 503, 504].includes(result.status)) return null;
  return await readSavedFrameImage(address, fetchImpl).catch(() => null);
}

export async function prepareSavedFrameImages({version, content, readFrame}: {
  version: VersionAddress;
  content: PieceContent;
  readFrame: (frame: PieceFrame) => Promise<Blob | null>;
}) {
  const images: FrameImage[] = [];
  const frames = [];
  for (const frame of content.frames ?? []) {
    const file = await readFrame(frame);
    if (!file) {
      frames.push({...frame, assetId: null});
      continue;
    }
    let png: Blob, assetId: string;
    const address = {...version, frameId: frame.id};
    try {
      await studioImageDimensions(file, {maxDimension: 2048, maxPixels: 2048 ** 2});
      png = await composeStudioPng({base: file});
      assetId = await frameVersionAssetId(address, png);
    } catch {
      return {status: 'image_unsupported'} as const;
    }
    frames.push({...frame, assetId});
    images.push({address: {...address, assetId}, png});
  }
  return {status: 'ready', content: {...content, frames}, images} as const;
}
