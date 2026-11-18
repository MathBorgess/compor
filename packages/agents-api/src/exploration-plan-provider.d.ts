import type {PlannerProvider} from './exploration-planner.js';
export function createManagedExplorationPlanProvider(options:{apiKey:string;fetch?:typeof fetch}):Readonly<PlannerProvider>;
