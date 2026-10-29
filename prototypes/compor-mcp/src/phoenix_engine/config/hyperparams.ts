import { z } from 'zod';

export const DEFAULT_ACTION_WEIGHTS: Record<string, number> = {
  p_use_as_layout_grid: 12.0,
  p_use_as_typography_hook: 10.0,
  p_use_color_and_vibe: 8.0,
  p_high_conversion_clarity: 15.0,
  p_dwell_engagement: 4.0,
  p_reject_too_generic: -25.0,
  p_reject_style_mismatch: -30.0,
};

export const phoenixHyperparamsSchema = z.object({
  // 1. Hiperparâmetros da User Tower (Fusão Vetorial estilo Rocchio / EMA)
  alpha_query_weight: z
    .number()
    .default(0.50)
    .describe('Peso da query sintética atual'),
  beta_positive_session: z
    .number()
    .default(0.35)
    .describe('Peso dos itens aprovados na sessão'),
  gamma_negative_session: z
    .number()
    .default(0.25)
    .describe('Penalidade vetorial dos itens rejeitados na sessão'),
  delta_long_term_taste: z
    .number()
    .default(0.20)
    .describe('Peso do vetor de gosto consolidado de longo prazo'),
  ema_session_decay: z
    .number()
    .min(0.01)
    .max(1.0)
    .default(0.85)
    .describe('Fator de decaimento temporal para cliques na mesma sessão'),

  // 2. Hiperparâmetros de Afinidade de Board (Beta-Bernoulli / Contextual Bandit)
  prior_alpha: z
    .number()
    .positive()
    .default(2.0)
    .describe('Prior de sucessos para suavização de Laplace/Beta'),
  prior_beta: z
    .number()
    .positive()
    .default(2.0)
    .describe('Prior de falhas para suavização de Laplace/Beta'),
  exploration_feed_quota: z
    .number()
    .min(0.0)
    .max(1.0)
    .default(0.20)
    .describe("Orçamento máximo alocado para boards '/feed'"),

  // 3. Pesos Multi-Ação do Ranker (Weighted Scorer do Phoenix)
  action_weights: z
    .record(z.string(), z.number())
    .default(() => ({ ...DEFAULT_ACTION_WEIGHTS }))
    .describe('Pesos calibrados por ação positiva/negativa no Weighted Scorer'),

  // 4. Pós-Ranking: Decaimento de Diversidade por Prefixo de Semantic ID
  sid_diversity_decay_factor: z
    .number()
    .min(0.01)
    .max(1.0)
    .default(0.65)
    .describe('Multiplicador gamma aplicado a prefixos SID repetidos'),
  sid_prefix_depth: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(2)
    .describe('Quantos níveis do SID definem um cluster visual repetido (ex: c1, c2)'),

  // 5. Hiperparâmetros de Sessão e Consolidação de Memória (3 Camadas)
  memory_compaction_threshold: z
    .number()
    .int()
    .positive()
    .default(5)
    .describe('Quantidade de eventos na sessão que dispara a consolidação assíncrona de longo prazo'),
  high_dwell_threshold_ms: z
    .number()
    .int()
    .nonnegative()
    .default(3000)
    .describe('Tempo mínimo de inspeção (ms) em expand_zoom para contar como sinal positivo (high_dwell)'),
  top_n_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(6)
    .describe('Quantidade máxima de candidatos retornados no Top-N final'),
  embedding_dimension: z
    .number()
    .int()
    .positive()
    .default(32)
    .describe('Dimensão vetorial padrão da User Tower / Candidate Tower local'),
});

export type PhoenixHyperparams = z.infer<typeof phoenixHyperparamsSchema>;

export function createPhoenixHyperparams(
  overrides: Partial<PhoenixHyperparams> = {},
): PhoenixHyperparams {
  return phoenixHyperparamsSchema.parse({
    ...overrides,
    action_weights: overrides.action_weights
      ? { ...DEFAULT_ACTION_WEIGHTS, ...overrides.action_weights }
      : { ...DEFAULT_ACTION_WEIGHTS },
  });
}

export function loadPhoenixHyperparamsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PhoenixHyperparams {
  const rawJson = env.PHOENIX_HYPERPARAMS_JSON?.trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as Partial<PhoenixHyperparams>;
    return createPhoenixHyperparams(parsed);
  }
  return createPhoenixHyperparams();
}
