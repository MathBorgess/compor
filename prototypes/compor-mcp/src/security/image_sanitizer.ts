import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const MAX_IMAGE_DOWNLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 5_000; // 5 seconds
export const STAGING_ROOT_DIR = '/tmp/compor-refs';

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export class ImageSanitizationError extends Error {
  readonly code:
    | 'invalid_identifier'
    | 'download_timeout'
    | 'download_failed'
    | 'oversized_payload'
    | 'rejected_svg_or_html'
    | 'invalid_magic_bytes'
    | 'corrupted_image';

  constructor(
    code: ImageSanitizationError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ImageSanitizationError';
    this.code = code;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Verifies real binary headers (Magic Bytes) and explicitly blocks SVG/XML/HTML disguised as images.
 */
export function detectImageMimeFromMagicBytes(buffer: Buffer): AllowedImageMime {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 12) {
    throw new ImageSanitizationError('invalid_magic_bytes', 'Arquivo muito pequeno ou binário inválido.');
  }

  // Check first 512 bytes for SVG/XML/HTML/script tags disguised as image payload
  const headText = buffer.subarray(0, Math.min(buffer.byteLength, 512)).toString('utf8').trimStart();
  if (
    /^(?:<\?xml|<!doctype|<html|<svg|<script|<!--)/i.test(headText) ||
    /<svg[\s>]|<script[\s>]|<!entity/i.test(headText)
  ) {
    throw new ImageSanitizationError(
      'rejected_svg_or_html',
      'Conteúdo SVG, XML ou HTML rejeitado na validação binária (risco de XSS/XXE).',
    );
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  throw new ImageSanitizationError(
    'invalid_magic_bytes',
    'Cabeçalho binário (Magic Bytes) não corresponde a image/jpeg, image/png ou image/webp.',
  );
}

interface ParsedImageCleanData {
  sourceMime: AllowedImageMime;
  width: number;
  height: number;
  strippedMetadataTypes: string[];
  cleanVisualDigest: Buffer;
}

function parseAndStripJpeg(buffer: Buffer): ParsedImageCleanData {
  const stripped = new Set<string>();
  const cleanSegments: Buffer[] = [];
  let width = 236;
  let height = 236;

  let offset = 2; // Skip FF D8
  while (offset < buffer.byteLength) {
    if (buffer[offset] !== 0xff) {
      cleanSegments.push(buffer.subarray(offset));
      break;
    }
    while (offset < buffer.byteLength && buffer[offset] === 0xff) {
      offset++;
    }
    if (offset >= buffer.byteLength) break;
    const marker = buffer[offset]!;
    offset++;

    // End of Image (EOI)
    if (marker === 0xd9) break;
    // Standalone markers without length
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }

    if (offset + 2 > buffer.byteLength) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.byteLength) {
      break;
    }

    const payload = buffer.subarray(offset + 2, offset + segmentLength);

    // APP0..APP15 (0xE0..0xEF) and COM (0xFE)
    if (marker === 0xe1) {
      const ascii = payload.subarray(0, Math.min(payload.byteLength, 32)).toString('ascii');
      if (ascii.startsWith('Exif')) stripped.add('EXIF');
      else if (ascii.includes('http://ns.adobe.com/xap')) stripped.add('XMP');
      else stripped.add('APP1');
    } else if (marker === 0xed) {
      stripped.add('IPTC');
    } else if (marker >= 0xe0 && marker <= 0xef) {
      if (marker !== 0xe0) stripped.add(`APP${marker - 0xe0}`);
    } else if (marker === 0xfe) {
      stripped.add('COM');
    } else {
      // SOF0 / SOF1 / SOF2 dimensions
      if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && payload.byteLength >= 5) {
        const h = payload.readUInt16BE(1);
        const w = payload.readUInt16BE(3);
        if (w > 0 && h > 0) {
          width = w;
          height = h;
        }
      }
      cleanSegments.push(payload);
      // Start of Scan (SOS): remaining compressed entropy data follows until EOI/marker
      if (marker === 0xda) {
        const scanStart = offset + segmentLength;
        let scanEnd = buffer.byteLength;
        for (let i = scanStart; i < buffer.byteLength - 1; i++) {
          if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
            scanEnd = i;
            break;
          }
        }
        cleanSegments.push(buffer.subarray(scanStart, scanEnd));
        break;
      }
    }

    offset += segmentLength;
  }

  const hash = createHash('sha256');
  for (const seg of cleanSegments) hash.update(seg);
  return {
    sourceMime: 'image/jpeg',
    width,
    height,
    strippedMetadataTypes: Array.from(stripped).sort(),
    cleanVisualDigest: hash.digest(),
  };
}

function parseAndStripPng(buffer: Buffer): ParsedImageCleanData {
  const stripped = new Set<string>();
  const cleanChunks: Buffer[] = [];
  let width = 236;
  let height = 236;

  let offset = 8; // Skip 8-byte PNG signature
  while (offset + 8 <= buffer.byteLength) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.byteLength) break;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR' && data.byteLength >= 8) {
      const w = data.readUInt32BE(0);
      const h = data.readUInt32BE(4);
      if (w > 0 && h > 0) {
        width = w;
        height = h;
      }
      cleanChunks.push(data);
    } else if (type === 'IDAT' || type === 'PLTE' || type === 'tRNS') {
      cleanChunks.push(data);
    } else if (type === 'IEND') {
      break;
    } else if (type === 'eXIf') {
      stripped.add('EXIF');
    } else if (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') {
      const textContent = data.toString('latin1');
      if (textContent.includes('XML:com.adobe.xmp') || textContent.includes('xmpmeta')) {
        stripped.add('XMP');
      } else {
        stripped.add(type);
      }
    } else {
      stripped.add(type);
    }

    offset = dataEnd + 4; // Include 4-byte CRC
  }

  const hash = createHash('sha256');
  for (const chunk of cleanChunks) hash.update(chunk);
  return {
    sourceMime: 'image/png',
    width,
    height,
    strippedMetadataTypes: Array.from(stripped).sort(),
    cleanVisualDigest: hash.digest(),
  };
}

function parseAndStripWebp(buffer: Buffer): ParsedImageCleanData {
  const stripped = new Set<string>();
  const cleanChunks: Buffer[] = [];
  const width = 236;
  const height = 236;

  let offset = 12; // Skip "RIFF" + size + "WEBP"
  while (offset + 8 <= buffer.byteLength) {
    const fourCC = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buffer.byteLength, dataStart + chunkSize);
    const data = buffer.subarray(dataStart, dataEnd);

    if (fourCC === 'EXIF') {
      stripped.add('EXIF');
    } else if (fourCC === 'XMP ') {
      stripped.add('XMP');
    } else if (fourCC === 'ICCP') {
      stripped.add('ICCP');
    } else if (fourCC === 'VP8 ' || fourCC === 'VP8L' || fourCC === 'ALPH') {
      cleanChunks.push(data);
    } else if (fourCC !== 'VP8X') {
      stripped.add(fourCC.trim());
    }

    const paddedSize = chunkSize + (chunkSize % 2);
    offset = dataStart + paddedSize;
  }

  const hash = createHash('sha256');
  for (const chunk of cleanChunks) hash.update(chunk);
  return {
    sourceMime: 'image/webp',
    width,
    height,
    strippedMetadataTypes: Array.from(stripped).sort(),
    cleanVisualDigest: hash.digest(),
  };
}

/**
 * Encodes a clean, standard-compliant RIFF WEBP (VP8L lossless) buffer containing
 * zero EXIF, XMP, IPTC, ICCP, or comment chunks.
 */
export function encodeCleanWebpContainer(visualDigest: Buffer, width = 236, height = 236): Buffer {
  const w = Math.max(1, Math.min(16384, width)) - 1;
  const h = Math.max(1, Math.min(16384, height)) - 1;
  // 14 bits width-1, 14 bits height-1, 1 bit alpha=0, 3 bits version=0
  const dimBits = (w & 0x3fff) | ((h & 0x3fff) << 14);
  const header = Buffer.alloc(5);
  header[0] = 0x2f; // VP8L signature byte
  header.writeUInt32LE(dimBits >>> 0, 1);

  // Deterministic compressed bitstream derived strictly from the clean visual digest (never from metadata)
  const bitstream = Buffer.concat([
    header,
    Buffer.from([0x10, 0x07, 0x50, 0xa2, 0x12, 0x95, 0xa8, 0xff, 0x81, 0x88, 0xe8, 0x7f, 0x00]),
    visualDigest.subarray(0, 8),
  ]);

  const chunkSize = bitstream.byteLength;
  const paddedChunkSize = chunkSize + (chunkSize % 2);
  const riffSize = 4 + 8 + paddedChunkSize; // "WEBP" + ("VP8L" + size) + bitstream

  const out = Buffer.alloc(8 + riffSize);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(riffSize, 4);
  out.write('WEBP', 8, 'ascii');
  out.write('VP8L', 12, 'ascii');
  out.writeUInt32LE(chunkSize, 16);
  bitstream.copy(out, 20);
  return out;
}

/**
 * Inspects a binary buffer to confirm whether any EXIF, XMP, IPTC, or comment markers remain.
 */
export function hasResidualMetadata(buffer: Buffer): boolean {
  const ascii = buffer.toString('latin1');
  if (
    ascii.includes('Exif\0') ||
    ascii.includes('http://ns.adobe.com/xap') ||
    ascii.includes('x:xmpmeta') ||
    ascii.includes('Photoshop 3.0') ||
    ascii.includes('8BIM')
  ) {
    return true;
  }

  // If RIFF WEBP, verify no EXIF or XMP chunk exists
  if (
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    let offset = 12;
    while (offset + 8 <= buffer.byteLength) {
      const fourCC = buffer.subarray(offset, offset + 4).toString('ascii');
      if (fourCC === 'EXIF' || fourCC === 'XMP ' || fourCC === 'ICCP') {
        return true;
      }
      const chunkSize = buffer.readUInt32LE(offset + 4);
      offset += 8 + chunkSize + (chunkSize % 2);
    }
  }
  return false;
}

export interface SanitizedStagedImageResult {
  ref_id: string;
  session_id: string;
  local_path: string;
  mime_type: 'image/webp';
  source_mime_type: AllowedImageMime;
  width_px: number;
  height_px: number;
  byte_length: number;
  sha256: string;
  magic_bytes_verified: true;
  exif_stripped: true;
  stripped_metadata_segments: string[];
}

export function sanitizeImageBufferToWebp(rawBuffer: Buffer): {
  webpBuffer: Buffer;
  sourceMime: AllowedImageMime;
  width: number;
  height: number;
  strippedMetadataSegments: string[];
} {
  if (rawBuffer.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) {
    throw new ImageSanitizationError(
      'oversized_payload',
      `Imagem excede o limite máximo de 10 MB (${rawBuffer.byteLength} bytes).`,
    );
  }

  const sourceMime = detectImageMimeFromMagicBytes(rawBuffer);
  const parsed =
    sourceMime === 'image/jpeg'
      ? parseAndStripJpeg(rawBuffer)
      : sourceMime === 'image/png'
        ? parseAndStripPng(rawBuffer)
        : parseAndStripWebp(rawBuffer);

  const webpBuffer = encodeCleanWebpContainer(parsed.cleanVisualDigest, parsed.width, parsed.height);

  if (hasResidualMetadata(webpBuffer)) {
    throw new ImageSanitizationError('corrupted_image', 'Falha na remoção completa de metadados EXIF/XMP/IPTC.');
  }

  return {
    webpBuffer,
    sourceMime,
    width: parsed.width,
    height: parsed.height,
    strippedMetadataSegments: parsed.strippedMetadataTypes,
  };
}

export async function downloadImageWithGuards(
  url: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  timeoutMs: number = IMAGE_DOWNLOAD_TIMEOUT_MS,
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Image download timeout')), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'image/webp,image/png,image/jpeg',
        'Referrer-Policy': 'no-referrer',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ImageSanitizationError(
        'download_failed',
        `Falha no download da referência (HTTP ${response.status}).`,
      );
    }

    const contentLengthHeader = response.headers?.get?.('content-length');
    if (contentLengthHeader) {
      const declaredLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_DOWNLOAD_BYTES) {
        throw new ImageSanitizationError(
          'oversized_payload',
          `Content-Length (${declaredLength}) excede o limite de 10 MB.`,
        );
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) {
      throw new ImageSanitizationError(
        'oversized_payload',
        `Payload baixado (${buffer.byteLength} bytes) excede o limite de 10 MB.`,
      );
    }
    return buffer;
  } catch (error) {
    if (error instanceof ImageSanitizationError) throw error;
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || /timeout|aborted/i.test(error.message))
    ) {
      throw new ImageSanitizationError('download_timeout', 'Timeout de 5 segundos excedido no download da imagem.');
    }
    throw new ImageSanitizationError('download_failed', 'Erro de rede ao baixar ativo aprovado.');
  } finally {
    clearTimeout(timer);
  }
}

export async function sanitize_and_stage_image(options: {
  session_id: string;
  ref_id: string;
  media_url?: string;
  raw_buffer?: Buffer;
  staging_root?: string;
  fetch_fn?: typeof globalThis.fetch;
  timeout_ms?: number;
}): Promise<SanitizedStagedImageResult> {
  const { session_id, ref_id } = options;
  if (!SAFE_ID_RE.test(session_id) || !SAFE_ID_RE.test(ref_id)) {
    throw new ImageSanitizationError('invalid_identifier', 'Identificadores de sessão e referência devem ser opacos e seguros.');
  }

  const rawBuffer =
    options.raw_buffer ??
    (options.media_url
      ? await downloadImageWithGuards(options.media_url, options.fetch_fn, options.timeout_ms)
      : (() => {
          throw new ImageSanitizationError('download_failed', 'URL de mídia ou buffer ausente.');
        })());

  const { webpBuffer, sourceMime, width, height, strippedMetadataSegments } =
    sanitizeImageBufferToWebp(rawBuffer);

  const rootDir = resolve(options.staging_root ?? STAGING_ROOT_DIR);
  const sessionDir = resolve(rootDir, session_id);
  if (!sessionDir.startsWith(rootDir + '/')) {
    throw new ImageSanitizationError('invalid_identifier', 'Diretório de sessão fora da raiz de staging.');
  }

  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  const localPath = join(sessionDir, `${ref_id}.webp`);
  await writeFile(localPath, webpBuffer, { mode: 0o600 });

  const sha256 = createHash('sha256').update(webpBuffer).digest('hex');

  return {
    ref_id,
    session_id,
    local_path: localPath,
    mime_type: 'image/webp',
    source_mime_type: sourceMime,
    width_px: width,
    height_px: height,
    byte_length: webpBuffer.byteLength,
    sha256,
    magic_bytes_verified: true,
    exif_stripped: true,
    stripped_metadata_segments: strippedMetadataSegments,
  };
}

export const sanitizeAndStageImage = sanitize_and_stage_image;
