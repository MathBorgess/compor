import type {ExplorationPlannerContext,ExplorationPlan} from './exploration-planner.js';
import type {VisualInputManifest} from './visual-input-contract.js';
export function validateExplorationContext(value:unknown):value is ExplorationPlannerContext;
export function validateExplorationPlan(value:unknown,context:ExplorationPlannerContext,visualInput?:VisualInputManifest):ExplorationPlan|null;
export function validateCompletedExplorationPlan(value:unknown,context:ExplorationPlannerContext,visualInput?:VisualInputManifest):value is ExplorationPlan;
