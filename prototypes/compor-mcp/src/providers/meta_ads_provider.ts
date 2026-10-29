import {
  buildAspectRationale,
  ProviderUnavailableError,
  resolvePreviewThumbnailInMemory,
  type ProviderSearchQuery,
  type RawProviderCandidate,
  type ReferenceSearchProvider,
} from './base_provider.js';

export interface MetaAdLibraryItem {
  id?: string;
  ref_id?: string;
  page_name?: string;
  ad_creative_link_titles?: string[];
  ad_creative_bodies?: string[];
  ad_snapshot_url?: string;
  preview_url?: string;
  media_url?: string;
  aspect_rationale?: {
    typography?: string;
    composition?: string;
    color?: string;
    photography?: string;
  };
  thumbnail_base64?: string;
}

/**
 * Modular connector for official Meta Ad Library API (metadata-only, no headless browser).
 */
export class MetaAdsProvider implements ReferenceSearchProvider {
  readonly sourceId = 'meta_ad_library';
  readonly accessMethod = 'api_official' as const;
  readonly headlessBrowserUsed = false as const;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(options: {
    fetchFn?: typeof globalThis.fetch;
  } = {}) {
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
  }

  async searchMetadataOnly(query: ProviderSearchQuery): Promise<RawProviderCandidate[]> {
    const timeoutMs = Math.min(5000, query.source.rate_limit.timeout_ms);
    const params = new URLSearchParams({
      search_terms: query.briefing_summary.slice(0, 100),
      ad_active_status: 'ACTIVE',
      fields: 'id,page_name,ad_creative_link_titles,ad_creative_bodies,ad_snapshot_url',
      limit: String(query.limit ?? 5),
    });
    if (process.env.META_AD_LIBRARY_ACCESS_TOKEN) {
      params.set('access_token', process.env.META_AD_LIBRARY_ACCESS_TOKEN);
    }

    const endpoint = `https://graph.facebook.com/v19.0/ads_archive?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Meta Ad Library timeout')), timeoutMs);
    timer.unref?.();

    let payload: unknown;
    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Referrer-Policy': 'no-referrer',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ProviderUnavailableError(
          query.source.source_id,
          `Meta Ad Library returned status ${response.status}.`,
        );
      }
      payload = await response.json();
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      throw new ProviderUnavailableError(
        query.source.source_id,
        error instanceof Error ? error.message : 'Meta Ad Library request failed.',
      );
    } finally {
      clearTimeout(timer);
    }

    const items = this.extractItems(payload);
    const limit = query.limit ?? 5;

    return Promise.all(
      items.slice(0, limit).map(async (ad, idx) => {
        const adId = String(ad.id ?? ad.ref_id ?? `meta_${idx + 1}`);
        const originUrl =
          ad.ad_snapshot_url ?? `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;
        const previewUrl =
          ad.preview_url ?? `https://scontent.xx.fbcdn.net/v/t39.35426-6/${encodeURIComponent(adId)}_236x.jpg`;
        const mediaUrl = ad.media_url ?? previewUrl;
        const title = ad.ad_creative_link_titles?.[0] ?? ad.page_name ?? `Anúncio Biblioteca ${idx + 1}`;
        const body = ad.ad_creative_bodies?.[0] ?? '';

        const resolvedThumbnail = await resolvePreviewThumbnailInMemory({
          providedThumbnailBase64: ad.thumbnail_base64,
          previewUrl,
          fetchFn: this.fetchFn,
          timeoutMs,
        });

        return {
          preferred_ref_id: ad.ref_id,
          source_id: query.source.source_id,
          origin_url: originUrl,
          preview_url: previewUrl,
          media_url: mediaUrl,
          raw_title: title,
          raw_caption: body,
          raw_alt_text: body || title,
          raw_aspect_rationale: ad.aspect_rationale,
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

  private extractItems(payload: unknown): MetaAdLibraryItem[] {
    if (!payload || typeof payload !== 'object') return [];
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as MetaAdLibraryItem[];
    if (Array.isArray(obj.items)) return obj.items as MetaAdLibraryItem[];
    return [];
  }
}
