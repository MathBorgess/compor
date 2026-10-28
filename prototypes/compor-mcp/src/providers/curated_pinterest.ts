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

const DEFAULT_HTTP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parses a public Pinterest board RSS feed (`https://www.pinterest.com/<user>/<board>.rss`)
 * into normalized `PinterestPinJsonItem` records without any headless browser.
 */
export function parsePinterestBoardRss(rssXml: string): PinterestPinJsonItem[] {
  const items: PinterestPinJsonItem[] = [];
  const itemMatches = rssXml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (const itemXml of itemMatches) {
    const titleRaw = itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const linkRaw =
      itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ??
      itemXml.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
      '';
    const descRaw = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? '';

    const decodedTitle = decodeXmlEntities(titleRaw).trim();
    const decodedLink = decodeXmlEntities(linkRaw).trim();
    const decodedDescHtml = decodeXmlEntities(descRaw).trim();

    const pinIdMatch = decodedLink.match(/\/pin\/([^/?#]+)/i);
    const pinId = pinIdMatch?.[1] ?? `rss_${items.length + 1}`;
    const imgMatch = decodedDescHtml.match(/https:\/\/i\.pinimg\.com\/[^"'\s<>]+/i);
    const previewUrl = imgMatch?.[0];
    if (!previewUrl) continue;

    const mediaUrl = previewUrl.replace('/236x/', '/736x/');
    const plainDesc = decodedDescHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    items.push({
      id: pinId,
      title: decodedTitle || plainDesc.slice(0, 80) || `Pin ${pinId}`,
      description: plainDesc || decodedTitle,
      alt_text: plainDesc || decodedTitle,
      origin_url: decodedLink || `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`,
      preview_url: previewUrl,
      media_url: mediaUrl,
    });
  }

  return items;
}

/**
 * Parses embedded `__PWS_INITIAL_PROPS__` JSON from a public Pinterest board HTML page.
 */
export function parsePinterestPwsHtml(html: string): PinterestPinJsonItem[] {
  const match = html.match(
    /<script[^>]+id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as {
      initialReduxState?: { pins?: Record<string, PinterestPinJsonItem> };
    };
    const pinsObj = parsed.initialReduxState?.pins;
    if (!pinsObj || typeof pinsObj !== 'object') return [];
    return Object.values(pinsObj);
  } catch {
    return [];
  }
}

function selectCuratedBoardsForQuery(query: ProviderSearchQuery): string[] {
  const allowed = query.source.allowed_boards_or_queries.filter(
    (b) => !b.startsWith('compor-curated/'),
  );
  if (allowed.length === 0) {
    return [query.source.allowed_boards_or_queries[0] ?? 'behance/graphic-design'];
  }
  const summaryLower = query.briefing_summary.toLowerCase();
  const prioritized = [...allowed].sort((a, b) => {
    const score = (board: string) => {
      let s = 0;
      if (
        (summaryLower.includes('anúncio') ||
          summaryLower.includes('ad') ||
          summaryLower.includes('campanha') ||
          summaryLower.includes('oferta')) &&
        board.includes('advertising')
      ) {
        s += 3;
      }
      if (query.aspect_focus.includes('typography') && board.includes('graphic-design')) {
        s += 2;
      }
      if (query.aspect_focus.includes('photography') && board.includes('photography')) {
        s += 3;
      }
      return s;
    };
    return score(b) - score(a);
  });
  return prioritized;
}

function rankPinsByQuery(pins: PinterestPinJsonItem[], briefingSummary: string): PinterestPinJsonItem[] {
  const tokens = briefingSummary
    .toLowerCase()
    .split(/[^a-z0-9à-ú]+/i)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return pins;

  return [...pins].sort((a, b) => {
    const textA = `${a.title ?? ''} ${a.description ?? ''}`.toLowerCase();
    const textB = `${b.title ?? ''} ${b.description ?? ''}`.toLowerCase();
    const hitsA = tokens.reduce((acc, tk) => acc + (textA.includes(tk) ? 1 : 0), 0);
    const hitsB = tokens.reduce((acc, tk) => acc + (textB.includes(tk) ? 1 : 0), 0);
    return hitsB - hitsA;
  });
}

/**
 * Lightweight HTTP/GraphQL/RSS metadata-only extractor inspired by pinterest-dl / gallery-dl --dump-json.
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
    const boards = selectCuratedBoardsForQuery(query);
    const primaryBoard = boards[0] ?? 'behance/graphic-design';
    const timeoutMs = Math.min(5000, query.source.rate_limit.timeout_ms);
    const limit = query.limit ?? 5;

    let rawPins: PinterestPinJsonItem[] = [];
    let lastError: Error | null = null;

    // Step 1: Attempt Pinterest JSON BaseSearchResource endpoint (used by mock tests & authenticated sessions)
    const searchParams = new URLSearchParams({
      source_url: `/${primaryBoard}/`,
      data: JSON.stringify({
        options: {
          board_slug: primaryBoard,
          query: query.briefing_summary.slice(0, 120),
          target_format: query.target_format,
          aspect_focus: query.aspect_focus,
          page_size: limit,
        },
        context: {},
      }),
    });

    const endpoint = `https://www.pinterest.com/resource/BaseSearchResource/get/?${searchParams.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Pinterest HTTP timeout')), timeoutMs);
    timer.unref?.();

    try {
      const response = await this.fetchFn(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': DEFAULT_HTTP_USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Pinterest-AppState': 'active',
          'Referrer-Policy': 'no-referrer',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        const payload = await response.json();
        rawPins = this.extractPinItems(payload);
      } else {
        lastError = new ProviderUnavailableError(
          query.source.source_id,
          `Pinterest HTTP endpoint returned status ${response.status}.`,
        );
      }
    } catch (error) {
      lastError =
        error instanceof ProviderUnavailableError
          ? error
          : new ProviderUnavailableError(
              query.source.source_id,
              error instanceof Error ? error.message : 'Pinterest HTTP request failed.',
            );
      // If the transport itself threw a network error (e.g. ECONNRESET in offline/fallback tests),
      // do not mask it if we cannot reach the host at all.
    } finally {
      clearTimeout(timer);
    }

    // Step 2: If BaseSearchResource returned 403/404 (unauthenticated guest HTTP),
    // query the public curated board RSS feed (`https://www.pinterest.com/{board}.rss`),
    // which returns real pins over pure HTTP without headless browsers or login cookies.
    if (rawPins.length === 0) {
      for (const board of boards.slice(0, 2)) {
        const rssEndpoint = `https://www.pinterest.com/${board}.rss`;
        const rssController = new AbortController();
        const rssTimer = setTimeout(
          () => rssController.abort(new Error('Pinterest RSS HTTP timeout')),
          timeoutMs,
        );
        rssTimer.unref?.();

        try {
          const rssResponse = await this.fetchFn(rssEndpoint, {
            method: 'GET',
            headers: {
              Accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.8',
              'User-Agent': DEFAULT_HTTP_USER_AGENT,
              'Referrer-Policy': 'no-referrer',
            },
            signal: rssController.signal,
          });

          if (rssResponse.ok) {
            const rssBody = await rssResponse.text();
            const parsedRssPins = parsePinterestBoardRss(rssBody);
            const candidatePins =
              parsedRssPins.length > 0 ? parsedRssPins : parsePinterestPwsHtml(rssBody);
            const existingIds = new Set(rawPins.map((p) => p.id ?? p.origin_url));
            for (const pin of candidatePins) {
              const key = pin.id ?? pin.origin_url;
              if (key && existingIds.has(key)) continue;
              if (key) existingIds.add(key);
              rawPins.push(pin);
            }
            if (rawPins.length >= limit) break;
          }
        } catch {
          // Keep original error if RSS fallback also fails
        } finally {
          clearTimeout(rssTimer);
        }
      }
    }

    if (rawPins.length === 0 && lastError) {
      throw lastError;
    }

    const rankedPins = rankPinsByQuery(rawPins, query.briefing_summary);

    return Promise.all(
      rankedPins.slice(0, limit).map(async (pin, idx) => {
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
