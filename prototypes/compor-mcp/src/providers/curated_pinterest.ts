import {
  buildAspectRationale,
  ProviderUnavailableError,
  resolvePreviewThumbnailInMemory,
  type ProviderSearchQuery,
  type RawProviderCandidate,
  type ReferenceSearchProvider,
} from './base_provider.js';

export interface PinterestPinJsonItem {
  id?: string;
  ref_id?: string;
  title?: string;
  grid_title?: string;
  description?: string;
  closeup_unified_description?: string;
  alt_text?: string;
  auto_alt_text?: string;
  link?: string;
  origin_url?: string;
  preview_url?: string;
  media_url?: string;
  images?: {
    '236x'?: { url?: string };
    '474x'?: { url?: string };
    '736x'?: { url?: string };
    orig?: { url?: string };
  };
  aspect_rationale?: {
    typography?: string;
    composition?: string;
    color?: string;
    photography?: string;
  };
  thumbnail_base64?: string;
}

/**
 * Lightweight HTTP/GraphQL metadata-only extractor inspired by pinterest-dl / gallery-dl --dump-json.
 * Strictly prohibits Playwright/Puppeteer/Chromium and never writes media files to disk during search.
 */
export class CuratedPinterestProvider implements ReferenceSearchProvider {
  readonly sourceId: string;
  readonly accessMethod = 'curated_board_http' as const;
  readonly headlessBrowserUsed = false as const;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options: {
    sourceId?: string;
    fetchFn?: typeof globalThis.fetch;
  } = {}) {
    this.sourceId = options.sourceId ?? 'pinterest_curated_design';
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  }

  async searchMetadataOnly(query: ProviderSearchQuery): Promise<RawProviderCandidate[]> {
    const board = query.source.allowed_boards_or_queries[0] ?? 'compor-curated/editorial-typography-grids';
    const timeoutMs = Math.min(5000, query.source.rate_limit.timeout_ms);
    const searchParams = new URLSearchParams({
      source_url: `/${board}/`,
      data: JSON.stringify({
        options: {
          board_slug: board,
          query: query.briefing_summary.slice(0, 120),
          target_format: query.target_format,
          aspect_focus: query.aspect_focus,
          page_size: query.limit ?? 5,
        },
        context: {},
      }),
    });

    const endpoint = `https://www.pinterest.com/resource/BaseSearchResource/get/?${searchParams.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Pinterest HTTP timeout')), timeoutMs);
    timer.unref?.();

    let payload: unknown;
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Pinterest-AppState': 'active',
          'Referrer-Policy': 'no-referrer',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderUnavailableError(
          query.source.source_id,
          `Pinterest HTTP endpoint returned status ${response.status}.`,
        );
      }
      payload = await response.json();
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(
        query.source.source_id,
        error instanceof Error ? error.message : 'Pinterest HTTP request failed.',
      );
    } finally {
      clearTimeout(timer);
    }

    const rawPins = this.extractPinItems(payload);
    const limit = query.limit ?? 5;

    return Promise.all(
      rawPins.slice(0, limit).map(async (pin, idx) => {
        const pinId = String(pin.id ?? pin.ref_id ?? `pin_${idx + 1}`);
        const previewUrl =
          pin.preview_url ??
          pin.images?.['236x']?.url ??
          `https://i.pinimg.com/236x/curated/${encodeURIComponent(pinId)}.jpg`;
        const mediaUrl =
          pin.media_url ??
          pin.images?.['736x']?.url ??
          pin.images?.orig?.url ??
          previewUrl;
        const originUrl =
          pin.origin_url ??
          pin.link ??
          `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`;

        const resolvedThumbnail = await resolvePreviewThumbnailInMemory({
          providedThumbnailBase64: pin.thumbnail_base64,
          previewUrl,
          fetchFn: this.fetchFn,
          timeoutMs,
        });

        return {
          preferred_ref_id: pin.ref_id,
          source_id: query.source.source_id,
          origin_url: originUrl,
          preview_url: previewUrl,
          media_url: mediaUrl,
          raw_title: String(pin.title ?? pin.grid_title ?? `Referência Curada ${idx + 1}`),
          raw_caption: String(pin.description ?? pin.closeup_unified_description ?? ''),
          raw_alt_text: String(pin.alt_text ?? pin.auto_alt_text ?? pin.description ?? ''),
          raw_aspect_rationale: pin.aspect_rationale,
          aspect_rationale: buildAspectRationale(
            query.aspect_focus,
            query.target_format,
          ),
          thumbnail_base64: resolvedThumbnail?.thumbnail_base64 ?? null,
          thumbnail_mime_type: resolvedThumbnail?.thumbnail_mime_type ?? null,
        };
      }),
    );
  }

  private extractPinItems(payload: unknown): PinterestPinJsonItem[] {
    if (!payload || typeof payload !== 'object') return [];
    const obj = payload as Record<string, unknown>;

    if (Array.isArray(obj.items)) return obj.items as PinterestPinJsonItem[];
    if (Array.isArray(obj.pins)) return obj.pins as PinterestPinJsonItem[];
    if (Array.isArray(obj.results)) return obj.results as PinterestPinJsonItem[];

    const resourceResponse = obj.resource_response as Record<string, unknown> | undefined;
    if (resourceResponse && typeof resourceResponse.data === 'object' && resourceResponse.data !== null) {
      const data = resourceResponse.data as Record<string, unknown>;
      if (Array.isArray(data.results)) return data.results as PinterestPinJsonItem[];
      if (Array.isArray(data.pins)) return data.pins as PinterestPinJsonItem[];
    }
    return [];
  }
}
