import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { loadSourcesCatalog, type SourcesCatalog } from '../../catalog/catalog.js';
import type {
  RawProviderCandidate,
  ReferenceSearchProvider,
} from '../../providers/base_provider.js';
import { CuratedPinterestProvider } from '../../providers/curated_pinterest.js';
import { MetaAdsProvider } from '../../providers/meta_ads_provider.js';
import { sanitize_and_stage_image } from '../../security/image_sanitizer.js';
import { sanitize_external_metadata } from '../../security/text_sanitizer.js';
import type {
  EphemeralReferenceStore,
  ReferenceAttribute,
} from '../../staging/ephemeral_store.js';
import { writePreviewBoard } from '../../staging/preview_board.js';
import type { PhoenixHyperparams } from '../config/hyperparams.js';
import {
  inferCandidateSid,
  SID_TAXONOMY,
  type CompositionalRole,
} from '../domain/catalog.js';
import {
  clientModeSchema,
  decisionFallbackModeSchema,
  feedbackActionSchema,
  webDiscoveryResponseSchema,
  type BoardAllocation,
  type ClientMode,
  type DecisionFallbackMode,
  type FeedbackAction,
  type RankedCandidate,
  type WebDiscoveryResponse,
} from '../domain/models.js';
import {
  apply_sid_diversity_decay,
  compute_phoenix_multi_action_score,
  compute_user_tower_embedding,
  cosine_similarity,
  filter_excluded_sid_candidates,
  matches_excluded_sid,
} from '../math/formulas.js';
import type {
  CandidateToRank,
  PhoenixDecisionApiService,
} from '../services/decision_api.js';
import type { PhoenixMemoryStore } from '../services/memory_store.js';

export const discoverVisualReferencesInputSchema = {
  briefing: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe('Briefing criativo do usuário descrevendo objetivo, oferta e direção desejada.'),
  target_format: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('Formato alvo da peça (ex: carousel_editorial_4:5, ad_performance_4:5, story_interactive_9:16, linkedin_infographic).'),
  user_id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .default('default_user')
    .describe('Identificador do usuário para fusão da User Tower, Bandit de Boards e Prompt Caching.'),
  client_mode: clientModeSchema
    .default('codex')
    .describe('Modo de serialização dual: "codex" (Markdown compacto sem URLs de rastreio) ou "web" (JSON estruturado completo).'),
  decision_fallback_mode: decisionFallbackModeSchema
    .optional()
    .describe('Estratégia quando OPENAI_API_KEY não estiver definida no ambiente: ask_or_luna, luna_subagent, require_key ou deterministic_mock.'),
  openai_api_key: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe('Chave OpenAI opcional em memória para chamar diretamente o modelo de decisão (nunca persistida ou logada).'),
};

export const recordVisualFeedbackInputSchema = {
  user_id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('Identificador do usuário na sessão.'),
  candidate_id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('ID opaco da referência visual avaliada.'),
  board: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe('Slug canônico do board de origem da referência.'),
  metadata_sid: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(6)
    .describe('Lista de Semantic IDs (SID) da referência.'),
  action: feedbackActionSchema.describe(
    'Ação observada na sessão: locked_as_reference, expand_zoom, discard_generic ou style_mismatch.',
  ),
  dwell_time_ms: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe('Tempo de retenção/inspeção em milissegundos.'),
  client_mode: clientModeSchema
    .default('codex')
    .describe('Modo de serialização dual ("codex" ou "web").'),
  openai_api_key: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .optional()
    .describe('Chave OpenAI opcional em memória para manter o mesmo espaço de embeddings (nunca persistida ou logada).'),
};

/**
 * Remove qualquer URL bruta ou parâmetro de rastreio de textos destinados ao modo Codex.
 */
function stripUrlsAndTracking(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)>\]"']+/gi, '[url-sanitizada]')
    .replace(/\b(utm_[a-z_]+|fbclid|gclid|msclkid)=[^\s&]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formata a resposta do motor Phoenix de acordo com o `client_mode`:
 * - `codex`: retorna string Markdown enxuta (Top-N, SIDs, `staging_path` local e diretrizes técnicas de composição, sem URLs brutas de rastreio).
 * - `web`: retorna objeto JSON estruturado validado pelo schema `webDiscoveryResponseSchema`.
 */
export function format_mcp_response(
  payload: WebDiscoveryResponse,
  client_mode: 'codex',
  options?: { api_key_notice?: string; top_n?: number },
): string;
export function format_mcp_response(
  payload: WebDiscoveryResponse,
  client_mode: 'web',
  options?: { api_key_notice?: string; top_n?: number },
): WebDiscoveryResponse;
export function format_mcp_response(
  payload: WebDiscoveryResponse,
  client_mode: ClientMode,
  options?: { api_key_notice?: string; top_n?: number },
): string | WebDiscoveryResponse;
export function format_mcp_response(
  payload: WebDiscoveryResponse,
  client_mode: ClientMode = 'codex',
  options: { api_key_notice?: string; top_n?: number } = {},
): string | WebDiscoveryResponse {
  const validated = webDiscoveryResponseSchema.parse(payload);

  if (client_mode === 'web') {
    return validated;
  }

  const topN = options.top_n ?? validated.candidates.length;
  const topCandidates = validated.candidates.slice(0, topN);

  const lines: string[] = [
    `# Phoenix Visual Decision Engine — Top-${topCandidates.length} Referências (${validated.target_format})`,
    `- **Sessão:** \`${validated.session_token}\` | **Motor:** \`${validated.decision_engine_source}\``,
  ];

  if (options.api_key_notice) {
    lines.push(`- **Aviso de Decisão:** ${stripUrlsAndTracking(options.api_key_notice)}`);
  }

  if (validated.status === 'requires_api_key') {
    lines.push(
      '',
      '## Ação Necessária: Chave de Decisão OpenAI',
      'Deseja informar sua `openai_api_key` para chamar o modelo de decisão na API da OpenAI, ou prefere prosseguir com `decision_fallback_mode: "luna_subagent"`?',
    );
    return lines.join('\n');
  }

  lines.push('', '## Referências Ranqueadas (Candidate Isolation + SID Diversity Decay)');

  topCandidates.forEach((cand, idx) => {
    const cleanGuideline = stripUrlsAndTracking(cand.composition_guideline);
    const cleanDesc = stripUrlsAndTracking(cand.visual_description);
    lines.push(
      `### ${idx + 1}. \`${cand.candidate_id}\` (Board: \`${cand.board}\` | Score Final: \`${cand.final_score.toFixed(2)}\` | Decay: \`${cand.diversity_multiplier.toFixed(2)}\`)`,
      `- **SIDs:** \`${cand.metadata_sid.join(' > ')}\``,
      `- **Staging Local:** \`${cand.staging_path}\``,
      `- **Composição:** ${cleanGuideline}`,
      `- **Estrutura:** ${cleanDesc}`,
      '',
    );
  });

  return lines.join('\n').trim();
}

export const formatMcpResponse = format_mcp_response;

export interface PhoenixDualAdapterDependencies {
  hp: PhoenixHyperparams;
  memoryStore: PhoenixMemoryStore;
  decisionService: PhoenixDecisionApiService;
  referenceStore: EphemeralReferenceStore;
  fetchFn?: typeof globalThis.fetch;
  providers?: Map<string, ReferenceSearchProvider>;
  catalog?: SourcesCatalog;
}

function generateDiscoveryScopeId(sessionId: string, userId: string): string {
  const nonce = randomBytes(6).toString('hex');
  return createHash('sha256')
    .update(`${sessionId}:${userId}:${Date.now()}:${nonce}`)
    .digest('hex')
    .slice(0, 8);
}

function buildDiscoveryCandidateId(discoveryId: string, index: number): string {
  return `phx_${discoveryId}_${String(index + 1).padStart(2, '0')}`;
}

function roleToAspectFocus(role: CompositionalRole): ReferenceAttribute[] {
  switch (role) {
    case 'hook_cover':
      return ['typography', 'composition'];
    case 'structural_grid':
      return ['composition', 'typography'];
    case 'ui_component':
      return ['composition', 'color'];
    case 'conversion_cta':
      return ['composition', 'color', 'photography'];
    case 'wildcard_exploration':
      return ['color', 'composition', 'typography'];
  }
}

export function buildCandidateEmbeddingText(candidate: {
  board: string;
  metadata_sid: readonly string[];
  visual_description: string;
}): string {
  return `${candidate.board} ${candidate.metadata_sid.join(' ')} ${candidate.visual_description}`;
}

/**
 * Conecta os boards alocados pelo Router aos provedores reais de referências (`CuratedPinterestProvider`,
 * `MetaAdsProvider` ou `deps.providers` injetados), preservando as URLs reais (`preview_url`, `media_url`,
 * `origin_url`), thumbnails em memória e legendas externas sanitizadas.
 */
async function retrieveRealProviderCandidatesForAllocations(params: {
  allocations: BoardAllocation[];
  target_format: string;
  discovery_id: string;
  session_id: string;
  staging_root: string;
  deps: PhoenixDualAdapterDependencies;
}): Promise<
  Array<
    CandidateToRank & {
      source_id: string;
      raw_title: string;
      raw_caption: string;
      raw_alt_text?: string;
      raw_aspect_rationale?: RawProviderCandidate['raw_aspect_rationale'];
      aspect_rationale: RawProviderCandidate['aspect_rationale'];
    }
  >
> {
  const catalog = params.deps.catalog ?? (await loadSourcesCatalog());
  const activeSources = catalog.sources.filter((s) => s.active);
  const basePinterestSource =
    activeSources.find((s) => s.source_id === 'pinterest_curated_design') ??
    activeSources[0];

  if (!basePinterestSource) {
    return [];
  }

  const fetchFn = params.deps.fetchFn ?? ((url, init) => globalThis.fetch(url, init));
  const customProvider =
    params.deps.providers?.get(basePinterestSource.source_id) ??
    params.deps.providers?.get('pinterest_curated') ??
    (params.deps.providers && params.deps.providers.size > 0
      ? params.deps.providers.values().next().value
      : undefined);
  const provider: ReferenceSearchProvider =
    customProvider ??
    (basePinterestSource.access_method === 'api_official'
      ? new MetaAdsProvider({ fetchFn })
      : new CuratedPinterestProvider({
          sourceId: basePinterestSource.source_id,
          fetchFn,
        }));

  const collected: Array<
    CandidateToRank & {
      source_id: string;
      raw_title: string;
      raw_caption: string;
      raw_alt_text?: string;
      raw_aspect_rationale?: RawProviderCandidate['raw_aspect_rationale'];
      aspect_rationale: RawProviderCandidate['aspect_rationale'];
    }
  > = [];
  const seenOriginUrls = new Set<string>();
  let globalIdx = 0;

  for (const alloc of params.allocations) {
    const boardScopedSource = {
      ...basePinterestSource,
      allowed_boards_or_queries: [alloc.board],
    };

    try {
      const results = await provider.searchMetadataOnly({
        briefing_summary: alloc.synthetic_query,
        target_format: params.target_format,
        aspect_focus: roleToAspectFocus(alloc.role),
        source: boardScopedSource,
        limit: 3,
      });

      for (const rawItem of results) {
        const dedupeKey = `${alloc.board}::${rawItem.origin_url}::${rawItem.preview_url}`;
        if (seenOriginUrls.has(dedupeKey)) continue;
        seenOriginUrls.add(dedupeKey);

        const candidateId = buildDiscoveryCandidateId(params.discovery_id, globalIdx);
        globalIdx += 1;

        const rawTitle =
          rawItem.raw_title ??
          ((rawItem as unknown as { title?: string }).title ?? '');
        const rawCaption =
          rawItem.raw_caption ??
          ((rawItem as unknown as { caption?: string }).caption ?? '');

        const { untrusted_external_caption } = sanitize_external_metadata({
          title: rawTitle,
          caption: rawCaption,
          alt_text: rawItem.raw_alt_text,
          aspect_rationale: rawItem.raw_aspect_rationale,
        });

        const realDescription = [
          untrusted_external_caption.title,
          untrusted_external_caption.caption,
        ]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(' — ');

        const visualDescription =
          realDescription.length > 0
            ? realDescription.slice(0, 900)
            : `Referência visual extraída de ${alloc.board}`;

        const sid = inferCandidateSid({
          target_format: params.target_format,
          board: alloc.board,
          description: `${rawTitle} ${rawCaption} ${rawItem.raw_alt_text ?? ''}`,
          index: globalIdx - 1,
        });

        collected.push({
          candidate_id: candidateId,
          board: alloc.board,
          role: alloc.role,
          metadata_sid: [...sid],
          visual_description: visualDescription,
          preview_url: rawItem.preview_url,
          origin_url: rawItem.origin_url,
          media_url: rawItem.media_url,
          staging_path: `${params.staging_root}/${params.session_id}/board.html#${candidateId}`,
          thumbnail_base64: rawItem.thumbnail_base64,
          thumbnail_mime_type: rawItem.thumbnail_mime_type,
          source_id: rawItem.source_id,
          raw_title: rawItem.raw_title,
          raw_caption: rawItem.raw_caption,
          raw_alt_text: rawItem.raw_alt_text,
          raw_aspect_rationale: rawItem.raw_aspect_rationale,
          aspect_rationale: rawItem.aspect_rationale,
        });
      }
    } catch {
      // Prossegue para o próximo board alocado se uma fonte individual falhar
    }
  }

  return collected;
}

/**
 * Gerador sintético reservado estritamente para o modo de mock explícito
 * (`decision_fallback_mode === "deterministic_mock"` quando nenhum provider real/injetado é usado).
 */
function buildSyntheticMockCandidatesFromAllocations(params: {
  allocations: BoardAllocation[];
  target_format: string;
  discovery_id: string;
  session_id: string;
  staging_root: string;
  excluded_sid_tags: readonly string[];
}): Array<
  CandidateToRank & {
    source_id: string;
    raw_title: string;
    raw_caption: string;
    raw_alt_text?: string;
    raw_aspect_rationale?: RawProviderCandidate['raw_aspect_rationale'];
    aspect_rationale: RawProviderCandidate['aspect_rationale'];
  }
> {
  const candidates: Array<
    CandidateToRank & {
      source_id: string;
      raw_title: string;
      raw_caption: string;
      raw_alt_text?: string;
      raw_aspect_rationale?: RawProviderCandidate['raw_aspect_rationale'];
      aspect_rationale: RawProviderCandidate['aspect_rationale'];
    }
  > = [];

  let globalIdx = 0;
  params.allocations.forEach((alloc) => {
    for (let itemIdx = 0; itemIdx < 2; itemIdx++) {
      const candidateId = buildDiscoveryCandidateId(params.discovery_id, globalIdx);
      let sid = inferCandidateSid({
        target_format: params.target_format,
        board: alloc.board,
        description: `${alloc.synthetic_query} ${alloc.rationale}`,
        index: globalIdx + itemIdx,
      });

      // Para o 2º item do board no modo mock, garante variação de mecânica/estética para exercitar diversidade e filtros SID
      if (itemIdx === 1) {
        const altMechanic =
          SID_TAXONOMY.level_2_mechanic[
            (globalIdx + 2) % SID_TAXONOMY.level_2_mechanic.length
          ]!;
        const altAesthetic =
          SID_TAXONOMY.level_4_aesthetic[
            (globalIdx + 2) % SID_TAXONOMY.level_4_aesthetic.length
          ]!;
        sid = [sid[0], altMechanic, sid[2], altAesthetic];
      }

      globalIdx += 1;

      const desc =
        itemIdx === 0
          ? `[Mock ${alloc.role}] Composição em ${alloc.board}: ${alloc.synthetic_query}. Grid ${sid[1]} com hierarquia ${sid[2]} e atmosfera ${sid[3]}.`
          : `[Mock ${alloc.role}] Variação complementar em ${alloc.board}: estrutura ${sid[1]}, contraste ${sid[2]} e acabamento ${sid[3]}.`;

      candidates.push({
        candidate_id: candidateId,
        board: alloc.board,
        role: alloc.role,
        metadata_sid: [...sid],
        visual_description: desc,
        preview_url: `https://i.pinimg.com/236x/mock/${encodeURIComponent(alloc.board)}/${candidateId}.jpg`,
        origin_url: `https://www.pinterest.com/${alloc.board}/`,
        media_url: `https://i.pinimg.com/736x/mock/${encodeURIComponent(alloc.board)}/${candidateId}.jpg`,
        staging_path: `${params.staging_root}/${params.session_id}/board.html#${candidateId}`,
        thumbnail_base64: null,
        thumbnail_mime_type: null,
        source_id: 'pinterest_curated_design',
        raw_title: `${alloc.board} (${sid.join(', ')})`,
        raw_caption: desc,
        raw_alt_text: desc,
        aspect_rationale: {
          composition: desc,
          typography: `Hierarquia ${sid[2]}`,
          color: `Estética ${sid[3]}`,
        },
      });
    }
  });

  return candidates;
}

export async function executeDiscoverVisualReferences(
  input: {
    briefing: string;
    target_format: string;
    user_id?: string;
    client_mode?: ClientMode;
    decision_fallback_mode?: DecisionFallbackMode;
    openai_api_key?: string;
  },
  deps: PhoenixDualAdapterDependencies,
) {
  const userId = input.user_id?.trim() || 'default_user';
  const clientMode: ClientMode = input.client_mode ?? 'codex';
  const userRecord = deps.memoryStore.getOrCreateUser(userId);
  const sessionId = deps.referenceStore.getActiveSessionId(userRecord.session_token);
  const discoveryId = generateDiscoveryScopeId(sessionId, userId);
  const promptCacheKey = `phoenix_ranker_${userId}`;

  const strategy = deps.decisionService.resolveExecutionStrategy({
    client_mode: clientMode,
    fallback_mode: input.decision_fallback_mode,
    openai_api_key: input.openai_api_key,
  });

  if (strategy.requires_api_key_prompt) {
    const emptyPayload: WebDiscoveryResponse = {
      status: 'requires_api_key',
      client_mode: 'web',
      user_id: userId,
      session_token: sessionId,
      target_format: input.target_format,
      briefing: input.briefing,
      decision_engine_source: strategy.source,
      prompt_cache_key: promptCacheKey,
      board_allocations: [],
      required_sid_tags: [],
      excluded_sid_tags: [...userRecord.user_taste.negative_constraints],
      board_affinities: deps.memoryStore.getBoardAffinities(userId).slice(0, 10),
      candidates: [],
      telemetry: {
        total_candidates_evaluated: 0,
        exploration_quota_allocated: 0,
        user_tower_dimension: deps.hp.embedding_dimension,
        positive_session_events: userRecord.pos_session_vecs.length,
        negative_session_events: userRecord.neg_session_vecs.length,
        board_html_path: null,
      },
    };

    if (clientMode === 'codex') {
      const md = format_mcp_response(emptyPayload, 'codex', {
        api_key_notice: strategy.api_key_notice,
      });
      return {
        content: [{ type: 'text' as const, text: md }],
        structuredContent: {
          status: 'requires_api_key' as const,
          client_mode: 'codex' as const,
          markdown: md,
          api_key_prompt: strategy.api_key_notice,
        },
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(emptyPayload) }],
      structuredContent: emptyPayload,
    };
  }

  // Estágio 1: Decision Router
  const affinities = deps.memoryStore.getBoardAffinities(userId);
  const affinityTable = deps.memoryStore.formatBoardAffinityTable(userId);
  const sessionEventsSummary = deps.memoryStore.formatSessionEventsSummary(userId);

  const routerDecision = await deps.decisionService.routeBoards({
    user_id: userId,
    briefing: input.briefing,
    target_format: input.target_format,
    user_taste: userRecord.user_taste,
    board_affinities: affinities,
    board_affinity_table: affinityTable,
    session_events_summary: sessionEventsSummary,
    source: strategy.source,
    openai_api_key: input.openai_api_key,
  });

  const effectiveExcludedSids = Array.from(
    new Set([
      ...routerDecision.excluded_sid_tags,
      ...userRecord.user_taste.negative_constraints,
    ]),
  );

  // Recuperação de candidatos: usa provedores reais de referências por board alocado,
  // reservando candidatos sintéticos exclusivamente para o modo explícito de mock.
  const isExplicitMockMode =
    input.decision_fallback_mode === 'deterministic_mock' &&
    (!deps.providers || deps.providers.size === 0);

  let retrievedCandidates = isExplicitMockMode
    ? buildSyntheticMockCandidatesFromAllocations({
        allocations: routerDecision.board_allocations,
        target_format: input.target_format,
        discovery_id: discoveryId,
        session_id: sessionId,
        staging_root: deps.referenceStore.getStagingRoot(),
        excluded_sid_tags: effectiveExcludedSids,
      })
    : await retrieveRealProviderCandidatesForAllocations({
        allocations: routerDecision.board_allocations,
        target_format: input.target_format,
        discovery_id: discoveryId,
        session_id: sessionId,
        staging_root: deps.referenceStore.getStagingRoot(),
        deps,
      });

  // Se o servidor foi instanciado com forceDeterministicMock=true em testes sem provider nem rede,
  // usa os candidatos sintéticos de mock.
  if (
    retrievedCandidates.length === 0 &&
    deps.decisionService.isForcedDeterministicMock() &&
    (!deps.providers || deps.providers.size === 0)
  ) {
    retrievedCandidates = buildSyntheticMockCandidatesFromAllocations({
      allocations: routerDecision.board_allocations,
      target_format: input.target_format,
      discovery_id: discoveryId,
      session_id: sessionId,
      staging_root: deps.referenceStore.getStagingRoot(),
      excluded_sid_tags: effectiveExcludedSids,
    });
  }

  // Filtro explícito de padrões SID excluídos (`excluded_sid_tags` + `negative_constraints`) ANTES do ranking e seleção
  const rawCandidates = filter_excluded_sid_candidates(
    retrievedCandidates,
    effectiveExcludedSids,
  );

  // Espaço vetorial unificado: calcula o embedding da query sintética e de todos os candidatos
  // em uma única chamada consistente (`embedBatchConsistent`), sincronizando também os vetores da sessão/longo prazo.
  const combinedSyntheticQuery = [
    input.briefing,
    ...routerDecision.board_allocations.map((a) => a.synthetic_query),
  ].join(' | ');
  const candidateTexts = rawCandidates.map((c) => buildCandidateEmbeddingText(c));

  const batchEmbedding = await deps.decisionService.embedBatchConsistent(
    [combinedSyntheticQuery, ...candidateTexts],
    {
      apiKey: input.openai_api_key,
      forceSpace:
        strategy.source === 'deterministic_mock'
          ? 'local_deterministic_sha256'
          : undefined,
    },
  );

  const activeEmbeddingSpace = batchEmbedding.space;
  const queryVec = batchEmbedding.vectors[0]!;
  const candidateVecs = batchEmbedding.vectors.slice(1);

  rawCandidates.forEach((cand, idx) => {
    cand.candidate_vec = candidateVecs[idx]!;
  });

  await deps.memoryStore.ensureConsistentEmbeddingSpace(
    userId,
    activeEmbeddingSpace,
    async (texts, forceSpace) => {
      const reemb = await deps.decisionService.embedBatchConsistent(texts, {
        apiKey: input.openai_api_key,
        forceSpace,
      });
      return reemb.vectors;
    },
  );

  deps.memoryStore.registerDiscoveredCandidates(
    userId,
    rawCandidates.map((cand, idx) => ({
      candidate_id: cand.candidate_id,
      board: cand.board,
      metadata_sid: cand.metadata_sid,
      visual_description: cand.visual_description,
      embedding_text: candidateTexts[idx]!,
      vec: candidateVecs[idx]!,
      space: activeEmbeddingSpace,
    })),
  );

  const userTowerVec = compute_user_tower_embedding(
    queryVec,
    userRecord.pos_session_vecs,
    userRecord.neg_session_vecs,
    userRecord.long_term_vec,
    deps.hp,
  );

  // Registra os candidatos no EphemeralReferenceStore com IDs únicos do discovery (`phx_<discoveryId>_<nn>`)
  // e gera o preview board.html (zero-download de imagens em alta resolução na busca)
  const sanitizedForStore = rawCandidates.map((c) => {
    const { untrusted_external_caption } = sanitize_external_metadata({
      title: c.raw_title,
      caption: c.raw_caption,
      alt_text: c.raw_alt_text,
      aspect_rationale: c.raw_aspect_rationale,
    });
    return {
      preferred_ref_id: c.candidate_id,
      source_id: c.source_id,
      origin_url: c.origin_url,
      preview_url: c.preview_url,
      media_url: c.media_url ?? c.preview_url.replace('/236x/', '/736x/'),
      aspect_rationale: c.aspect_rationale,
      untrusted_external_caption,
      thumbnail_base64: c.thumbnail_base64 ?? null,
      thumbnail_mime_type: c.thumbnail_mime_type ?? null,
    };
  });

  const registeredInStore = deps.referenceStore.registerSearchCandidates(
    sessionId,
    sanitizedForStore,
  );
  const boardHtmlPath =
    registeredInStore.length > 0
      ? await writePreviewBoard({
          session_id: sessionId,
          briefing_summary: input.briefing,
          target_format: input.target_format,
          aspect_focus: ['composition', 'typography', 'color'],
          candidates: registeredInStore,
          staging_root: deps.referenceStore.getStagingRoot(),
        })
      : null;

  // Estágio 2: Candidate-Isolated Parallel Ranker (100% KV-Cache Prefix Hit)
  const isolatedRanked = await Promise.all(
    rawCandidates.map(async (candidate) => {
      const stagedRecord = deps.referenceStore.getStagedReference(candidate.candidate_id);
      const effectiveStagingPath = stagedRecord
        ? stagedRecord.local_path
        : boardHtmlPath
          ? `${boardHtmlPath}#${candidate.candidate_id}`
          : `${deps.referenceStore.getStagingRoot()}/${sessionId}/board.html#${candidate.candidate_id}`;

      const actionProbs = await deps.decisionService.rankSingleCandidateIsolated({
        user_id: userId,
        briefing: input.briefing,
        user_taste: userRecord.user_taste,
        session_events_log: sessionEventsSummary,
        user_tower_vec: userTowerVec,
        candidate: {
          ...candidate,
          staging_path: effectiveStagingPath,
        },
        source: strategy.source,
        openai_api_key: input.openai_api_key,
      });

      const rawScore =
        Math.round(compute_phoenix_multi_action_score(actionProbs, deps.hp) * 10000) /
        10000;

      const candVec = candidate.candidate_vec!;
      const cosSim =
        Math.round(cosine_similarity(userTowerVec, candVec) * 10000) / 10000;

      return {
        candidate_id: candidate.candidate_id,
        board: candidate.board,
        role: candidate.role,
        metadata_sid: candidate.metadata_sid,
        visual_description: candidate.visual_description,
        preview_url: candidate.preview_url,
        origin_url: candidate.origin_url,
        staging_path: effectiveStagingPath,
        action_probs: actionProbs,
        raw_score: rawScore,
        composition_guideline:
          actionProbs.composition_guideline ??
          `Aplicar grid ${candidate.metadata_sid[1] ?? 'swiss_grid'} e hierarquia ${candidate.metadata_sid[2] ?? 'bold_display_hook'}.`,
        thumbnail_base64: candidate.thumbnail_base64 ?? null,
        user_tower_cosine_similarity: cosSim,
      };
    }),
  );

  // Pós-Ranking: Decaimento de Diversidade por Prefixo SID + garantia de bloqueio de SIDs excluídos
  const decayedCandidates = apply_sid_diversity_decay(
    isolatedRanked.filter(
      (cand) => !matches_excluded_sid(cand.metadata_sid, effectiveExcludedSids),
    ),
    deps.hp,
  ) as RankedCandidate[];
  const topCandidates = decayedCandidates.slice(0, deps.hp.top_n_results);

  const explorationWeightTotal = routerDecision.board_allocations
    .filter((a) => a.role === 'wildcard_exploration' || a.board.endsWith('/feed'))
    .reduce((acc, item) => acc + item.weight, 0);

  const webPayload: WebDiscoveryResponse = {
    status: 'ok',
    client_mode: 'web',
    user_id: userId,
    session_token: sessionId,
    target_format: input.target_format,
    briefing: input.briefing,
    decision_engine_source: strategy.source,
    prompt_cache_key: promptCacheKey,
    board_allocations: routerDecision.board_allocations,
    required_sid_tags: routerDecision.required_sid_tags,
    excluded_sid_tags: effectiveExcludedSids,
    board_affinities: deps.memoryStore.getBoardAffinities(userId).slice(0, 12),
    candidates: topCandidates,
    telemetry: {
      total_candidates_evaluated: rawCandidates.length,
      exploration_quota_allocated: Math.min(
        1.0,
        Math.round(explorationWeightTotal * 10000) / 10000,
      ),
      user_tower_dimension: userTowerVec.length,
      positive_session_events: userRecord.pos_session_vecs.length,
      negative_session_events: userRecord.neg_session_vecs.length,
      board_html_path: boardHtmlPath,
    },
  };

  if (clientMode === 'codex') {
    const markdownText = format_mcp_response(webPayload, 'codex', {
      api_key_notice: strategy.api_key_notice,
      top_n: deps.hp.top_n_results,
    });
    return {
      content: [{ type: 'text' as const, text: markdownText }],
      structuredContent: {
        status: 'ok' as const,
        client_mode: 'codex' as const,
        user_id: userId,
        session_token: sessionId,
        decision_engine_source: strategy.source,
        markdown: markdownText,
        top_candidates: topCandidates.map((c) => ({
          candidate_id: c.candidate_id,
          board: c.board,
          metadata_sid: c.metadata_sid,
          staging_path: c.staging_path,
          final_score: c.final_score,
          diversity_multiplier: c.diversity_multiplier,
          composition_guideline: stripUrlsAndTracking(c.composition_guideline),
        })),
      },
    };
  }

  const validatedWeb = format_mcp_response(webPayload, 'web');
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(validatedWeb) }],
    structuredContent: validatedWeb,
  };
}

export async function executeRecordVisualFeedback(
  input: {
    user_id: string;
    candidate_id: string;
    board: string;
    metadata_sid: string[];
    action: FeedbackAction;
    dwell_time_ms?: number;
    client_mode?: ClientMode;
    openai_api_key?: string;
  },
  deps: PhoenixDualAdapterDependencies,
) {
  const clientMode: ClientMode = input.client_mode ?? 'codex';
  const dwellMs = input.dwell_time_ms ?? 0;
  const userRecord = deps.memoryStore.getOrCreateUser(input.user_id);

  const discoveredEntry = deps.memoryStore.getDiscoveredCandidate(
    input.user_id,
    input.candidate_id,
  );
  const candidateEmbeddingText =
    discoveredEntry?.embedding_text ??
    buildCandidateEmbeddingText({
      board: input.board,
      metadata_sid: input.metadata_sid,
      visual_description: discoveredEntry?.visual_description ?? input.candidate_id,
    });

  // Usa o mesmo backend de embedding ativo do usuário (ou re-embeda de forma consistente)
  let candidateVec: number[];
  let activeSpace = userRecord.embedding_space;

  if (
    discoveredEntry &&
    discoveredEntry.space === userRecord.embedding_space &&
    !input.openai_api_key
  ) {
    candidateVec = discoveredEntry.vec;
    activeSpace = discoveredEntry.space;
  } else {
    const embResult = await deps.decisionService.embedTextWithSpace(
      candidateEmbeddingText,
      {
        apiKey: input.openai_api_key,
        forceSpace: input.openai_api_key ? undefined : userRecord.embedding_space,
      },
    );
    candidateVec = embResult.vector;
    activeSpace = embResult.space;

    await deps.memoryStore.ensureConsistentEmbeddingSpace(
      input.user_id,
      activeSpace,
      async (texts, forceSpace) => {
        const reemb = await deps.decisionService.embedBatchConsistent(texts, {
          apiKey: input.openai_api_key,
          forceSpace,
        });
        return reemb.vectors;
      },
    );
  }

  const consolidationSource = deps.decisionService.resolveApiKey(input.openai_api_key)
    ? ('openai_api' as const)
    : ('deterministic_mock' as const);

  const feedbackResult = await deps.memoryStore.recordFeedback({
    user_id: input.user_id,
    candidate_id: input.candidate_id,
    board: input.board,
    metadata_sid: input.metadata_sid,
    action: input.action,
    dwell_time_ms: dwellMs,
    candidate_vec: candidateVec,
    candidate_text: candidateEmbeddingText,
    embedding_space: activeSpace,
    consolidator: async ({ user_id, previous_taste, session_events, embedding_space }) =>
      deps.decisionService.consolidateMemory({
        user_id,
        previous_taste,
        session_events,
        source: consolidationSource,
        openai_api_key: input.openai_api_key,
        embedding_space,
      }),
  });

  // Se a ação for `locked_as_reference` e o candidato existir no store efêmero e fetchFn estiver disponível,
  // tenta materializar o staging WebP sanitizado em `/tmp/compor-refs/{session_id}/{candidate_id}.webp`.
  let stagedWebpPath: string | null = null;
  if (input.action === 'locked_as_reference') {
    const storeCandidate = deps.referenceStore.getCandidate(input.candidate_id);
    if (storeCandidate && deps.fetchFn) {
      try {
        const stagedImg = await sanitize_and_stage_image({
          session_id: storeCandidate.session_id,
          ref_id: input.candidate_id,
          media_url: storeCandidate.media_url,
          staging_root: deps.referenceStore.getStagingRoot(),
          fetch_fn: deps.fetchFn,
        });
        stagedWebpPath = stagedImg.local_path;
      } catch {
        // Se offline ou sem binário de imagem mockado, mantém o path efêmero de sessão
      }
    }
  }

  const webFeedbackPayload = {
    status: 'recorded' as const,
    client_mode: clientMode,
    user_id: input.user_id,
    candidate_id: input.candidate_id,
    board: input.board,
    action: input.action,
    dwell_time_ms: dwellMs,
    staged_webp_path: stagedWebpPath,
    board_affinity: feedbackResult.board_affinity,
    positive_session_count: feedbackResult.positive_session_count,
    negative_session_count: feedbackResult.negative_session_count,
    compaction_triggered: feedbackResult.compaction_triggered,
    negative_constraints: feedbackResult.user_taste.negative_constraints,
    embedding_space: feedbackResult.embedding_space,
  };

  if (clientMode === 'codex') {
    const md = [
      `# Feedback Visual Registrado (\`${input.action}\`)`,
      `- **Candidato:** \`${input.candidate_id}\` | **Board:** \`${input.board}\``,
      `- **Afinidade Beta-Bernoulli Atualizada:** \`${feedbackResult.board_affinity.affinity_score.toFixed(4)}\` (S=${feedbackResult.board_affinity.positive_actions}, N=${feedbackResult.board_affinity.total_impressions})`,
      `- **Sessão:** +${feedbackResult.positive_session_count} positivos / -${feedbackResult.negative_session_count} negativos`,
      `- **Compactação de Memória Longo Prazo:** \`${feedbackResult.compaction_triggered}\``,
      stagedWebpPath ? `- **Ativo Sanitizado (WebP):** \`${stagedWebpPath}\`` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      content: [{ type: 'text' as const, text: md }],
      structuredContent: {
        ...webFeedbackPayload,
        markdown: md,
      },
    };
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(webFeedbackPayload) }],
    structuredContent: webFeedbackPayload,
  };
}
