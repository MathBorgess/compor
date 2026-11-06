// Adapted from the Compor Phoenix prototype; see PROVENANCE.md and ADR-0019.
import { z } from 'zod';
import { boardSlugSchema, compositionalRoleSchema } from './catalog.ts';

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


export const userTasteProfileSchema = z.strictObject({
  user_id: z.string().trim().min(1).max(80),
  preferred_boards_by_goal: z.record(z.string(), z.array(z.string())),
  visual_dna_rules: z.array(z.string().trim().min(1).max(240)).max(20),
  negative_constraints: z.array(z.string().trim().min(1).max(240)).max(30),
  updated_at: z.string().trim().min(1).max(60),
});
export type UserTasteProfile = z.infer<typeof userTasteProfileSchema>;


export const boardAffinityEntrySchema = z.strictObject({
  board: z.string().trim().min(1).max(120),
  positive_actions: z.number().int().nonnegative(),
  total_impressions: z.number().int().nonnegative(),
  affinity_score: z.number().min(0.0).max(1.0),
});
export type BoardAffinityEntry = z.infer<typeof boardAffinityEntrySchema>;
