import { z } from 'zod';
import { boardSlugSchema, compositionalRoleSchema } from './catalog.js';

export const clientModeSchema = z.enum(['codex', 'web']);
export type ClientMode = z.infer<typeof clientModeSchema>;

export const feedbackActionSchema = z.enum([
  'locked_as_reference',
  'expand_zoom',
  'discard_generic',
  'style_mismatch',
]);
export type FeedbackAction = z.infer<typeof feedbackActionSchema>;

export const decisionFallbackModeSchema = z.enum([
  'ask_or_luna',
  'luna_subagent',
  'require_key',
  'deterministic_mock',
]);
export type DecisionFallbackMode = z.infer<typeof decisionFallbackModeSchema>;

export const boardAllocationSchema = z.strictObject({
  board: boardSlugSchema,
  role: compositionalRoleSchema,
  weight: z.number().min(0.0).max(1.0),
  synthetic_query: z.string().trim().min(1).max(600),
  rationale: z.string().trim().min(1).max(400),
});
export type BoardAllocation = z.infer<typeof boardAllocationSchema>;

export const routerPieceConstraintSchema = z.strictObject({
  interpretation: z.string().trim().min(1).max(400),
  evidence_quote: z.string().trim().min(1).max(400).nullable(),
});
export const routerDecisionSchema = z.strictObject({
  board_allocations: z.array(boardAllocationSchema).min(2).max(4),
  required_sid_tags: z.array(z.string().trim().min(1).max(80)).max(12),
  excluded_sid_tags: z.array(z.string().trim().min(1).max(80)).max(20),
  piece_constraints: z.array(routerPieceConstraintSchema).max(20).optional(),
  router_excluded_sid_tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
export type RouterDecision = z.infer<typeof routerDecisionSchema>;

export const actionProbabilitiesSchema = z.strictObject({
  p_use_as_layout_grid: z.number().min(0.0).max(1.0),
  p_use_as_typography_hook: z.number().min(0.0).max(1.0),
  p_use_color_and_vibe: z.number().min(0.0).max(1.0),
  p_high_conversion_clarity: z.number().min(0.0).max(1.0),
  p_dwell_engagement: z.number().min(0.0).max(1.0),
  p_reject_too_generic: z.number().min(0.0).max(1.0),
  p_reject_style_mismatch: z.number().min(0.0).max(1.0),
  composition_guideline: z.string().trim().min(1).max(500).optional(),
});
export type ActionProbabilities = z.infer<typeof actionProbabilitiesSchema>;

export const logprobEvaluationSchema = z.strictObject({
  status: z.enum(['scored', 'abstained']),
  reason: z.enum(['ok', 'missing_client', 'provider_error', 'unexpected_output', 'invalid_logprobs', 'incomplete_categories', 'insufficient_category_mass']),
  score: z.number().nullable(),
  dominant_category: z.enum(['A', 'B', 'C', 'D']).nullable(),
  observed_probabilities: z.partialRecord(z.enum(['A', 'B', 'C', 'D']), z.number()),
  observed_category_mass: z.number(),
  conditional_probabilities: z.partialRecord(z.enum(['A', 'B', 'C', 'D']), z.number()),
  requested_model: z.string(), effective_model: z.string().nullable(), latency_ms: z.number(),
  usage: z.strictObject({ input_tokens: z.number().nullable(), output_tokens: z.number().nullable(), cached_input_tokens: z.number().nullable() }),
});

export const decisionScoreResultSchema = z.strictObject({
  candidate_id: z.string(), status: z.enum(['scored', 'unscored']),
  reason: z.enum(['ok', 'missing_client', 'provider_error', 'refused', 'missing_answer', 'invalid_answer']),
  score: z.number().nullable(), level_score: z.number().nullable(), confidence: z.number().nullable(),
  level_probabilities: z.array(z.strictObject({ label: z.string(), level: z.number(), probability: z.number(), log_probability: z.number().nullable() })),
  evidence: z.enum(['image_and_metadata', 'metadata_only', 'not_evaluated']),
  image_note: z.enum(['sent', 'not_available', 'not_authorized', 'invalid_image', 'not_sent', 'delivery_unknown']),
});
export const decisionScoreBatchSchema = z.strictObject({
  requested: z.number().int().nonnegative(), scored: z.number().int().nonnegative(), model: z.string().nullable(),
  effective_models: z.array(z.string()).optional(),
  probability_semantics: z.literal('decision_level_probabilities_not_token_logprobs'),
  candidates: z.array(decisionScoreResultSchema),
  requests: z.array(z.strictObject({ start_index: z.number().int().nonnegative().optional(), count: z.number(), model: z.string().nullable().optional(), latency_ms: z.number(), status: z.enum(['ok', 'provider_error', 'missing_client']), input_tokens: z.number().nullable(), output_tokens: z.number().nullable(), cached_input_tokens: z.number().nullable(), cache_write_tokens: z.number().nullable(), unknown_answer_count: z.number() })),
});

export const rankedCandidateSchema = z.strictObject({
  candidate_id: z.string().trim().min(1).max(80),
  origin_kind: z.enum(['synthetic', 'provider']).optional(),
  source_id: z.string().optional(),
  board: z.string().trim().min(1).max(120).describe('Board consultado; não comprova afiliação da referência.'),
  role: compositionalRoleSchema.optional(),
  provenance_occurrences: z.array(z.strictObject({board: z.string().trim().min(1).max(120).describe('Board consultado; não comprova afiliação da referência.'), role: compositionalRoleSchema, source_id: z.string(), origin_url: z.string().nullable(), preview_url: z.string().nullable(), metadata_sid: z.array(z.string()), preview_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable()})).optional(),
  metadata_sid: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
  visual_description: z.string().trim().min(1).max(1000),
  preview_url: z.string().trim().min(1).max(1000),
  origin_url: z.string().trim().min(1).max(1000),
  staging_path: z.string().trim().min(1).max(500),
  action_probs: actionProbabilitiesSchema.nullable(),
  logprob_evaluation: logprobEvaluationSchema.optional(),
  decision_evaluation: decisionScoreResultSchema.optional(),
  raw_score: z.number(),
  diversity_multiplier: z.number().min(0.0).max(1.0),
  final_score: z.number(),
  composition_guideline: z.string().trim().min(1).max(500),
  thumbnail_base64: z.string().nullable().optional(),
  user_tower_cosine_similarity: z.number().min(-1.0).max(1.0).optional(),
});
export type RankedCandidate = z.infer<typeof rankedCandidateSchema>;

export const userTasteProfileSchema = z.strictObject({
  user_id: z.string().trim().min(1).max(80),
  preferred_boards_by_goal: z.record(z.string(), z.array(z.string())),
  visual_dna_rules: z.array(z.string().trim().min(1).max(240)).max(20),
  negative_constraints: z.array(z.string().trim().min(1).max(240)).max(30),
  updated_at: z.string().trim().min(1).max(60),
});
export type UserTasteProfile = z.infer<typeof userTasteProfileSchema>;

export const sessionEventSchema = z.strictObject({
  candidate_id: z.string().trim().min(1).max(80),
  board: z.string().trim().min(1).max(120),
  metadata_sid: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
  action: feedbackActionSchema,
  dwell_time_ms: z.number().int().nonnegative(),
  timestamp_ms: z.number().int().nonnegative(),
});
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const boardAffinityEntrySchema = z.strictObject({
  board: z.string().trim().min(1).max(120),
  positive_actions: z.number().int().nonnegative(),
  total_impressions: z.number().int().nonnegative(),
  affinity_score: z.number().min(0.0).max(1.0),
});
export type BoardAffinityEntry = z.infer<typeof boardAffinityEntrySchema>;

export const webDiscoveryResponseSchema = z.strictObject({
  status: z.enum(['ok', 'requires_api_key']),
  client_mode: z.literal('web'),
  user_id: z.string().trim().min(1).max(80),
  session_token: z.string().trim().min(1).max(120),
  target_format: z.string().trim().min(1).max(80),
  briefing: z.string().trim().min(1).max(1000),
  decision_engine_source: z.enum(['openai_api', 'codex_luna_subagent', 'deterministic_mock']),
  prompt_cache_key: z.string().trim().min(1).max(160),
  candidate_origin: z.enum(['synthetic', 'provider']),
  can_proceed_without_references: z.literal(true),
  provider_diagnostics: z.array(z.string()),
  embedding_space: z.enum(['local_deterministic_sha256', 'openai_text_embedding_3_small']),
  ranker_mode: z.enum(['multi_action', 'logprobs', 'decision_score']).optional(),
  ranker_abstentions: z.array(z.strictObject({ candidate_id: z.string(), evaluation: logprobEvaluationSchema })).optional(),
  ranker_evaluations: z.array(z.strictObject({ candidate_id: z.string(), evaluation: logprobEvaluationSchema })).optional(),
  decision_score_batch: decisionScoreBatchSchema.optional(),
  board_allocations: z.array(boardAllocationSchema),
  required_sid_tags: z.array(z.string()),
  excluded_sid_tags: z.array(z.string()),
  piece_constraints: z.array(routerPieceConstraintSchema.extend({ scope:z.literal('piece'), source:z.literal('router_interpretation') })).optional(),
  reference_exclusions: z.array(z.strictObject({ tag:z.string(), source:z.enum(['router_interpretation','taste_memory_unspecified','legacy_or_unknown']) })).optional(),
  board_affinities: z.array(boardAffinityEntrySchema),
  candidates: z.array(rankedCandidateSchema),
  telemetry: z.strictObject({
    total_candidates_evaluated: z.number().int().nonnegative(),
    total_candidates_retrieved: z.number().int().nonnegative().optional(),
    total_candidate_occurrences: z.number().int().nonnegative().optional(),
    total_candidates_filtered: z.number().int().nonnegative().optional(),
    total_candidates_scored: z.number().int().nonnegative().optional(),
    exploration_quota_allocated: z.number().min(0.0).max(1.0),
    user_tower_dimension: z.number().int().positive(),
    positive_session_events: z.number().int().nonnegative(),
    negative_session_events: z.number().int().nonnegative(),
    board_html_path: z.string().nullable(),
  }),
});
export type WebDiscoveryResponse = z.infer<typeof webDiscoveryResponseSchema>;
