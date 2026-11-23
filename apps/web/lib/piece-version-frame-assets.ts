import {sha256Hex} from './browser-bytes.ts';
import {versionImageIdForName} from './piece-version-image.ts';
import {fetchPrivateImage, PrivateImageNotFound} from './private-image-fetch.ts';
import {composeStudioPng} from './studio-compose.ts';
import type {PieceContent, PieceFrame} from './studio-domain.ts';
import {studioImageDimensions} from './studio-image.ts';

const MAX_SAVED_BYTES = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
type VersionAddress = {projectId: string; pieceId: string; version: number};
type FrameAddress = VersionAddress & {frameId: string; assetId: string; expectedSha256?: string};
type FrameImage = {address: FrameAddress; png: Blob} | {address: FrameAddress; jpeg: Blob};

function imageQuery({projectId, pieceId, version, assetId, expectedSha256}: FrameAddress) {
  const query = new URLSearchParams({projectId, pieceId, version: String(version), assetId});
  if (expectedSha256 !== undefined) query.set('format', 'jpeg');
  return query;
}

function validAddress({projectId, pieceId, version, frameId, expectedSha256}: Omit<FrameAddress, 'assetId'>) {
  return uuid.test(projectId) && uuid.test(pieceId) && uuid.test(frameId)
    && Number.isInteger(version) && version >= 1 && version <= 2147483647
    && (expectedSha256 === undefined || digest.test(expectedSha256));
}

/** The same slot and same bytes address one private object, even after a lost save response. */
export async function frameVersionAssetId(input: Omit<FrameAddress, 'assetId'>, file: Blob) {
  const {projectId, pieceId, version, frameId, expectedSha256} = input;
  const jpeg = expectedSha256 !== undefined;
  const mime = jpeg ? 'image/jpeg' : 'image/png';
  if (!validAddress(input) || file.type !== mime || !file.size || file.size > MAX_SAVED_BYTES) throw Error('invalid frame image');
  const hash = await sha256Hex(await file.arrayBuffer());
  if (jpeg && hash !== expectedSha256) throw Error('frame image changed');
  const namespace = jpeg ? 'compor-piece-version-carousel-jpeg' : 'compor-piece-version-frame';
  return versionImageIdForName(`${namespace}/${projectId.toLowerCase()}/${pieceId.toLowerCase()}/${version}/${frameId.toLowerCase()}/${hash}`);
}

export async function readSavedFrameImage(address: FrameAddress, fetchImpl = fetch): Promise<Blob | null> {
  if (!validAddress(address) || !uuid.test(address.assetId)) throw Error('invalid frame image');
  try {
    const file = await fetchPrivateImage(imageQuery(address), {fetch: fetchImpl, signal: AbortSignal.timeout(30000)});
    // Existing generated assets use UUIDv4. Saved content-bound assets use UUIDv5.
    if ((address.assetId[14] === '5' || address.expectedSha256 !== undefined)
        && await frameVersionAssetId(address, file) !== address.assetId.toLowerCase()) {
      throw Error('frame image changed');
    }
    return file;
  } catch (error) {
    if (error instanceof PrivateImageNotFound) return null;
    throw error;
  }
}

export async function publishSavedFrameImage(image: FrameImage, fetchImpl = fetch): Promise<Blob | null> {
  const {address} = image;
  const file = 'jpeg' in image ? image.jpeg : image.png;
  if (await frameVersionAssetId(address, file) !== address.assetId) return null;
  const result = await fetchImpl(`/api/images?${imageQuery(address)}`, {
    method: 'POST', headers: {'content-type': file.type}, body: file,
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
  const markers = content.carouselRender && new Map(content.carouselRender.frames.map(render => [render.frameId, render]));
  if (markers && (content.format !== 'carousel' || markers.size !== content.frames?.length)) {
    return {status: 'image_unsupported'} as const;
  }
  for (const frame of content.frames ?? []) {
    const file = await readFrame(frame);
    const marker = markers?.get(frame.id);
    if (markers && (!file || !marker)) return {status: 'image_unsupported'} as const;
    if (!file) {
      frames.push({...frame, assetId: null});
      continue;
    }
    const address = {...version, frameId: frame.id, ...(marker && {expectedSha256: marker.sha256})};
    let prepared = file, assetId: string;
    try {
      const {width, height} = await studioImageDimensions(file, {maxDimension: 2048, maxPixels: 2048 ** 2});
      if (marker && (width !== 1080 || height !== 1350)) return {status: 'image_unsupported'} as const;
      if (!marker) prepared = await composeStudioPng({base: file});
      assetId = await frameVersionAssetId(address, prepared);
    } catch {
      return {status: 'image_unsupported'} as const;
    }
    frames.push({...frame, assetId});
    const savedAddress = {...address, assetId};
    images.push(marker ? {address: savedAddress, jpeg: prepared} : {address: savedAddress, png: prepared});
  }
  return {status: 'ready', content: {...content, frames}, images} as const;
}
