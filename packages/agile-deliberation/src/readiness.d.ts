export interface ReadinessInput {
  brief?: { offer?: string; audience?: string; action?: string; direction?: string };
  persona?: { audience?: string; situation?: string; need?: string };
  direction?: {
    criteria?: Array<{
      id: string;
      viewpoint: 'creator' | 'recipient';
      statement?: string;
      tension?: string;
      example?: { referenceId?: string | null };
      counterexample?: { referenceId?: string | null };
    }>;
    decisions?: Array<{ criterionId: string; choice: 'accept' | 'reject' | 'reopen'; reason?: string }>;
  };
  references?: Array<{ id: string }>;
  /** Only explicit statements made by the person, linked to the selected reference. */
  referenceFeedback?: Array<{ referenceId: string; text: string }>;
  explicitRequest?: boolean;
}

export interface ReadinessAssessment {
  level: 'low' | 'medium' | 'high';
  next: 'ask' | 'offer_alternatives' | 'propose_piece' | 'proceed_with_assumptions';
  evidence: {
    offer: 'registered' | 'missing';
    action: 'registered' | 'missing';
    creatorPerspective: 'decided' | 'registered' | 'missing';
    recipientPerspective: 'hypothesis' | 'missing';
    referenceMeaning: 'not_applicable' | 'discussed' | 'unknown';
    unresolvedTension: boolean;
  };
  gaps: Array<'offer' | 'action' | 'creator_perspective' | 'recipient_perspective' | 'reference_meaning' | 'unresolved_tension'>;
  limitations: Array<'heuristic_not_statistically_calibrated' | 'recipient_perspective_is_not_verified'>;
}

export function assessReadiness(input: ReadinessInput): ReadinessAssessment;
