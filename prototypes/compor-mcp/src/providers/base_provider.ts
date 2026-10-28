import type { CatalogSource } from '../catalog/catalog.js';
import type { AspectRationaleMap, ReferenceAttribute } from '../staging/ephemeral_store.js';
import {
  downloadImageWithGuards,
  IMAGE_DOWNLOAD_TIMEOUT_MS,
  MAX_IMAGE_DOWNLOAD_BYTES,
  sanitizeImageBufferToWebp,
} from '../security/image_sanitizer.js';

export interface ProviderSearchQuery {
  briefing_summary: string;
  target_format: string;
  aspect_focus: ReferenceAttribute[];
  source: CatalogSource;
  limit?: number;
}

export interface RawProviderCandidate {
  preferred_ref_id?: string;
  source_id: string;
  origin_url: string;
  preview_url: string;
  media_url: string;
  raw_title: string;
  raw_caption: string;
  raw_alt_text?: string;
  raw_aspect_rationale?: AspectRationaleMap;
  aspect_rationale: AspectRationaleMap;
  thumbnail_base64: string | null;
  thumbnail_mime_type: 'image/webp' | 'image/png' | 'image/jpeg' | null;
}

export interface ReferenceSearchProvider {
  readonly sourceId: string;
  readonly accessMethod: 'api_official' | 'curated_board_http';
  searchMetadataOnly(query: ProviderSearchQuery): Promise<RawProviderCandidate[]>;
}

export class ProviderUnavailableError extends Error {
  readonly sourceId: string;
  constructor(sourceId: string, message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.sourceId = sourceId;
  }
}

/**
 * Resolves actual low-resolution preview pixels in memory (never writing to disk during search)
 * and re-encodes them as a clean, metadata-free WebP thumbnail.
 * If neither `providedThumbnailBase64` nor `previewUrl` yields a valid image, returns `null`
 * so the caller can explicitly report `thumbnail_available: false` without fabricating bytes.
 */
export async function resolvePreviewThumbnailInMemory(options: {
  providedThumbnailBase64?: string;
  previewUrl: string;
  fetchFn: typeof globalThis.fetch;
  timeoutMs?: number;
}): Promise<{ thumbnail_base64: string; thumbnail_mime_type: 'image/webp' } | null> {
  if (typeof options.providedThumbnailBase64 === 'string' && options.providedThumbnailBase64.trim().length > 0) {
    try {
      const decoded = Buffer.from(options.providedThumbnailBase64, 'base64');
      const sanitized = sanitizeImageBufferToWebp(decoded);
      return {
        thumbnail_base64: sanitized.webpBuffer.toString('base64'),
        thumbnail_mime_type: 'image/webp',
      };
    } catch {
      // Fall through to fetching previewUrl
    }
  }

  if (!options.previewUrl) {
    return null;
  }

  try {
    const rawPreviewBytes = await downloadImageWithGuards(
      options.previewUrl,
      options.fetchFn,
      Math.min(IMAGE_DOWNLOAD_TIMEOUT_MS, options.timeoutMs ?? IMAGE_DOWNLOAD_TIMEOUT_MS),
      MAX_IMAGE_DOWNLOAD_BYTES,
    );
    const sanitized = sanitizeImageBufferToWebp(rawPreviewBytes);
    return {
      thumbnail_base64: sanitized.webpBuffer.toString('base64'),
      thumbnail_mime_type: 'image/webp',
    };
  } catch {
    return null;
  }
}

/**
 * Generates trusted local technical justifications for each requested composition aspect.
 * Untrusted provider-supplied `aspect_rationale` values must NEVER be merged here;
 * they are sanitized and isolated inside `untrusted_external_caption` and `external_metadata_envelope`.
 */
export function buildAspectRationale(
  aspectFocus: ReferenceAttribute[],
  targetFormat: string,
): AspectRationaleMap {
  const defaults: Record<ReferenceAttribute, string> = {
    typography: `Hierarquia tipográfica com contraste claro entre chamada principal e apoio para o formato ${targetFormat}.`,
    composition: `Grid modular com áreas de respiro e ponto focal estruturado para leitura rápida em ${targetFormat}.`,
    color: `Uso de blocos de contraste cromático e acento focal subordinável à paleta da Identidade Visual.`,
    photography: `Enquadramento editorial com iluminação direcional e recorte limpo para integração com camadas de texto.`,
  };

  const result: AspectRationaleMap = {};
  const activeAspects: ReferenceAttribute[] =
    aspectFocus.length > 0 ? aspectFocus : ['typography', 'composition', 'color', 'photography'];

  for (const aspect of activeAspects) {
    result[aspect] = defaults[aspect];
  }
  return result;
}
