// Adapted from the Compor Phoenix prototype; see PROVENANCE.md and ADR-0019.
import type { PhoenixHyperparams } from './hyperparams.ts';
import { UNKNOWN_SID_LEVELS } from './catalog.ts';

export type NumericVector = readonly number[] | Float64Array;

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Normaliza um vetor com norma L2: v / max(||v||_2, eps).
 */
export function l2_normalize(vec: NumericVector, eps = 1e-12): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    const val = vec[i] ?? 0;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  const denom = Math.max(norm, eps);
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = (vec[i] ?? 0) / denom;
  }
  return out;
}

export const l2Normalize = l2_normalize;

/**
 * Calcula a similaridade de cosseno entre dois vetores da mesma dimensão.
 */
export function cosine_similarity(
  vecA: NumericVector,
  vecB: NumericVector,
  eps = 1e-12,
): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    throw new Error('Vetores devem ser não vazios e possuir a mesma dimensão.');
  }
  const normA = l2_normalize(vecA, eps);
  const normB = l2_normalize(vecB, eps);
  let dot = 0;
  for (let i = 0; i < normA.length; i++) {
    dot += normA[i]! * normB[i]!;
  }
  return dot;
}

export const cosineSimilarity = cosine_similarity;

/**
 * Calcula a média móvel exponencial (EMA) dos vetores de interação da sessão
 * (onde interações mais recentes no final da lista recebem peso maior).
 */
export function compute_ema_session_vector(
  vectors: ReadonlyArray<NumericVector>,
  decay: number,
): number[] {
  if (vectors.length === 0) {
    return [];
  }
  const dim = vectors[0]!.length;
  if (dim === 0) {
    return [];
  }

  const n = vectors.length;
  const weights = new Array<number>(n);
  let weightSum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(decay, n - 1 - i);
    weights[i] = w;
    weightSum += w;
  }

  const invWeightSum = weightSum > 0 ? 1.0 / weightSum : 1.0 / n;
  const accum = new Array<number>(dim).fill(0);

  for (let i = 0; i < n; i++) {
    const vec = vectors[i]!;
    if (vec.length !== dim) {
      throw new Error(`Dimensão inconsistente no vetor de sessão ${i}: esperado ${dim}, recebido ${vec.length}.`);
    }
    const w = weights[i]! * invWeightSum;
    for (let d = 0; d < dim; d++) {
      accum[d]! += (vec[d] ?? 0) * w;
    }
  }

  return l2_normalize(accum);
}

export const computeEmaSessionVector = compute_ema_session_vector;

/**
 * Fórmula da User Tower (Rocchio + Session EMA):
 * u_t = L2_norm(alpha * e_query + beta * v_pos - gamma * v_neg + delta * v_long_term)
 */
export function compute_user_tower_embedding(
  query_vec: NumericVector,
  pos_session_vecs: ReadonlyArray<NumericVector>,
  neg_session_vecs: ReadonlyArray<NumericVector>,
  long_term_vec: NumericVector | null | undefined,
  hp: PhoenixHyperparams,
): number[] {
  const dim = query_vec.length;
  if (dim === 0) {
    return [];
  }

  const normQuery = l2_normalize(query_vec);
  const combined = new Array<number>(dim);
  for (let d = 0; d < dim; d++) {
    combined[d] = hp.alpha_query_weight * normQuery[d]!;
  }

  if (pos_session_vecs.length > 0) {
    const vPos = compute_ema_session_vector(pos_session_vecs, hp.ema_session_decay);
    if (vPos.length === dim) {
      for (let d = 0; d < dim; d++) {
        combined[d]! += hp.beta_positive_session * vPos[d]!;
      }
    }
  }

  if (neg_session_vecs.length > 0) {
    const vNeg = compute_ema_session_vector(neg_session_vecs, hp.ema_session_decay);
    if (vNeg.length === dim) {
      for (let d = 0; d < dim; d++) {
        combined[d]! -= hp.gamma_negative_session * vNeg[d]!;
      }
    }
  }

  if (long_term_vec && long_term_vec.length === dim) {
    const normLongTerm = l2_normalize(long_term_vec);
    for (let d = 0; d < dim; d++) {
      combined[d]! += hp.delta_long_term_taste * normLongTerm[d]!;
    }
  }

  return l2_normalize(combined);
}

export const computeUserTowerEmbedding = compute_user_tower_embedding;

/**
 * Fórmula Beta-Bernoulli Posterior Mean para afinidade Usuário <-> Board:
 * Affinity = (alpha_0 + S) / (alpha_0 + beta_0 + N)
 */
export function compute_board_affinity_score(
  positive_actions: number,
  total_impressions: number,
  hp: PhoenixHyperparams,
): number {
  const pos = Math.max(0, positive_actions);
  const failures = Math.max(0, total_impressions - pos);
  return (hp.prior_alpha + pos) / (hp.prior_alpha + hp.prior_beta + pos + failures);
}

export const computeBoardAffinityScore = compute_board_affinity_score;

/**
 * Fórmula do Weighted Scorer do Phoenix combinada opcionalmente com a similaridade Two-Tower:
 * Score = sum_i (w_i * P(action_i)) + alpha_query_weight * cos_sim(u_t, e_cand)
 */
export function compute_phoenix_multi_action_score(
  action_probs: Readonly<Record<string, number | string | undefined>>,
  hp: PhoenixHyperparams,
  user_tower_cosine_similarity?: number,
): number {
  let score = 0.0;
  for (const [actionName, weight] of Object.entries(hp.action_weights)) {
    const rawProb = action_probs[actionName];
    const prob = typeof rawProb === 'number' && Number.isFinite(rawProb) ? rawProb : 0.0;
    score += weight * prob;
  }
  if (
    typeof user_tower_cosine_similarity === 'number' &&
    Number.isFinite(user_tower_cosine_similarity)
  ) {
    score += hp.alpha_query_weight * user_tower_cosine_similarity;
  }
  return score;
}

export const computePhoenixMultiActionScore = compute_phoenix_multi_action_score;

export interface DiversityDecayCandidateInput {
  raw_score: number;
  metadata_sid?: readonly string[];
  [key: string]: unknown;
}

export type DiversityDecayCandidateOutput<T extends DiversityDecayCandidateInput> = T & {
  diversity_multiplier: number;
  final_score: number;
};

/**
 * Aplica decaimento exponencial para evitar monotonia visual no grid:
 * Score_adj(x) = Score(x) * (gamma ^ count(prefix_SID(x)))
 * Reordena os candidatos após aplicar a penalidade de repetição de cluster.
 */
export function apply_sid_diversity_decay<T extends DiversityDecayCandidateInput>(
  ranked_candidates: ReadonlyArray<T>,
  hp: PhoenixHyperparams,
): Array<DiversityDecayCandidateOutput<T>> {
  const prefixCounts = new Map<string, number>();
  const adjustedList: Array<DiversityDecayCandidateOutput<T>> = [];

  // Ordena inicialmente pelo raw_score decrescente
  const sortedInitial = [...ranked_candidates].sort((a, b) => b.raw_score - a.raw_score);

  for (const item of sortedInitial) {
    const sidSlice = Array.isArray(item.metadata_sid)
      ? item.metadata_sid.slice(0, hp.sid_prefix_depth)
      : [];
    // Unknown is not a shared cluster and must not introduce a fictitious
    // diversity penalty merely because multiple candidates lack metadata.
    const hasSidPrefix = sidSlice.length > 0 && !sidSlice.some(sid => (UNKNOWN_SID_LEVELS as readonly string[]).includes(sid));
    const prefixKey = hasSidPrefix ? JSON.stringify(sidSlice) : '';
    const seenCount = hasSidPrefix ? (prefixCounts.get(prefixKey) ?? 0) : 0;
    const decayMultiplier = hasSidPrefix
      ? Math.pow(hp.sid_diversity_decay_factor, seenCount)
      : 1.0;

    const itemCopy: DiversityDecayCandidateOutput<T> = {
      ...item,
      diversity_multiplier: round4(decayMultiplier),
      // Penalidade aditiva para scores negativos: repetição nunca aumenta a nota.
      final_score: round4(item.raw_score >= 0
        ? item.raw_score * decayMultiplier
        : item.raw_score - Math.abs(item.raw_score) * (1 - decayMultiplier)),
    };
    adjustedList.push(itemCopy);

    if (hasSidPrefix) {
      prefixCounts.set(prefixKey, seenCount + 1);
    }
  }

  return adjustedList.sort((a, b) => b.final_score - a.final_score);
}

export const applySidDiversityDecay = apply_sid_diversity_decay;

/**
 * Verifica se a tupla `metadata_sid` de um candidato bate com qualquer padrão bloqueado
 * em `excluded_sid_tags` / `negative_constraints` (seja uma tag individual como `glassmorphism_ui`,
 * um prefixo composto como `carousel_editorial_4:5/glassmorphism_ui` ou uma combinação de tags).
 */
export function matches_excluded_sid(
  metadata_sid: readonly string[] | undefined,
  excluded_sid_patterns: readonly string[],
): boolean {
  if (!metadata_sid || metadata_sid.length === 0 || excluded_sid_patterns.length === 0) {
    return false;
  }

  const normalizedSids = metadata_sid.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (normalizedSids.length === 0) {
    return false;
  }

  const sidSet = new Set(normalizedSids);
  const prefixes = new Set<string>();
  for (let k = 1; k <= normalizedSids.length; k++) {
    prefixes.add(normalizedSids.slice(0, k).join('/'));
  }

  for (const rawPattern of excluded_sid_patterns) {
    const pat = rawPattern.trim().toLowerCase();
    if (!pat) continue;

    if (sidSet.has(pat) || prefixes.has(pat)) {
      return true;
    }

    const parts = pat
      .split(/[/>,|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0 && parts.every((part) => sidSet.has(part))) {
      return true;
    }
  }

  return false;
}

export const matchesExcludedSid = matches_excluded_sid;

/**
 * Filtra explicitamente candidatos cujo `metadata_sid` corresponda a qualquer padrão excluído
 * (`excluded_sid_tags` ou `negative_constraints`), garantindo bloqueio efetivo antes do ranking/seleção.
 */
export function filter_excluded_sid_candidates<
  T extends { metadata_sid?: readonly string[] },
>(
  candidates: ReadonlyArray<T>,
  excluded_sid_patterns: readonly string[],
): T[] {
  if (excluded_sid_patterns.length === 0) {
    return [...candidates];
  }
  return candidates.filter(
    (item) => !matches_excluded_sid(item.metadata_sid, excluded_sid_patterns),
  );
}

export const filterExcludedSidCandidates = filter_excluded_sid_candidates;
