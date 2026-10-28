import type { CatalogSource } from '../catalog/catalog.js';
import type { AspectRationaleMap, ReferenceAttribute } from '../staging/ephemeral_store.js';
import { createHash } from 'node:crypto';
import { encodeCleanWebpContainer } from '../security/image_sanitizer.js';

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
  aspect_rationale: AspectRationaleMap;
  thumbnail_base64: string;
  thumbnail_mime_type: 'image/webp' | 'image/png' | 'image/jpeg';
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

export function buildDefaultThumbnailBase64(seed: string): string {
  const digest = createHash('sha256').update(seed).digest();
  return encodeCleanWebpContainer(digest, 236, 236).toString('base64');
}

export function buildAspectRationale(
  aspectFocus: ReferenceAttribute[],
  targetFormat: string,
  overrides: Partial<AspectRationaleMap> = {},
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
    result[aspect] = overrides[aspect] ?? defaults[aspect];
  }
  for (const [k, v] of Object.entries(overrides) as Array<[ReferenceAttribute, string | undefined]>) {
    if (v && !result[k]) {
      result[k] = v;
    }
  }
  return result;
}
