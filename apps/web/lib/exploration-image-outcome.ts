export const explorationImageOutcomes=['running','unknown','completed','rejected','quality_held'] as const;
export const explorationQualityReasons=['image_quality_rejected','image_quality_inconclusive'] as const;
export type ExplorationImageOutcome=(typeof explorationImageOutcomes)[number];
export type ExplorationQualityReason=(typeof explorationQualityReasons)[number];
export type ExplorationReviewOptions={signal:AbortSignal;authorizeReview?:()=>Promise<boolean>};

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
