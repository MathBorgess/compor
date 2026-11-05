import type {ProjectScope, AttemptScope, StoreOptions} from './contracts.js';
export type AttemptState='started'|'completed'|'unknown';
export interface AttemptStore {
 start(input:ProjectScope & {idempotencyKey:string}):Promise<{id:string;state:AttemptState;isNew:boolean}>;
 finish(input:AttemptScope & {state:'completed'|'unknown'}):Promise<void>;
 bindRecovery(input:AttemptScope & {binding:string}):Promise<void>;
 getRecovery(input:ProjectScope & {idempotencyKey:string}):Promise<{attemptId:string;state:AttemptState;binding:string}|null>;
}
export function createSupabaseAttemptStore(options:StoreOptions):AttemptStore;
