import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { PhoenixHyperparams } from '../config/hyperparams.js';
import {
  CANONICAL_BOARD_SLUGS,
  EXPLORATION_FEED_BOARDS,
  ROLE_RECOMMENDED_BOARDS,
  SID_TAXONOMY,
  type BoardSlug,
  type CompositionalRole,
} from '../domain/catalog.js';
import {
  actionProbabilitiesSchema,
  routerDecisionSchema,
  type ActionProbabilities,
  type BoardAffinityEntry,
  type BoardAllocation,
  type ClientMode,
  type DecisionFallbackMode,
  type RouterDecision,
  type SessionEvent,
  type UserTasteProfile,
} from '../domain/models.js';
import { cosine_similarity, l2_normalize } from '../math/formulas.js';
import {
  formatBoardRouterPrompts,
  formatRankerCachedUserPrefix,
  formatRankerIsolatedCandidateSuffix,
  MEMORY_CONSOLIDATOR_SYSTEM_PROMPT,
  RANKER_CACHED_PREFIX_SYSTEM_PROMPT,
} from '../prompts/decision_prompts.js';

export type DecisionEngineSource =
  | 'openai_api'
  | 'codex_luna_subagent'
  | 'deterministic_mock';

export interface CandidateToRank {
  candidate_id: string;
  board: string;
  role?: CompositionalRole;
  metadata_sid: string[];
  visual_description: string;
  preview_url: string;
  origin_url: string;
  staging_path: string;
  thumbnail_base64?: string | null;
  candidate_vec?: number[];
}

export interface SubagentLunaRunner {
  (prompt: string, schemaName: string): Promise<string | null> | string | null;
}

export interface PhoenixDecisionServiceOptions {
  hp: PhoenixHyperparams;
  openaiClient?: OpenAI;
  apiKey?: string;
  subagentRunner?: SubagentLunaRunner;
  forceDeterministicMock?: boolean;
  useDecisionsEndpointForRanker?: boolean;
}

/**
 * Gera um embedding semântico determinístico local de dimensão fixa (L2-normalizado),
 * sensível aos tokens de composição, formato e Semantic IDs (SIDs).
 */
export function computeDeterministicEmbedding(
  text: string,
  dimension = 32,
): number[] {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const tokens = normalized.split(/[^a-z0-9_:+-]+/).filter((t) => t.length >= 2);
  const vec = new Array<number>(dimension).fill(0);

  if (tokens.length === 0) {
    vec[0] = 1.0;
    return l2_normalize(vec);
  }

  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    for (let i = 0; i < 4; i++) {
      const dimIdx = hash[i]! % dimension;
      const sign = (hash[i + 4]! & 1) === 0 ? 1.0 : -1.0;
      const magnitude = 0.5 + (hash[i + 8]! / 255.0);
      vec[dimIdx]! += sign * magnitude;
    }
  }

  return l2_normalize(vec);
}

/**
 * Executa um turno isolado no subagente `gpt-6-luna` via Codex CLI quando disponível.
 */
export function defaultCodexLunaSubagentRunner(
  prompt: string,
  _schemaName: string,
): string | null {
  try {
    const res = spawnSync(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--model',
        'gpt-6-luna',
        '-c',
        'web_search="disabled"',
        '-',
      ],
      {
        input: prompt,
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (res.status !== 0 || !res.stdout) {
      return null;
    }
    const trimmed = res.stdout.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : null;
  } catch {
    return null;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.0;
  return Math.max(0.0, Math.min(1.0, Math.round(value * 10000) / 10000));
}

export class PhoenixDecisionApiService {
  private readonly hp: PhoenixHyperparams;
  private readonly injectedOpenAI?: OpenAI;
  private readonly configuredApiKey?: string;
  private readonly subagentRunner: SubagentLunaRunner;
  private readonly forceDeterministicMock: boolean;
  private readonly useDecisionsEndpointForRanker: boolean;

  constructor(options: PhoenixDecisionServiceOptions) {
    this.hp = options.hp;
    this.injectedOpenAI = options.openaiClient;
    this.configuredApiKey = options.apiKey;
    this.subagentRunner = options.subagentRunner ?? defaultCodexLunaSubagentRunner;
    this.forceDeterministicMock = options.forceDeterministicMock ?? false;
    this.useDecisionsEndpointForRanker = options.useDecisionsEndpointForRanker ?? false;
  }

  resolveApiKey(requestApiKey?: string): string | undefined {
    const candidate =
      requestApiKey?.trim() ||
      this.configuredApiKey?.trim() ||
      process.env.OPENAI_API_KEY?.trim();
    return candidate && candidate.length > 0 ? candidate : undefined;
  }

  private getOpenAIClient(requestApiKey?: string): OpenAI | null {
    if (this.injectedOpenAI) return this.injectedOpenAI;
    const key = this.resolveApiKey(requestApiKey);
    if (!key) return null;
    return new OpenAI({ apiKey: key });
  }

  /**
   * Resolve qual backend de decisão será usado (OpenAI API, Subagente Luna no Codex ou Mock Determinístico)
   * conforme Q6/Q8/Q9.
   */
  resolveExecutionStrategy(params: {
    client_mode: ClientMode;
    fallback_mode?: DecisionFallbackMode;
    openai_api_key?: string;
  }): {
    source: DecisionEngineSource;
    requires_api_key_prompt: boolean;
    api_key_notice?: string;
  } {
    const mode = params.fallback_mode ?? 'ask_or_luna';
    if (this.forceDeterministicMock || mode === 'deterministic_mock') {
      return {
        source: 'deterministic_mock',
        requires_api_key_prompt: false,
      };
    }

    const apiKey = this.resolveApiKey(params.openai_api_key);
    if (apiKey || this.injectedOpenAI) {
      return {
        source: 'openai_api',
        requires_api_key_prompt: false,
      };
    }

    if (mode === 'require_key') {
      return {
        source: 'deterministic_mock',
        requires_api_key_prompt: true,
        api_key_notice:
          'OPENAI_API_KEY não configurada. Informe `openai_api_key` na chamada da tool `discover_visual_references` para executar o modelo de decisão via OpenAI API ou use `decision_fallback_mode: "luna_subagent"` para delegar ao subagente `gpt-6-luna`.',
      };
    }

    if (params.client_mode === 'codex') {
      return {
        source: 'codex_luna_subagent',
        requires_api_key_prompt: false,
        api_key_notice:
          'OPENAI_API_KEY ausente: decisões executadas via subagente `gpt-6-luna`. Caso deseje chamar diretamente a OpenAI Responses/Decisions API, informe `openai_api_key` na chamada.',
      };
    }

    return {
      source: 'deterministic_mock',
      requires_api_key_prompt: false,
    };
  }

  async embedText(text: string, requestApiKey?: string): Promise<number[]> {
    if (this.forceDeterministicMock) {
      return computeDeterministicEmbedding(text, this.hp.embedding_dimension);
    }
    const client = this.getOpenAIClient(requestApiKey);
    if (client) {
      try {
        const response = await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
          dimensions: this.hp.embedding_dimension,
        });
        const vec = response.data?.[0]?.embedding;
        if (Array.isArray(vec) && vec.length === this.hp.embedding_dimension) {
          return l2_normalize(vec);
        }
      } catch {
        // Fallback determinístico caso offline
      }
    }
    return computeDeterministicEmbedding(text, this.hp.embedding_dimension);
  }

  /**
   * Estágio 1: Decision Router Visual (aloca 2 a 4 boards complementares por papel composicional).
   */
  async routeBoards(params: {
    user_id: string;
    briefing: string;
    target_format: string;
    user_taste: UserTasteProfile;
    board_affinities: BoardAffinityEntry[];
    board_affinity_table: string;
    session_events_summary: string;
    source: DecisionEngineSource;
    openai_api_key?: string;
  }): Promise<RouterDecision> {
    const { systemPrompt, userPrompt } = formatBoardRouterPrompts({
      exploration_quota: this.hp.exploration_feed_quota,
      user_taste_json: JSON.stringify(params.user_taste, null, 2),
      board_affinity_table: params.board_affinity_table,
      session_events_summary: params.session_events_summary,
      target_format: params.target_format,
      user_briefing: params.briefing,
    });

    if (params.source === 'openai_api') {
      const client = this.getOpenAIClient(params.openai_api_key);
      if (client) {
        try {
          const response = await client.responses.create({
            model: 'gpt-6-luna',
            prompt_cache_key: `phoenix_router_${params.user_id}`,
            input: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'phoenix_board_router_decision',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['board_allocations', 'required_sid_tags', 'excluded_sid_tags'],
                  properties: {
                    board_allocations: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 4,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['board', 'role', 'weight', 'synthetic_query', 'rationale'],
                        properties: {
                          board: { type: 'string', enum: [...CANONICAL_BOARD_SLUGS] },
                          role: {
                            type: 'string',
                            enum: [
                              'hook_cover',
                              'structural_grid',
                              'ui_component',
                              'conversion_cta',
                              'wildcard_exploration',
                            ],
                          },
                          weight: { type: 'number' },
                          synthetic_query: { type: 'string' },
                          rationale: { type: 'string' },
                        },
                      },
                    },
                    required_sid_tags: { type: 'array', items: { type: 'string' } },
                    excluded_sid_tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          });
          if (response.output_text) {
            const parsed = routerDecisionSchema.safeParse(JSON.parse(response.output_text));
            if (parsed.success) {
              return this.enforceExplorationQuota(parsed.data);
            }
          }
        } catch {
          // Fallback para heurística determinística se a chamada falhar
        }
      }
    } else if (params.source === 'codex_luna_subagent') {
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}\n\nResponda APENAS um objeto JSON válido com as chaves: board_allocations, required_sid_tags, excluded_sid_tags.`;
      const rawJson = await this.subagentRunner(combinedPrompt, 'phoenix_board_router_decision');
      if (rawJson) {
        try {
          const parsed = routerDecisionSchema.safeParse(JSON.parse(rawJson));
          if (parsed.success) {
            return this.enforceExplorationQuota(parsed.data);
          }
        } catch {
          // Segue para roteamento determinístico se JSON do subagente for inválido
        }
      }
    }

    return this.deterministicRouteBoards(params);
  }

  private enforceExplorationQuota(decision: RouterDecision): RouterDecision {
    const maxQuota = this.hp.exploration_feed_quota;
    const allocations = decision.board_allocations.map((alloc) => {
      if (alloc.role === 'wildcard_exploration' || alloc.board.endsWith('/feed')) {
        return {
          ...alloc,
          weight: Math.min(alloc.weight, maxQuota),
        };
      }
      return alloc;
    });
    return {
      ...decision,
      board_allocations: allocations,
    };
  }

  private deterministicRouteBoards(params: {
    briefing: string;
    target_format: string;
    user_taste: UserTasteProfile;
    board_affinities: BoardAffinityEntry[];
  }): RouterDecision {
    const affinityMap = new Map<string, number>();
    for (const entry of params.board_affinities) {
      affinityMap.set(entry.board, entry.affinity_score);
    }

    const ctx = `${params.target_format} ${params.briefing}`.toLowerCase();
    const isLinkedin =
      ctx.includes('linkedin') || ctx.includes('b2b') || ctx.includes('infografico');
    const isStory =
      ctx.includes('story') || ctx.includes('stories') || ctx.includes('9:16');
    const isAd =
      ctx.includes('ad') || ctx.includes('anuncio') || ctx.includes('conversao') || ctx.includes('oferta');

    const pickBestFromPool = (pool: readonly BoardSlug[], fallback: BoardSlug): BoardSlug => {
      const sorted = [...pool].sort((a, b) => {
        const affA = affinityMap.get(a) ?? 0.5;
        const affB = affinityMap.get(b) ?? 0.5;
        return affB - affA;
      });
      return sorted[0] ?? fallback;
    };

    const hookBoard = pickBestFromPool(
      ROLE_RECOMMENDED_BOARDS.hook_cover,
      'behance/typography',
    );
    const gridBoard = pickBestFromPool(
      isLinkedin
        ? [
            'hubspot/marketing-infographics',
            'venngage/infographic-design',
            'vismeapp/business-infographics',
            'piktochart/best-of-piktochart-infographics',
          ]
        : ROLE_RECOMMENDED_BOARDS.structural_grid,
      'creativemarket/magazine-templates',
    );
    const thirdRole: CompositionalRole = isAd ? 'conversion_cta' : 'ui_component';
    const thirdBoard = pickBestFromPool(
      isAd
        ? ROLE_RECOMMENDED_BOARDS.conversion_cta
        : isStory
          ? ['latermedia/instagram-stories', 'dribbble/uiux-inspiration', 'behance/interaction-design']
          : ROLE_RECOMMENDED_BOARDS.ui_component,
      isAd ? 'kittldesign/ads-designs' : 'dribbble/design-inspiration',
    );
    const explorationBoard = pickBestFromPool(
      EXPLORATION_FEED_BOARDS,
      'dribbble/feed',
    );

    const explorationWeight = Math.round(this.hp.exploration_feed_quota * 100) / 100;
    const remainingWeight = Math.max(0.1, 1.0 - explorationWeight);
    const wHook = Math.round(remainingWeight * 0.4 * 100) / 100;
    const wGrid = Math.round(remainingWeight * 0.35 * 100) / 100;
    const wThird = Math.max(0.05, Math.round((remainingWeight - wHook - wGrid) * 100) / 100);

    const allocations: BoardAllocation[] = [
      {
        board: hookBoard,
        role: 'hook_cover',
        weight: wHook,
        synthetic_query: `${params.briefing} — foco em impacto tipográfico de abertura, contraste focal e hierarquia de título (${params.target_format})`,
        rationale: 'Board especializado em tipografia expressiva e gancho visual de capa.',
      },
      {
        board: gridBoard,
        role: 'structural_grid',
        weight: wGrid,
        synthetic_query: `${params.briefing} — diagramação modular em colunas, fluxo de leitura escaneável e margens consistentes`,
        rationale: 'Board forte em arquitetura de informação, grids editoriais e cadência estrutural.',
      },
      {
        board: thirdBoard,
        role: thirdRole,
        weight: wThird,
        synthetic_query: `${params.briefing} — componentes visuais, cards de prova social/CTA e acabamento de interface`,
        rationale:
          thirdRole === 'conversion_cta'
            ? 'Board focado em clareza comercial, destaque de produto e CTA de conversão.'
            : 'Board focado em componentes modulares, Bento grids e acabamento de interface.',
      },
    ];

    if (explorationWeight > 0) {
      allocations.push({
        board: explorationBoard,
        role: 'wildcard_exploration',
        weight: explorationWeight,
        synthetic_query: `${params.briefing} — exploração estética out-of-network para oxigenar direção de arte`,
        rationale: `Pool /feed de exploração limitado à cota máxima de ${(explorationWeight * 100).toFixed(0)}%.`,
      });
    }

    const requiredSids: string[] = [
      isLinkedin
        ? 'linkedin_infographic'
        : isStory
          ? 'story_interactive_9:16'
          : isAd
            ? 'ad_performance_4:5'
            : 'carousel_editorial_4:5',
      ctx.includes('bento') ? 'bento_grid' : 'swiss_grid',
    ];

    const excludedSids = [...params.user_taste.negative_constraints];

    return {
      board_allocations: allocations,
      required_sid_tags: requiredSids,
      excluded_sid_tags: excludedSids,
    };
  }

  /**
   * Estágio 2: Candidate-Isolated Parallel Ranker.
   * O prefixo fixo da sessão vem estritamente ANTES do candidato isolado,
   * garantindo 100% de Cache Hit no KV-Cache (`prompt_cache_key = phoenix_ranker_${user_id}`)
   * e invariância de lote entre os K candidatos avaliados em paralelo.
   */
  async rankSingleCandidateIsolated(params: {
    user_id: string;
    briefing: string;
    user_taste: UserTasteProfile;
    session_events_log: string;
    user_tower_vec: number[];
    candidate: CandidateToRank;
    source: DecisionEngineSource;
    openai_api_key?: string;
  }): Promise<ActionProbabilities> {
    const cachedUserPrefix = formatRankerCachedUserPrefix({
      user_taste_json: JSON.stringify(params.user_taste, null, 2),
      session_events_log: params.session_events_log,
      user_briefing: params.briefing,
    });
    const isolatedCandidateSuffix = formatRankerIsolatedCandidateSuffix({
      candidate_id: params.candidate.candidate_id,
      board: params.candidate.board,
      metadata_sid: params.candidate.metadata_sid,
      visual_description: params.candidate.visual_description,
    });
    const promptCacheKey = `phoenix_ranker_${params.user_id}`;

    if (params.source === 'openai_api') {
      const client = this.getOpenAIClient(params.openai_api_key);
      if (client) {
        if (this.useDecisionsEndpointForRanker) {
          const viaDecisions = await this.rankViaDecisionsEndpoint(
            client,
            promptCacheKey,
            cachedUserPrefix,
            isolatedCandidateSuffix,
          );
          if (viaDecisions) return viaDecisions;
        }
        try {
          const response = await client.responses.create({
            model: 'gpt-6-luna',
            prompt_cache_key: promptCacheKey,
            input: [
              { role: 'system', content: RANKER_CACHED_PREFIX_SYSTEM_PROMPT },
              {
                role: 'user',
                content: `${cachedUserPrefix}\n\n${isolatedCandidateSuffix}`,
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'phoenix_isolated_candidate_Action_probs',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'p_use_as_layout_grid',
                    'p_use_as_typography_hook',
                    'p_use_color_and_vibe',
                    'p_high_conversion_clarity',
                    'p_dwell_engagement',
                    'p_reject_too_generic',
                    'p_reject_style_mismatch',
                    'composition_guideline',
                  ],
                  properties: {
                    p_use_as_layout_grid: { type: 'number' },
                    p_use_as_typography_hook: { type: 'number' },
                    p_use_color_and_vibe: { type: 'number' },
                    p_high_conversion_clarity: { type: 'number' },
                    p_dwell_engagement: { type: 'number' },
                    p_reject_too_generic: { type: 'number' },
                    p_reject_style_mismatch: { type: 'number' },
                    composition_guideline: { type: 'string' },
                  },
                },
              },
            },
          });
          if (response.output_text) {
            const parsed = actionProbabilitiesSchema.safeParse(JSON.parse(response.output_text));
            if (parsed.success) {
              return parsed.data;
            }
          }
        } catch {
          // Fallback para cálculo isolado determinístico
        }
      }
    } else if (params.source === 'codex_luna_subagent') {
      const subagentPrompt = `${RANKER_CACHED_PREFIX_SYSTEM_PROMPT}\n\n${cachedUserPrefix}\n\n${isolatedCandidateSuffix}\n\nRetorne APENAS um JSON com as probabilidades calibradas (0.00 a 1.00): p_use_as_layout_grid, p_use_as_typography_hook, p_use_color_and_vibe, p_high_conversion_clarity, p_dwell_engagement, p_reject_too_generic, p_reject_style_mismatch, composition_guideline.`;
      const rawJson = await this.subagentRunner(
        subagentPrompt,
        'phoenix_isolated_candidate_action_probs',
      );
      if (rawJson) {
        try {
          const parsed = actionProbabilitiesSchema.safeParse(JSON.parse(rawJson));
          if (parsed.success) {
            return parsed.data;
          }
        } catch {
          // Fallback para cálculo isolado determinístico
        }
      }
    }

    return this.deterministicRankSingleCandidateIsolated(params);
  }

  /**
   * Método nativo usando `client.decisions.create` (exclusivo do modelo `gpt-6-luna`)
   * com breakpoint explícito de cache no fim do prefixo fixo da sessão.
   */
  private async rankViaDecisionsEndpoint(
    client: OpenAI,
    promptCacheKey: string,
    cachedUserPrefix: string,
    isolatedCandidateSuffix: string,
  ): Promise<ActionProbabilities | null> {
    try {
      const decision = await client.decisions.create({
        model: 'gpt-6-luna',
        prompt_cache_key: promptCacheKey,
        prompt_cache_options: { mode: 'explicit', ttl: '30m' },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: RANKER_CACHED_PREFIX_SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: cachedUserPrefix,
                prompt_cache_breakpoint: { mode: 'explicit' },
              },
              {
                type: 'input_text',
                text: isolatedCandidateSuffix,
              },
            ],
          },
        ],
        questions: [
          {
            type: 'predicate',
            name: 'p_use_as_layout_grid',
            instructions: 'O usuário adotará a estrutura de colunas, margens ou grid desta referência.',
          },
          {
            type: 'predicate',
            name: 'p_use_as_typography_hook',
            instructions: 'O usuário usará o tratamento tipográfico e hierarquia de título como gancho.',
          },
          {
            type: 'predicate',
            name: 'p_use_color_and_vibe',
            instructions: 'O usuário adotará a direção de arte, textura e atmosfera cromática.',
          },
          {
            type: 'predicate',
            name: 'p_high_conversion_clarity',
            instructions: 'A peça possui alta clareza comercial, escaneabilidade rápida e contraste de CTA.',
          },
          {
            type: 'predicate',
            name: 'p_dwell_engagement',
            instructions: 'O usuário vai parar o scroll e inspecionar os detalhes desta composição.',
          },
          {
            type: 'predicate',
            name: 'p_reject_too_generic',
            instructions: 'O usuário rejeitará esta peça por parecer um template genérico ou clichê.',
          },
          {
            type: 'predicate',
            name: 'p_reject_style_mismatch',
            instructions: 'Esta peça conflita com as restrições negativas ou rejeições recentes da sessão.',
          },
        ],
      });

      const probs: Record<string, number> = {};
      for (const ans of decision.answers) {
        if (ans.type === 'predicate' && ans.name) {
          probs[ans.name] = clamp01(ans.probability);
        }
      }
      return {
        p_use_as_layout_grid: probs.p_use_as_layout_grid ?? 0.5,
        p_use_as_typography_hook: probs.p_use_as_typography_hook ?? 0.5,
        p_use_color_and_vibe: probs.p_use_color_and_vibe ?? 0.5,
        p_high_conversion_clarity: probs.p_high_conversion_clarity ?? 0.5,
        p_dwell_engagement: probs.p_dwell_engagement ?? 0.5,
        p_reject_too_generic: probs.p_reject_too_generic ?? 0.1,
        p_reject_style_mismatch: probs.p_reject_style_mismatch ?? 0.1,
        composition_guideline:
          'Aplicar grid e hierarquia focal avaliados via OpenAI Decisions API (gpt-6-luna).',
      };
    } catch {
      return null;
    }
  }

  /**
   * Avaliador isolado determinístico (depende EXCLUSIVAMENTE do candidato avaliado,
   * do vetor da User Tower e das restrições do usuário — garantindo 100% de invariância de lote).
   */
  deterministicRankSingleCandidateIsolated(params: {
    briefing: string;
    user_taste: UserTasteProfile;
    user_tower_vec: number[];
    candidate: CandidateToRank;
  }): ActionProbabilities {
    const { candidate, user_tower_vec, user_taste } = params;
    const candVec =
      candidate.candidate_vec && candidate.candidate_vec.length === user_tower_vec.length
        ? candidate.candidate_vec
        : computeDeterministicEmbedding(
            `${candidate.board} ${candidate.metadata_sid.join(' ')} ${candidate.visual_description}`,
            user_tower_vec.length,
          );

    const cosSim = cosine_similarity(user_tower_vec, candVec);
    const normalizedSim = clamp01((cosSim + 1.0) / 2.0);

    const sidStr = candidate.metadata_sid.join(' ').toLowerCase();
    const descStr = `${candidate.board} ${candidate.visual_description}`.toLowerCase();
    const negList = user_taste.negative_constraints.map((c) => c.toLowerCase());

    const hasNegativeConflict = negList.some(
      (neg) =>
        neg.length > 0 &&
        (sidStr.includes(neg.replace('/', ' ')) ||
          candidate.metadata_sid.slice(0, 2).join('/').toLowerCase() === neg ||
          descStr.includes(neg)),
    );

    const isGridStrong =
      sidStr.includes('swiss_grid') ||
      sidStr.includes('bento_grid') ||
      sidStr.includes('flowchart') ||
      descStr.includes('grid') ||
      descStr.includes('infographic') ||
      descStr.includes('magazine');

    const isTypeStrong =
      sidStr.includes('bold_display_hook') ||
      sidStr.includes('kinetic_retro_type') ||
      descStr.includes('typograph') ||
      descStr.includes('poster') ||
      descStr.includes('hook');

    const isConversionStrong =
      sidStr.includes('high_contrast_cta') ||
      sidStr.includes('hero_product_d2c') ||
      sidStr.includes('ad_') ||
      descStr.includes('ads') ||
      descStr.includes('packaging');

    const isExplorationFeed = candidate.board.endsWith('/feed');

    const pLayout = clamp01(0.45 + 0.35 * normalizedSim + (isGridStrong ? 0.16 : 0.0));
    const pType = clamp01(0.42 + 0.35 * normalizedSim + (isTypeStrong ? 0.18 : 0.0));
    const pVibe = clamp01(0.48 + 0.32 * normalizedSim + (isExplorationFeed ? 0.08 : 0.05));
    const pConversion = clamp01(0.44 + 0.34 * normalizedSim + (isConversionStrong ? 0.17 : 0.04));
    const pDwell = clamp01(0.50 + 0.35 * normalizedSim);
    const pGeneric = clamp01(isExplorationFeed ? 0.18 : 0.08 + (1.0 - normalizedSim) * 0.15);
    const pMismatch = clamp01(hasNegativeConflict ? 0.85 : 0.05 + (1.0 - normalizedSim) * 0.12);

    const l2Mechanic = candidate.metadata_sid[1] ?? SID_TAXONOMY.level_2_mechanic[0];
    const l3Hierarchy = candidate.metadata_sid[2] ?? SID_TAXONOMY.level_3_hierarchy[0];
    const l4Aesthetic = candidate.metadata_sid[3] ?? SID_TAXONOMY.level_4_aesthetic[0];

    return {
      p_use_as_layout_grid: pLayout,
      p_use_as_typography_hook: pType,
      p_use_color_and_vibe: pVibe,
      p_high_conversion_clarity: pConversion,
      p_dwell_engagement: pDwell,
      p_reject_too_generic: pGeneric,
      p_reject_style_mismatch: pMismatch,
      composition_guideline: `Estruturar layout com mecânica ${l2Mechanic}, hierarquia tipográfica ${l3Hierarchy} e direção cromática ${l4Aesthetic} inspirada em ${candidate.board}.`,
    };
  }

  /**
   * Estágio 3: Consolidador de memória estética de longo prazo (< 300 tokens).
   */
  async consolidateMemory(params: {
    user_id: string;
    previous_taste: UserTasteProfile;
    session_events: SessionEvent[];
    source: DecisionEngineSource;
    openai_api_key?: string;
  }): Promise<{
    updated_taste: UserTasteProfile;
    long_term_vec: number[];
  }> {
    const userLog = JSON.stringify(
      {
        previous_taste: params.previous_taste,
        session_events: params.session_events.slice(-15),
      },
      null,
      2,
    );

    if (params.source === 'openai_api') {
      const client = this.getOpenAIClient(params.openai_api_key);
      if (client) {
        try {
          const response = await client.responses.create({
            model: 'gpt-6-luna',
            input: [
              { role: 'system', content: MEMORY_CONSOLIDATOR_SYSTEM_PROMPT },
              { role: 'user', content: userLog },
            ],
          });
          if (response.output_text) {
            const parsed = JSON.parse(response.output_text) as Partial<UserTasteProfile>;
            const updated: UserTasteProfile = {
              user_id: params.user_id,
              preferred_boards_by_goal:
                parsed.preferred_boards_by_goal ?? params.previous_taste.preferred_boards_by_goal,
              visual_dna_rules: (parsed.visual_dna_rules ?? params.previous_taste.visual_dna_rules).slice(0, 10),
              negative_constraints: (
                parsed.negative_constraints ?? params.previous_taste.negative_constraints
              ).slice(0, 15),
              updated_at: new Date().toISOString(),
            };
            const vec = await this.embedText(JSON.stringify(updated), params.openai_api_key);
            return { updated_taste: updated, long_term_vec: vec };
          }
        } catch {
          // Fallback local abaixo
        }
      }
    }

    const preferredByGoal: Record<string, string[]> = {
      ...params.previous_taste.preferred_boards_by_goal,
    };
    const dnaRules = new Set<string>(params.previous_taste.visual_dna_rules);
    const negConstraints = new Set<string>(params.previous_taste.negative_constraints);

    for (const ev of params.session_events) {
      const isPositive =
        ev.action === 'locked_as_reference' ||
        (ev.action === 'expand_zoom' && ev.dwell_time_ms >= this.hp.high_dwell_threshold_ms);
      const goalKey = ev.metadata_sid[0] ?? 'general';
      if (isPositive) {
        const list = preferredByGoal[goalKey] ?? [];
        if (!list.includes(ev.board)) list.push(ev.board);
        preferredByGoal[goalKey] = list;
        if (ev.metadata_sid.length >= 2) {
          dnaRules.add(`Preferência por ${ev.metadata_sid.slice(0, 3).join(' + ')}`);
        }
      } else if (ev.action === 'discard_generic' || ev.action === 'style_mismatch') {
        const prefix = ev.metadata_sid.slice(0, this.hp.sid_prefix_depth).join('/');
        if (prefix) negConstraints.add(prefix);
      }
    }

    const updatedTaste: UserTasteProfile = {
      user_id: params.user_id,
      preferred_boards_by_goal: preferredByGoal,
      visual_dna_rules: Array.from(dnaRules).slice(0, 10),
      negative_constraints: Array.from(negConstraints).slice(0, 15),
      updated_at: new Date().toISOString(),
    };
    const vec = computeDeterministicEmbedding(
      JSON.stringify(updatedTaste),
      this.hp.embedding_dimension,
    );
    return { updated_taste: updatedTaste, long_term_vec: vec };
  }
}
