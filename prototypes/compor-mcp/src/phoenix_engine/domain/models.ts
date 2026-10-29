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

export const routerDecisionSchema = z.strictObject({
  board_allocations: z.array(boardAllocationSchema).min(2).max(4),
  required_sid_tags: z.array(z.string().trim().min(1).max(80)).max(12),
  excluded_sid_tags: z.array(z.string().trim().min(1).max(80)).max(20),
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

export const rankedCandidateSchema = z.strictObject({
  candidate_id: z.string().trim().min(1).max(80),
  board: z.string().trim().min(1).max(120),
  role: compositionalRoleSchema.optional(),
  metadata_sid: z.array(z.string().trim().min(1).max(80)).min(1).max(6),
  visual_description: z.string().trim().min(1).max(1000),
  preview_url: z.string().trim().min(1).max(1000),
  origin_url: z.string().trim().min(1).max(1000),
  staging_path: z.string().trim().min(1).max(500),
  action_probs: actionProbabilitiesSchema,
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
  board_allocations: z.array(boardAllocationSchema),
  required_sid_tags: z.array(z.string()),
  excluded_sid_tags: z.array(z.string()),
  board_affinities: z.array(boardAffinityEntrySchema),
  candidates: z.array(rankedCandidateSchema),
  telemetry: z.strictObject({
    total_candidates_evaluated: z.number().int().nonnegative(),
    exploration_quota_allocated: z.number().min(0.0).max(1.0),
    user_tower_dimension: z.number().int().positive(),
    positive_session_events: z.number().int().nonnegative(),
    negative_session_events: z.number().int().nonnegative(),
    board_html_path: z.string().nullable(),
  }),
});
export type WebDiscoveryResponse = z.infer<typeof webDiscoveryResponseSchema>;
