import type {AttemptScope,StoreOptions,TokenUsage} from './contracts.js';
export type UsageContext=AttemptScope & {part:'agent'|'agent_resume'|'image';partId:string;model?:'gpt-image-2.5-flare'|'gpt-image-2.6-flare'|'gpt-6-astra'|'gpt-6.1-terra'};
export interface UsageStore {start(input:UsageContext):Promise<boolean>;finish(input:UsageContext & {state:'completed'|'unknown';usage:TokenUsage|null|undefined}):Promise<void>}
export function createUsageStore(options:StoreOptions):UsageStore;
