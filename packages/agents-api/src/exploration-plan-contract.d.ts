import type {ExplorationPlannerContext,ExplorationPlan} from './exploration-planner.js';
export function validateExplorationContext(value:unknown):value is ExplorationPlannerContext;
export function validateExplorationPlan(value:unknown,context:ExplorationPlannerContext):ExplorationPlan|null;
export function validateCompletedExplorationPlan(value:unknown,context:ExplorationPlannerContext):value is ExplorationPlan;
