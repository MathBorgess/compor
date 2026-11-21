export const explorationImageOutcomes=['running','unknown','completed','rejected','quality_held','failed'] as const;
export const explorationClosureReasons=['provider_rejected_400','provider_rejected_429','result_unknown'] as const;
export const explorationProviderOutcomes=['failure','retryable','unconfirmed'] as const;
export type ExplorationClosureReason=(typeof explorationClosureReasons)[number];
export type ExplorationProviderOutcome=(typeof explorationProviderOutcomes)[number];
export const explorationQualityReasons=['image_quality_rejected','image_quality_inconclusive'] as const;
export type ExplorationImageOutcome=(typeof explorationImageOutcomes)[number];
export type ExplorationQualityReason=(typeof explorationQualityReasons)[number];
export type ExplorationReviewOptions={signal:AbortSignal;authorizeReview?:()=>Promise<boolean>};

export class ExplorationProviderClosed extends Error {
  readonly closureReason:ExplorationClosureReason;
  readonly providerOutcome:ExplorationProviderOutcome;
  constructor(closureReason:ExplorationClosureReason, providerOutcome:ExplorationProviderOutcome) {
    super(closureReason);
    this.closureReason=closureReason;
    this.providerOutcome=providerOutcome;
  }
}

export class ExplorationQualityHeld extends Error {
  readonly reason:ExplorationQualityReason;
  constructor(reason:ExplorationQualityReason) {
    super(reason);
    this.reason=reason;
  }
}

export function isReplaceableExplorationOutcome(state:string):state is 'rejected'|'quality_held' {
  return state==='rejected'||state==='quality_held';
}
