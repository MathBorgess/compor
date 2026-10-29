import { z } from 'zod';
import { sanitize_and_stage_image } from '../../security/image_sanitizer.js';
import { sanitize_external_metadata } from '../../security/text_sanitizer.js';
import type { EphemeralReferenceStore } from '../../staging/ephemeral_store.js';
import { writePreviewBoard } from '../../staging/preview_board.js';
import type { PhoenixHyperparams } from '../config/hyperparams.js';
import { inferCandidateSid } from '../domain/catalog.js';
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
} from '../math/formulas.js';
import {
  computeDeterministicEmbedding,
  type CandidateToRank,
  type PhoenixDecisionApiService,
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
}

function buildCandidatesFromAllocations(params: {
  allocations: BoardAllocation[];
  target_format: string;
  briefing: string;
  session_id: string;
  staging_root: string;
  hp: PhoenixHyperparams;
}): CandidateToRank[] {
  const candidates: CandidateToRank[] = [];

  params.allocations.forEach((alloc, allocIdx) => {
    for (let itemIdx = 0; itemIdx < 2; itemIdx++) {
      const globalIdx = allocIdx * 2 + itemIdx;
      const candidateId = `phx_ref_${String(globalIdx + 1).padStart(2, '0')}`;
      const sid = inferCandidateSid({
        target_format: params.target_format,
        board: alloc.board,
        description: `${alloc.synthetic_query} ${alloc.rationale}`,
        index: globalIdx,
      });

      const desc =
        itemIdx === 0
          ? `[${alloc.role}] Composição principal em ${alloc.board}: ${alloc.synthetic_query}. Grid ${sid[1]} com hierarquia ${sid[2]} e atmosfera ${sid[3]}.`
          : `[${alloc.role}] Variação complementar em ${alloc.board}: estrutura ${sid[1]}, contraste ${sid[2]} e acabamento ${sid[3]}.`;

      const vec = computeDeterministicEmbedding(
        `${alloc.board} ${sid.join(' ')} ${desc}`,
        params.hp.embedding_dimension,
      );

      candidates.push({
        candidate_id: candidateId,
        board: alloc.board,
        role: alloc.role,
        metadata_sid: [...sid],
        visual_description: desc,
        preview_url: `https://i.pinimg.com/236x/phx/${encodeURIComponent(alloc.board)}/${candidateId}.jpg`,
        origin_url: `https://www.pinterest.com/${alloc.board}/`,
        staging_path: `${params.staging_root}/${params.session_id}/board.html#${candidateId}`,
        thumbnail_base64: null,
        candidate_vec: vec,
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

  // Estágio 1: Decision Router + User Tower Vector Fusion
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

  const combinedSyntheticQuery = [
    input.briefing,
    ...routerDecision.board_allocations.map((a) => a.synthetic_query),
  ].join(' | ');
  const queryVec = await deps.decisionService.embedText(
    combinedSyntheticQuery,
    input.openai_api_key,
  );

  const userTowerVec = compute_user_tower_embedding(
    queryVec,
    userRecord.pos_session_vecs,
    userRecord.neg_session_vecs,
    userRecord.long_term_vec,
    deps.hp,
  );

  const rawCandidates = buildCandidatesFromAllocations({
    allocations: routerDecision.board_allocations,
    target_format: input.target_format,
    briefing: input.briefing,
    session_id: sessionId,
    staging_root: deps.referenceStore.getStagingRoot(),
    hp: deps.hp,
  });

  // Registra os candidatos no EphemeralReferenceStore e gera o preview board.html (zero-download de imagens na busca)
  const sanitizedForStore = rawCandidates.map((c) => {
    const { untrusted_external_caption } = sanitize_external_metadata({
      title: `${c.board} (${c.metadata_sid.join(', ')})`,
      caption: c.visual_description,
      alt_text: c.visual_description,
    });
    return {
      preferred_ref_id: c.candidate_id,
      source_id: 'pinterest_curated_design',
      origin_url: c.origin_url,
      preview_url: c.preview_url,
      media_url: c.preview_url.replace('/236x/', '/736x/'),
      aspect_rationale: {
        composition: c.visual_description,
        typography: `Hierarquia ${c.metadata_sid[2] ?? 'bold_display_hook'}`,
        color: `Estética ${c.metadata_sid[3] ?? 'executive_clean_b2b'}`,
      },
      untrusted_external_caption,
      thumbnail_base64: c.thumbnail_base64 ?? null,
    };
  });

  const registeredInStore = deps.referenceStore.registerSearchCandidates(
    sessionId,
    sanitizedForStore,
  );
  const boardHtmlPath = await writePreviewBoard({
    session_id: sessionId,
    briefing_summary: input.briefing,
    target_format: input.target_format,
    aspect_focus: ['composition', 'typography', 'color'],
    candidates: registeredInStore,
    staging_root: deps.referenceStore.getStagingRoot(),
  });

  // Estágio 2: Candidate-Isolated Parallel Ranker (100% KV-Cache Prefix Hit)
  const isolatedRanked = await Promise.all(
    rawCandidates.map(async (candidate) => {
      const stagedRecord = deps.referenceStore.getStagedReference(candidate.candidate_id);
      const effectiveStagingPath = stagedRecord
        ? stagedRecord.local_path
        : `${boardHtmlPath}#${candidate.candidate_id}`;

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

      const candVec =
        candidate.candidate_vec ??
        computeDeterministicEmbedding(
          `${candidate.board} ${candidate.metadata_sid.join(' ')} ${candidate.visual_description}`,
          deps.hp.embedding_dimension,
        );
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

  // Pós-Ranking: Decaimento de Diversidade por Prefixo SID
  const decayedCandidates = apply_sid_diversity_decay(
    isolatedRanked,
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
    excluded_sid_tags: routerDecision.excluded_sid_tags,
    board_affinities: deps.memoryStore.getBoardAffinities(userId).slice(0, 12),
    candidates: topCandidates,
    telemetry: {
      total_candidates_evaluated: rawCandidates.length,
      exploration_quota_allocated: Math.min(1.0, Math.round(explorationWeightTotal * 10000) / 10000),
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
  },
  deps: PhoenixDualAdapterDependencies,
) {
  const clientMode: ClientMode = input.client_mode ?? 'codex';
  const dwellMs = input.dwell_time_ms ?? 0;

  const candidateVec = computeDeterministicEmbedding(
    `${input.board} ${input.metadata_sid.join(' ')} ${input.candidate_id}`,
    deps.hp.embedding_dimension,
  );

  const feedbackResult = await deps.memoryStore.recordFeedback({
    user_id: input.user_id,
    candidate_id: input.candidate_id,
    board: input.board,
    metadata_sid: input.metadata_sid,
    action: input.action,
    dwell_time_ms: dwellMs,
    candidate_vec: candidateVec,
    consolidator: async ({ user_id, previous_taste, session_events }) =>
      deps.decisionService.consolidateMemory({
        user_id,
        previous_taste,
        session_events,
        source: 'deterministic_mock',
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
