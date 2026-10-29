import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { loadSourcesCatalog, validateSourceGovernance, type SourcesCatalog } from '../../catalog/catalog.js';
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
  consent_external_search: z.boolean().default(false).describe('Autoriza busca externa nesta chamada.'),
  consent_model: z.boolean().default(false).describe('Autoriza envio ao motor externo nesta chamada.'),

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
  event_id: z.string().trim().min(1).max(120).describe('ID único da interação para evitar duplicações.'),

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

/** A source URL is a reference, never an instruction; remove tracking and fragments. */
function cleanReferenceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch { return null; }
}

/**
 * Formata a resposta do motor Phoenix de acordo com o `client_mode`:
 * - `codex`: retorna Markdown com as referências, origem sem parâmetros e diretrizes de composição.
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
    `- **Origem dos candidatos:** ${validated.candidate_origin} | **Embeddings:** ${validated.embedding_space}`,
    `- **Sem referência:** é possível continuar.`,
    ...(validated.provider_diagnostics.length ? [`- **Falhas na busca:** ${validated.provider_diagnostics.join('; ')}`] : []),
  ];

  if (options.api_key_notice) {
    lines.push(`- **Aviso de Decisão:** ${stripUrlsAndTracking(options.api_key_notice)}`);
  }

  if (validated.status === 'requires_api_key') {
    lines.push(
      '',
      '## Ação Necessária: Chave de Decisão OpenAI',
      'Configure OPENAI_API_KEY no ambiente do servidor ou escolha explicitamente o motor local.',
    );
    return lines.join('\n');
  }

  lines.push('', '## Referências Ranqueadas (Candidate Isolation + SID Diversity Decay)');

  topCandidates.forEach((cand, idx) => {
    const cleanGuideline = stripUrlsAndTracking(cand.composition_guideline);
    const cleanDesc = stripUrlsAndTracking(cand.visual_description);
    lines.push(
      `### ${idx + 1}. \`${cand.candidate_id}\` (Board: \`${cand.board}\` | Score Final: \`${cand.final_score.toFixed(2)}\` | Decay: \`${cand.diversity_multiplier.toFixed(2)}\`)`,
      `- **Origem:** ${cand.origin_kind ?? 'não informada'} | **Fonte:** ${cand.source_id ?? 'não informada'}`,
      ...(cand.origin_kind === 'provider' && cleanReferenceUrl(cand.origin_url) ? [`- **Referência:** ${cleanReferenceUrl(cand.origin_url)}`] : []),
      `- **SIDs:** \`${cand.metadata_sid.join(' > ')}\``,
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
  diagnostics: string[];
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
  if (catalog.sources.length === 0) {
    return [];
  }

  const fetchFn = params.deps.fetchFn ?? ((url, init) => globalThis.fetch(url, init));
  const providerCache = new Map<string, ReferenceSearchProvider>();

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
    const matchingSource = catalog.sources.find((s) =>
      s.allowed_boards_or_queries.includes(alloc.board),
    );
    if (!matchingSource) {
      params.diagnostics.push(`Board ${alloc.board} não encontrado no catálogo de fontes`);
      continue;
    }

    const sourceGovernance = await validateSourceGovernance({
      consent_external_search: true,
      source_ids: [matchingSource.source_id],
      catalog,
    });
    if (!sourceGovernance.allowed) {
      params.diagnostics.push(
        `Board ${alloc.board} bloqueado (${sourceGovernance.code}): ${sourceGovernance.message}`,
      );
      continue;
    }

    let provider = providerCache.get(matchingSource.source_id);
    if (!provider) {
      const customProvider =
        params.deps.providers?.get(matchingSource.source_id) ??
        (matchingSource.domain === 'pinterest.com'
          ? params.deps.providers?.get('pinterest_curated')
          : undefined);
      provider =
        customProvider ??
        (matchingSource.access_method === 'api_official'
          ? new MetaAdsProvider({ fetchFn })
          : new CuratedPinterestProvider({
              sourceId: matchingSource.source_id,
              fetchFn,
            }));
      providerCache.set(matchingSource.source_id, provider);
    }

    const boardScopedSource = {
      ...matchingSource,
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
        if (rawItem.source_id !== matchingSource.source_id) {
          params.diagnostics.push(`Fonte divergente ignorada no board ${alloc.board}`);
          continue;
        }
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
          staging_path: 'não preparada',
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
      params.diagnostics.push(`Falha na busca do board ${alloc.board}`);
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
        preview_url: `synthetic:${candidateId}`,
        origin_url: `synthetic:${candidateId}`,
        media_url: `synthetic:${candidateId}`,
        staging_path: 'não preparada',
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
    consent_external_search?: boolean;
    consent_model?: boolean;
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

  });

  const syntheticMode = input.decision_fallback_mode === 'deterministic_mock' &&
    (!deps.providers || deps.providers.size === 0);
  if (!syntheticMode) {
    const governance = await validateSourceGovernance({
      consent_external_search: input.consent_external_search === true,
      catalog: deps.catalog,
    });
    if (!governance.allowed) {
      return { isError: true, content: [{ type: 'text' as const, text: governance.message }],
        structuredContent: { status: 'blocked', code: governance.code, external_requests_made: 0 } };
    }
  }
  if (!strategy.requires_api_key_prompt && strategy.source !== 'deterministic_mock' && input.consent_model !== true) {
    return { isError: true, content: [{ type: 'text' as const, text: 'Envio ao motor externo requer consent_model: true.' }],
      structuredContent: { status: 'blocked', code: 'model_consent_required', external_requests_made: 0 } };
  }

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
      candidate_origin: syntheticMode ? 'synthetic' : 'provider',
      can_proceed_without_references: true,
      provider_diagnostics: [],
      embedding_space: 'local_deterministic_sha256',
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
    openai_api_key: undefined,
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

  const providerDiagnostics: string[] = [];
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
        diagnostics: providerDiagnostics,
      });

  // Se o servidor foi instanciado com forceDeterministicMock=true em testes sem provider nem rede,
  // usa os candidatos sintéticos de mock.
  if (
    retrievedCandidates.length === 0 && syntheticMode
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
    retrievedCandidates.filter((candidate) => !userRecord.rejected_origins.has(candidate.origin_url)),
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
      apiKey: undefined,
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
        apiKey: undefined,
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
      origin_url: cand.origin_url,
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

  // Two-Tower Retrieval (Estágio 1b): calcula a similaridade de cosseno contra a User Tower
  // e ordena/seleciona o pool de candidatos antes do ranking isolado do Estágio 2.
  const twoTowerMaxCandidates = Math.max(deps.hp.top_n_results * 2, 12);
  const candidatesWithTwoTowerSim = rawCandidates
    .map((candidate) => {
      const candVec = candidate.candidate_vec!;
      const cosSim =
        Math.round(cosine_similarity(userTowerVec, candVec) * 10000) / 10000;
      return { candidate, cosSim };
    })
    .sort((a, b) => b.cosSim - a.cosSim)
    .slice(0, twoTowerMaxCandidates);

  // Registra os candidatos reais para seleção posterior; as prévias ficam em memória.
  const sanitizedForStore = candidatesWithTwoTowerSim.map(({ candidate: c }) => {
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

  const registeredInStore = syntheticMode ? [] : deps.referenceStore.registerSearchCandidates(
    sessionId,
    sanitizedForStore,
  );
  const boardHtmlPath = null;

  // Estágio 2: Candidate-Isolated Parallel Ranker; cache ainda não medido.
  const isolatedRanked = await Promise.all(
    candidatesWithTwoTowerSim.map(async ({ candidate, cosSim }) => {
      const stagedRecord = deps.referenceStore.getStagedReference(candidate.candidate_id);
      const effectiveStagingPath = stagedRecord
        ? stagedRecord.local_path
        : 'não preparada (prévia disponível na conversa, quando fornecida)';

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
        openai_api_key: undefined,
      });

      const rawScore =
        Math.round(
          compute_phoenix_multi_action_score(actionProbs, deps.hp, cosSim) * 10000,
        ) / 10000;

      return {
        candidate_id: candidate.candidate_id,
        origin_kind: syntheticMode ? 'synthetic' as const : 'provider' as const,
        source_id: candidate.source_id,
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
  // Exposição contabiliza itens retornados, não confirmação de visualização humana.
  deps.memoryStore.recordExposures(userId, topCandidates.map((candidate) => deps.memoryStore.getDiscoveredCandidate(userId, candidate.candidate_id)!));

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
    candidate_origin: syntheticMode ? 'synthetic' : 'provider',
    can_proceed_without_references: true,
    provider_diagnostics: providerDiagnostics,
    embedding_space: activeEmbeddingSpace,
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
    const content: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string; data: string }> = [{ type: 'text', text: markdownText }];
    for (const candidate of topCandidates) {
      const reference = registeredInStore.find(item => item.ref_id === candidate.candidate_id);
      if (reference?.thumbnail_base64 && reference.thumbnail_mime_type) {
        content.push({ type: 'text', text: `Prévia de ${candidate.candidate_id} (fonte: ${candidate.source_id ?? 'não informada'}).` });
        content.push({ type: 'image', mimeType: reference.thumbnail_mime_type, data: reference.thumbnail_base64 });
      }
    }
    return {
      content,
      structuredContent: {
        status: 'ok' as const,
        client_mode: 'codex' as const,
        user_id: userId,
        session_token: sessionId,
        decision_engine_source: strategy.source,
        markdown: markdownText,
        top_candidates: topCandidates.map((c) => ({
          candidate_id: c.candidate_id,
          origin_kind: c.origin_kind,
          source_id: c.source_id,
          origin_url: cleanReferenceUrl(c.origin_url),
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
    event_id: string;
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
  if (!discoveredEntry || discoveredEntry.board !== input.board || JSON.stringify(discoveredEntry.metadata_sid) !== JSON.stringify(input.metadata_sid)) {
    return { isError: true, content: [{ type: 'text' as const, text: 'Candidato desconhecido ou metadados divergentes nesta sessão.' }], structuredContent: { status: 'blocked', code: 'candidate_mismatch' } };
  }
  const candidateEmbeddingText =
    discoveredEntry?.embedding_text ??
    buildCandidateEmbeddingText({
      board: input.board,
      metadata_sid: input.metadata_sid,
      visual_description: discoveredEntry?.visual_description ?? input.candidate_id,
    });

  // Um feedback não autoriza nova chamada de embedding externa.
  // Se o espaço mudou desde a descoberta, solicite nova descoberta antes de registrar.
  if (discoveredEntry.space !== userRecord.embedding_space) {
    return { isError: true, content: [{ type: 'text' as const, text: 'O espaço de embeddings mudou; faça uma nova busca antes de registrar o feedback.' }], structuredContent: { status: 'blocked', code: 'embedding_space_changed' } };
  }
  const candidateVec = discoveredEntry.vec;
  const activeSpace = discoveredEntry.space;

  const feedbackResult = await deps.memoryStore.recordFeedback({
    user_id: input.user_id,
    event_id: input.event_id,
    candidate_id: input.candidate_id,
    board: input.board,
    metadata_sid: input.metadata_sid,
    action: input.action,
    dwell_time_ms: dwellMs,
    candidate_vec: candidateVec,
    candidate_text: candidateEmbeddingText,
    embedding_space: activeSpace,

  });

  // A seleção de atributos e o download pertencem a stage_approved_references.
  const stagedWebpPath: string | null = null;

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
    duplicate: feedbackResult.duplicate ?? false,
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
