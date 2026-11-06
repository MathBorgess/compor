// Adapted from the Compor Phoenix prototype; see PROVENANCE.md and ADR-0019.
import { createHash } from 'node:crypto';
import type { PhoenixHyperparams } from './hyperparams.ts';
import { EXPLORATION_FEED_BOARDS, inferEvidenceBasedSid, UNKNOWN_SID_LEVELS, isExplorationFeedBoard, ROLE_RECOMMENDED_BOARDS, SID_TAXONOMY, type BoardSlug, type CompositionalRole, type EvidenceSid } from './catalog.ts';
import { routerDecisionSchema, type ActionProbabilities, type BoardAffinityEntry, type BoardAllocation, type RouterDecision, type UserTasteProfile } from './models.ts';
import { cosine_similarity, l2_normalize } from './formulas.ts';

export interface CandidateToRank {
 candidate_id: string;
 board: string;
 metadata_sid: string[];
 visual_description: string;
 candidate_vec?: number[];
}

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.0;
  return Math.max(0.0, Math.min(1.0, Math.round(value * 10000) / 10000));
}

export const MAX_SYNTHETIC_QUERY_LENGTH = 600;
export const MAX_RATIONALE_LENGTH = 400;

const CONVERSATIONAL_STOPWORDS = new Set([
  'a', 'ao', 'aos', 'aquela', 'aquele', 'as', 'ate', 'com', 'como', 'criar', 'da', 'das',
  'de', 'dela', 'dele', 'depois', 'do', 'dos', 'e', 'ela', 'ele', 'em', 'entre', 'era',
  'essa', 'esse', 'esta', 'este', 'eu', 'faca', 'fazer', 'foi', 'for', 'gostaria', 'isso',
  'isto', 'ja', 'la', 'lhe', 'mais', 'mas', 'me', 'mesmo', 'meu', 'minha', 'muito', 'na',
  'nas', 'nem', 'no', 'nos', 'nossa', 'nosso', 'num', 'numa', 'o', 'os', 'ou', 'para',
  'pela', 'pelas', 'pelo', 'pelos', 'pode', 'por', 'favor', 'preciso', 'pro', 'qual',
  'quando', 'que', 'quero', 'se', 'sem', 'ser', 'seu', 'sua', 'suas', 'seus', 'so',
  'sobre', 'tambem', 'te', 'tem', 'tendo', 'tenho', 'ter', 'teu', 'tua', 'tuas', 'teus',
  'um', 'uma', 'umas', 'uns', 'vai', 'vamos', 'voce', 'voces',
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'want', 'need', 'please',
]);

const CATALOG_INDEXED_VOCABULARY = [
  'tipografia', 'typography', 'serifa', 'grotesca', 'bold', 'display', 'hook', 'headline',
  'grid', 'swiss', 'bento', 'modular', 'colunas', 'editorial', 'magazine', 'carrossel',
  'carousel', 'slides', 'story', 'stories', 'reels', 'vertical', '9:16', '4:5', '1:1',
  'linkedin', 'infografico', 'infographic', 'b2b', 'framework', 'cheatsheet', 'charts',
  'data', 'ad', 'ads', 'anuncio', 'oferta', 'conversao', 'cta', 'promo', 'varejo',
  'produto', 'packaging', 'embalagem', 'd2c', 'ecommerce', 'branding', 'identidade',
  'fotografia', 'photography', 'retrato', 'portrait', 'ilustracao', 'illustration',
  'poster', 'retro', 'textura', 'paper', 'dark', 'saas', 'tech', 'glassmorphism',
  'minimal', 'clean', 'whitespace', 'brutalist', 'luxury', 'cosmetic', 'contraste',
] as const;

const ROLE_FRONTLOAD_DESCRIPTORS: Record<CompositionalRole, string> = {
  hook_cover: 'impacto tipográfico headline capa contraste focal',
  structural_grid: 'grid modular colunas diagramação escaneável',
  ui_component: 'componentes UI cards bento interface',
  conversion_cta: 'conversão CTA destaque de produto oferta',
  wildcard_exploration: 'exploração direção de arte composição',
};

export interface DistilledBriefingIntent {
  inferred_sid: EvidenceSid;
  matched_catalog_keywords: string[];
  salient_terms: string[];
  dna_hint: string;
  compact_intent_summary: string;
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const sliced = normalized.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return sliced.slice(0, lastSpace).trim();
  }
  return sliced.trim();
}

/**
 * Estágio 1 do Multi-Step de Reformulação de Consulta (RAG Query Distillation):
 * Extrai do briefing bruto (até 1000 chars) e do perfil de gosto a tupla SID inferida,
 * os termos indexados no catálogo do Compor e o núcleo semântico compactado sem ruído conversacional.
 */
export function distillBriefingIntent(params: {
  briefing: string;
  target_format: string;
  user_taste?: UserTasteProfile;
}): DistilledBriefingIntent {
  const rawBriefing = params.briefing.replace(/\s+/g, ' ').trim();
  const dnaRules = params.user_taste?.visual_dna_rules ?? [];
  const negativeConstraints = (params.user_taste?.negative_constraints ?? []).map((c) =>
    c.toLowerCase(),
  );

  const inferredSid = inferEvidenceBasedSid({
    target_format: params.target_format,
    description: `${rawBriefing} ${dnaRules.join(' ')}`,
  });
  for (let i = 0; i < inferredSid.length; i++) {
    if (negativeConstraints.includes(inferredSid[i]!)) inferredSid[i] = UNKNOWN_SID_LEVELS[i]! as never;
  }

  const normalizedContext = `${rawBriefing} ${dnaRules.join(' ')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const isBlockedByNegative = (term: string): boolean =>
    negativeConstraints.some((neg) => neg.includes(term) || term.includes(neg));

  const matchedCatalogKeywords: string[] = [];
  for (const kw of CATALOG_INDEXED_VOCABULARY) {
    const normKw = kw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      new RegExp(`(^|[^a-z0-9])${normKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`).test(normalizedContext) &&
      !isBlockedByNegative(normKw) &&
      !matchedCatalogKeywords.includes(kw)
    ) {
      matchedCatalogKeywords.push(kw);
      if (matchedCatalogKeywords.length >= 8) break;
    }
  }

  // Extrai termos salientes distribuídos ao longo de todo o briefing (início, meio e fim)
  const rawWords = rawBriefing.split(/[^\p{L}\p{N}_:+-]+/u).filter((w) => w.length >= 3);
  const salientTerms: string[] = [];
  const seenLower = new Set<string>();
  for (const word of rawWords) {
    const cleanLower = word
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      cleanLower.length < 3 ||
      CONVERSATIONAL_STOPWORDS.has(cleanLower) ||
      seenLower.has(cleanLower) ||
      isBlockedByNegative(cleanLower)
    ) {
      continue;
    }
    seenLower.add(cleanLower);
    salientTerms.push(word);
  }

  // Preserva os termos salientes extraídos de todo o briefing (início, meio e cauda),
  // priorizando identificadores compostos/técnicos e amostragem por passo (stride) se exceder 48 termos.
  let sampledSalientTerms: string[];
  if (salientTerms.length <= 48) {
    sampledSalientTerms = salientTerms;
  } else {
    const technicalTerms = salientTerms.filter((t) => /[_0-9:-]/.test(t));
    const step = salientTerms.length / 36;
    const strided: string[] = [];
    for (let i = 0; i < 36; i += 1) {
      const idx = Math.min(salientTerms.length - 1, Math.floor(i * step));
      const candidate = salientTerms[idx];
      if (candidate) {
        strided.push(candidate);
      }
    }
    sampledSalientTerms = Array.from(
      new Set([...technicalTerms, ...strided, ...salientTerms.slice(-8)]),
    ).slice(0, 48);
  }

  // Se o briefing já é curto (<= 200 chars), preserva integralmente; se é longo, combina a cláusula inicial
  // com identificadores técnicos e termos amostrados do meio ao fim para não perder entidades da cauda (600-1000 chars).
  let compactSummary: string;
  if (rawBriefing.length <= 200) {
    compactSummary = rawBriefing;
  } else {
    const leadClause = truncateAtWordBoundary(rawBriefing, 130);
    const leadLower = leadClause
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const nonLeadTerms = salientTerms.filter((term) => {
      const norm = term
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return !leadLower.includes(norm);
    });
    let tailTerms: string[];
    if (nonLeadTerms.length <= 10) {
      tailTerms = nonLeadTerms;
    } else {
      const technical = nonLeadTerms.filter((t) => /[_0-9:-]/.test(t)).slice(0, 3);
      const step = nonLeadTerms.length / 7;
      const strided: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const idx = Math.min(nonLeadTerms.length - 1, Math.floor((i + 0.5) * step));
        const candidate = nonLeadTerms[idx];
        if (candidate) {
          strided.push(candidate);
        }
      }
      tailTerms = Array.from(
        new Set([...technical, ...strided, ...nonLeadTerms.slice(-3)]),
      ).slice(0, 10);
    }
    compactSummary =
      tailTerms.length > 0
        ? truncateAtWordBoundary(`${leadClause} [${tailTerms.join(' ')}]`, 220)
        : leadClause;
  }

  const dnaHint =
    dnaRules.length > 0
      ? truncateAtWordBoundary(dnaRules.slice(0, 2).join('; '), 90)
      : '';

  return {
    inferred_sid: inferredSid,
    matched_catalog_keywords: matchedCatalogKeywords,
    salient_terms: sampledSalientTerms,
    dna_hint: dnaHint,
    compact_intent_summary: compactSummary,
  };
}

/**
 * Estágio 2 do Multi-Step de Reformulação de Consulta (RAG Role Projection + Front-Loading Semântico):
 * Posiciona os descritores do papel composicional, SIDs inferidos e keywords do catálogo nos primeiros 120 chars
 * (otimizando `CuratedPinterestProvider.searchMetadataOnly` e o embedding da User Tower), seguidos pelo
 * resumo compactado do briefing, respeitando estritamente o limite de `boardAllocationSchema` (<= 600 chars).
 */
export function projectRoleSyntheticQuery(params: {
  distilled: DistilledBriefingIntent;
  board: BoardSlug;
  role: CompositionalRole;
  target_format: string;
  maxLength?: number;
}): string {
  const maxLen = Math.min(
    MAX_SYNTHETIC_QUERY_LENGTH,
    Math.max(80, params.maxLength ?? MAX_SYNTHETIC_QUERY_LENGTH),
  );
  const roleDesc = ROLE_FRONTLOAD_DESCRIPTORS[params.role];
  const sidPrefix = params.distilled.inferred_sid.slice(0, 3).filter(sid => !(UNKNOWN_SID_LEVELS as readonly string[]).includes(sid)).join(' ');
  const kwSnippet = params.distilled.matched_catalog_keywords.slice(0, 5).join(' ');

  // Front-loading semântico nos primeiros ~120 chars para máxima precisão no provider e na User Tower
  const frontLoadedLead = truncateAtWordBoundary(
    [roleDesc, sidPrefix, kwSnippet].filter(Boolean).join(' | '),
    115,
  );

  const dnaSegment = params.distilled.dna_hint ? ` (DNA: ${params.distilled.dna_hint})` : '';
  const combined = `${frontLoadedLead} — ${params.distilled.compact_intent_summary}${dnaSegment} [${params.target_format}]`;
  return truncateAtWordBoundary(combined, maxLen);
}

/**
 * Garante que qualquer alocação (vinda de LLM, Luna ou rota determinística) respeite os limites de
 * `boardAllocationSchema` (`synthetic_query <= 600`, `rationale <= 400`).
 */
export function boundRouterDecisionAllocations(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.board_allocations)) return raw;

  return {
    ...record,
    board_allocations: record.board_allocations.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const alloc = item as Record<string, unknown>;
      return {
        ...alloc,
        synthetic_query:
          typeof alloc.synthetic_query === 'string'
            ? truncateAtWordBoundary(alloc.synthetic_query, MAX_SYNTHETIC_QUERY_LENGTH)
            : alloc.synthetic_query,
        rationale:
          typeof alloc.rationale === 'string'
            ? truncateAtWordBoundary(alloc.rationale, MAX_RATIONALE_LENGTH)
            : alloc.rationale,
      };
    }),
  };
}

const FALLBACK_CORE_ROLE_BOARDS: ReadonlyArray<{
  role: Exclude<CompositionalRole, 'wildcard_exploration'>;
  board: BoardSlug;
}> = [
  { role: 'hook_cover', board: 'behance/typography' },
  { role: 'structural_grid', board: 'creativemarket/magazine-templates' },
  { role: 'ui_component', board: 'dribbble/design-inspiration' },
  { role: 'conversion_cta', board: 'kittldesign/ads-designs' },
];

export function isExplorationBoardAllocation(alloc: BoardAllocation): boolean {
  return alloc.role === 'wildcard_exploration' || isExplorationFeedBoard(alloc.board);
}

/**
 * Impõe a cota máxima combinada de exploração (`exploration_feed_quota`) e o limite máximo
 * de boards de exploração (`max_exploration_boards`) sobre o conjunto completo de alocações
 * de qualquer roteador (`openai_api`, `codex_luna_subagent` ou `deterministic_mock`).
 */
export function enforceExplorationQuotaOnDecision(
  decision: RouterDecision,
  hp: Pick<PhoenixHyperparams, 'exploration_feed_quota' | 'max_exploration_boards'>,
): RouterDecision {
  const maxQuota = Math.max(0, Math.min(1, hp.exploration_feed_quota));
  const configuredMaxBoards = Math.max(
    0,
    Math.min(4, Math.trunc(hp.max_exploration_boards ?? 1)),
  );
  const maxExpBoards = maxQuota < 0.0001 ? 0 : configuredMaxBoards;

  const coreAllocations: BoardAllocation[] = [];
  const rawExplorationAllocations: BoardAllocation[] = [];

  for (const alloc of decision.board_allocations) {
    if (isExplorationBoardAllocation(alloc)) {
      rawExplorationAllocations.push(alloc);
    } else {
      coreAllocations.push({ ...alloc });
    }
  }

  // Deduplica alocações de exploração por slug de board (preservando maior peso e ordem de aparição)
  const dedupedExplorationMap = new Map<
    BoardSlug,
    { alloc: BoardAllocation; order: number }
  >();
  rawExplorationAllocations.forEach((alloc, idx) => {
    const existing = dedupedExplorationMap.get(alloc.board);
    if (!existing) {
      dedupedExplorationMap.set(alloc.board, { alloc: { ...alloc }, order: idx });
    } else if (alloc.weight > existing.alloc.weight) {
      dedupedExplorationMap.set(alloc.board, {
        alloc: { ...existing.alloc, weight: alloc.weight },
        order: existing.order,
      });
    }
  });

  const sortedExploration = Array.from(dedupedExplorationMap.values())
    .sort((a, b) => {
      if (b.alloc.weight !== a.alloc.weight) {
        return b.alloc.weight - a.alloc.weight;
      }
      return a.order - b.order;
    })
    .map((entry) => entry.alloc);

  let keptExploration = sortedExploration.slice(0, maxExpBoards);
  const droppedExploration = [
    ...sortedExploration.slice(maxExpBoards),
    ...rawExplorationAllocations.slice(dedupedExplorationMap.size),
  ];

  // Se o corte de exploração deixar menos de 2 alocações totais (mínimo exigido pelo schema),
  // converte alocações excedentes em boards canônicos não-/feed para nunca buscar /feed extra.
  let fallbackIdx = 0;
  while (coreAllocations.length + keptExploration.length < 2) {
    const template = droppedExploration.shift() ?? keptExploration[0] ?? coreAllocations[0];
    const usedBoards = new Set(coreAllocations.map((c) => c.board));
    const replacementSpec =
      FALLBACK_CORE_ROLE_BOARDS.find((cand) => !usedBoards.has(cand.board)) ??
      FALLBACK_CORE_ROLE_BOARDS[fallbackIdx % FALLBACK_CORE_ROLE_BOARDS.length]!;
    fallbackIdx += 1;

    coreAllocations.push({
      board: replacementSpec.board,
      role: replacementSpec.role,
      weight: Math.min(
        1,
        Math.max(0.05, Math.round((template?.weight ?? 0.4) * 10000) / 10000),
      ),
      synthetic_query:
        template?.synthetic_query ??
        `Direção composicional para ${replacementSpec.role} em ${replacementSpec.board}`,
      rationale:
        template?.rationale ??
        'Alocação realocada para board estrutural após aplicação do limite de exploração.',
    });
  }

  // Impõe o teto combinado `maxQuota` sobre a soma de todos os boards de exploração mantidos
  if (keptExploration.length > 0) {
    const maxEffectiveCount = Math.min(
      keptExploration.length,
      Math.max(1, Math.floor(maxQuota / 0.0001)),
    );
    keptExploration = keptExploration.slice(0, maxEffectiveCount);

    const totalExpWeight = keptExploration.reduce((sum, item) => sum + item.weight, 0);
    if (totalExpWeight > maxQuota) {
      if (keptExploration.length === 1) {
        const single = keptExploration[0]!;
        keptExploration = [
          {
            ...single,
            weight: Math.max(0.0001, Math.floor(maxQuota * 10000) / 10000),
          },
        ];
      } else {
        const scale = maxQuota / totalExpWeight;
        let allocatedSoFar = 0;
        keptExploration = keptExploration.map((item, idx) => {
          if (idx === keptExploration.length - 1) {
            const remainder = Math.max(
              0.0001,
              Math.floor(Math.max(0, maxQuota - allocatedSoFar) * 10000) / 10000,
            );
            return { ...item, weight: remainder };
          }
          const scaled = Math.max(
            0.0001,
            Math.floor(item.weight * scale * 10000) / 10000,
          );
          allocatedSoFar = Math.round((allocatedSoFar + scaled) * 10000) / 10000;
          return { ...item, weight: scaled };
        });
      }
    }
  }

  const finalAllocations = [...coreAllocations, ...keptExploration].slice(0, 4);

  return routerDecisionSchema.parse({
    ...decision,
    board_allocations: finalAllocations,
  });
}

export function deterministicRouteBoards(hp: PhoenixHyperparams, params: {
    briefing: string;
    target_format: string;
    user_taste: UserTasteProfile;
    board_affinities: BoardAffinityEntry[];
  }): RouterDecision {
    const affinityMap = new Map<string, number>();
    for (const entry of params.board_affinities) {
      affinityMap.set(entry.board, entry.affinity_score);
    }

    // Estágio 1 do Multi-Step RAG: destila a intenção do briefing e o perfil de gosto
    const distilled = distillBriefingIntent({
      briefing: params.briefing,
      target_format: params.target_format,
      user_taste: params.user_taste,
    });

    const ctx = `${params.target_format} ${params.briefing}`.toLowerCase();
    const isLinkedin =
      distilled.inferred_sid[0] === 'linkedin_infographic' ||
      distilled.inferred_sid[0] === 'linkedin_framework_pdf' ||
      ctx.includes('linkedin') ||
      ctx.includes('b2b') ||
      ctx.includes('infografico');
    const isStory =
      distilled.inferred_sid[0] === 'story_interactive_9:16' ||
      ctx.includes('story') ||
      ctx.includes('stories') ||
      ctx.includes('9:16');
    const isAd =
      distilled.inferred_sid[0] === 'ad_conversion_1:1' ||
      distilled.inferred_sid[0] === 'ad_performance_4:5' ||
      /(?:^|[^a-z0-9])ads?(?=$|[^a-z0-9])/.test(ctx) ||
      ctx.includes('anuncio') ||
      ctx.includes('conversao') ||
      ctx.includes('oferta');

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

    const explorationWeight = Math.round(hp.exploration_feed_quota * 100) / 100;
    const remainingWeight = Math.max(0.1, 1.0 - explorationWeight);
    const wHook = Math.round(remainingWeight * 0.4 * 100) / 100;
    const wGrid = Math.round(remainingWeight * 0.35 * 100) / 100;
    const wThird = Math.max(0.05, Math.round((remainingWeight - wHook - wGrid) * 100) / 100);

    // Estágio 2 do Multi-Step RAG: projeta consultas sintéticas com front-loading semântico e bound <= 600 chars
    const allocations: BoardAllocation[] = [
      {
        board: hookBoard,
        role: 'hook_cover',
        weight: wHook,
        synthetic_query: projectRoleSyntheticQuery({
          distilled,
          board: hookBoard,
          role: 'hook_cover',
          target_format: params.target_format,
        }),
        rationale: 'Board especializado em tipografia expressiva e gancho visual de capa.',
      },
      {
        board: gridBoard,
        role: 'structural_grid',
        weight: wGrid,
        synthetic_query: projectRoleSyntheticQuery({
          distilled,
          board: gridBoard,
          role: 'structural_grid',
          target_format: params.target_format,
        }),
        rationale: 'Board forte em arquitetura de informação, grids editoriais e cadência estrutural.',
      },
      {
        board: thirdBoard,
        role: thirdRole,
        weight: wThird,
        synthetic_query: projectRoleSyntheticQuery({
          distilled,
          board: thirdBoard,
          role: thirdRole,
          target_format: params.target_format,
        }),
        rationale:
          thirdRole === 'conversion_cta'
            ? 'Board focado em clareza comercial, destaque de produto e CTA de conversão.'
            : 'Board focado em componentes modulares, Bento grids e acabamento de interface.',
      },
    ];

    if (explorationWeight > 0 && hp.max_exploration_boards > 0) {
      allocations.push({
        board: explorationBoard,
        role: 'wildcard_exploration',
        weight: explorationWeight,
        synthetic_query: projectRoleSyntheticQuery({
          distilled,
          board: explorationBoard,
          role: 'wildcard_exploration',
          target_format: params.target_format,
        }),
        rationale: `Pool /feed de exploração limitado à cota máxima de ${(explorationWeight * 100).toFixed(0)}%.`,
      });
    }

    const requiredSids: string[] = [
      distilled.inferred_sid[0],
      distilled.inferred_sid[1],
    ].filter(sid => !(UNKNOWN_SID_LEVELS as readonly string[]).includes(sid));

    const excludedSids = [...params.user_taste.negative_constraints].slice(0, 20);

    return enforceExplorationQuotaOnDecision(
      routerDecisionSchema.parse(
        boundRouterDecisionAllocations({
          board_allocations: allocations,
          required_sid_tags: requiredSids,
          excluded_sid_tags: excludedSids,
          router_excluded_sid_tags: [],
        }),
      ), hp,
    );
  }

export function deterministicRankSingleCandidateIsolated(params: {
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
