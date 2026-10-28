import { z } from 'zod';
import {
  CATALOG_RESOURCE_URI,
  validateSourceGovernance,
  type SourcesCatalog,
} from '../catalog/catalog.js';
import {
  type RawProviderCandidate,
  type ReferenceSearchProvider,
} from '../providers/base_provider.js';
import { CuratedPinterestProvider } from '../providers/curated_pinterest.js';
import { MetaAdsProvider } from '../providers/meta_ads_provider.js';
import { sanitize_external_metadata } from '../security/text_sanitizer.js';
import {
  type EphemeralReferenceStore,
  type ReferenceAttribute,
} from '../staging/ephemeral_store.js';
import { writePreviewBoard } from '../staging/preview_board.js';

export const referenceAttributeSchema = z.enum([
  'typography',
  'composition',
  'color',
  'photography',
]);

export const searchCuratedReferencesInputSchema = {
  briefing_summary: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe('Resumo sanitizado da intenção e público (sem dados sensíveis do projeto).'),
  target_format: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('Formato da peça alinhado ao PR 10 (ex: single_feed, carousel_5_slides, story).'),
  aspect_focus: z
    .array(referenceAttributeSchema)
    .min(1)
    .max(4)
    .describe('Aspectos da composição que a pessoa quer explorar.'),
  source_ids: z
    .array(z.string().trim().min(1).max(80))
    .optional()
    .describe('IDs do catálogo compor://catalog/sources. Se vazio, usa fontes padrão ativas.'),
  consent_external_search: z
    .boolean()
    .describe('Confirmação de que o usuário autoriza o envio dos termos de busca às fontes externas.'),
};

export interface SearchCuratedReferencesDependencies {
  store: EphemeralReferenceStore;
  fetchFn?: typeof globalThis.fetch;
  providers?: Map<string, ReferenceSearchProvider>;
  catalog?: SourcesCatalog;
}

export async function executeSearchCuratedReferences(
  input: {
    briefing_summary: string;
    target_format: string;
    aspect_focus: ReferenceAttribute[];
    source_ids?: string[];
    consent_external_search: boolean;
  },
  deps: SearchCuratedReferencesDependencies,
) {
  const governance = await validateSourceGovernance({
    consent_external_search: input.consent_external_search,
    source_ids: input.source_ids,
    catalog: deps.catalog,
  });

  if (!governance.allowed) {
    const blockedPayload = {
      status: 'blocked' as const,
      code: governance.code,
      message: governance.message,
      catalog_uri: CATALOG_RESOURCE_URI,
      blocked_source_ids: governance.blocked_source_ids,
      external_requests_made: 0,
      images_downloaded_to_disk: 0,
    };
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(blockedPayload) }],
      structuredContent: blockedPayload,
    };
  }

  const sessionId = deps.store.getActiveSessionId();
  const fetchFn = deps.fetchFn ?? ((url, init) => globalThis.fetch(url, init));

  const rawCandidates: RawProviderCandidate[] = [];
  const providerErrors: Array<{ source_id: string; reason: string }> = [];

  for (const source of governance.sources) {
    const customProvider = deps.providers?.get(source.source_id);
    const provider: ReferenceSearchProvider =
      customProvider ??
      (source.access_method === 'api_official'
        ? new MetaAdsProvider({ fetchFn })
        : new CuratedPinterestProvider({ sourceId: source.source_id, fetchFn }));

    try {
      const results = await provider.searchMetadataOnly({
        briefing_summary: input.briefing_summary,
        target_format: input.target_format,
        aspect_focus: input.aspect_focus,
        source,
        limit: 5,
      });
      rawCandidates.push(...results);
    } catch (error) {
      providerErrors.push({
        source_id: source.source_id,
        reason: error instanceof Error ? error.message : 'provider_unavailable',
      });
    }
  }

  if (rawCandidates.length === 0) {
    const emptyPayload = {
      status: 'empty_or_unavailable' as const,
      session_id: sessionId,
      can_proceed_without_references: true,
      target_format: input.target_format,
      aspect_focus: input.aspect_focus,
      candidates: [],
      provider_diagnostics: providerErrors,
      images_downloaded_to_disk: 0,
      headless_browser_used: false,
      fallback_guidance:
        'Nenhuma referência externa disponível. O fluxo pode seguir normalmente para stage_approved_references ou compose_creative_direction com proceed_without_references: true.',
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(emptyPayload) }],
      structuredContent: emptyPayload,
    };
  }

  const sanitizedItems = rawCandidates.map((item) => {
    const { untrusted_external_caption } = sanitize_external_metadata({
      title: item.raw_title,
      caption: item.raw_caption,
      alt_text: item.raw_alt_text,
    });
    return {
      preferred_ref_id: item.preferred_ref_id,
      source_id: item.source_id,
      origin_url: item.origin_url,
      preview_url: item.preview_url,
      media_url: item.media_url,
      aspect_rationale: item.aspect_rationale,
      untrusted_external_caption,
      thumbnail_base64: item.thumbnail_base64,
      thumbnail_mime_type: item.thumbnail_mime_type,
    };
  });

  const registered = deps.store.registerSearchCandidates(sessionId, sanitizedItems);

  const boardHtmlPath = await writePreviewBoard({
    session_id: sessionId,
    briefing_summary: input.briefing_summary,
    target_format: input.target_format,
    aspect_focus: input.aspect_focus,
    candidates: registered,
    staging_root: deps.store.getStagingRoot(),
  });

  const candidatesOutput = registered.map((item) => ({
    ref_id: item.ref_id,
    aliases: item.aliases,
    source_id: item.source_id,
    origin_url: item.origin_url,
    preview_url: item.preview_url,
    referrer_policy: 'no-referrer' as const,
    aspect_rationale: item.aspect_rationale,
    available_attributes: ['typography', 'composition', 'color', 'photography'] as const,
    license_scope: 'inspiration_only' as const,
    untrusted_external_caption: item.untrusted_external_caption,
  }));

  const structuredPayload = {
    status: 'ok' as const,
    session_id: sessionId,
    target_format: input.target_format,
    aspect_focus: input.aspect_focus,
    can_proceed_without_references: true,
    board_html_path: boardHtmlPath,
    images_downloaded_to_disk: 0,
    headless_browser_used: false,
    ttl_seconds: 1800,
    candidates: candidatesOutput,
  };

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; mimeType: string; data: string }
  > = [{ type: 'text', text: JSON.stringify(structuredPayload) }];

  for (const item of registered) {
    content.push({
      type: 'image',
      mimeType: item.thumbnail_mime_type,
      data: item.thumbnail_base64,
    });
  }

  return {
    content,
    structuredContent: structuredPayload,
  };
}
