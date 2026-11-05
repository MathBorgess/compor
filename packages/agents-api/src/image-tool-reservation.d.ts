import type {Actor,AttemptScope,VersionScope,StoreOptions} from './contracts.js';
export type CallScope=AttemptScope & VersionScope & {sessionId:string;turnId:string;callId:string};
export interface ImageReservationStore {
 reserve(input:CallScope):Promise<{id:string;state:'reserved'|'unknown';isNew:boolean}>;
 markUnknown(input:Pick<CallScope,'actor'|'projectId'|'sessionId'|'turnId'|'callId'>):Promise<void>;
 declareConsent(input:{actor:Actor;reservationId:string;confirmed:true}):Promise<{id:string;isNew:boolean}>;
 claimExecution(input:{actor:Actor;reservationId:string}):Promise<{id:string;assetId:string;state:'running'|'unknown'|'completed';isNew:boolean}>;
 markExecutionUnknown(input:{actor:Actor;executionId:string}):Promise<void>;
 completeExecution(input:{actor:Actor;executionId:string}):Promise<void>;
 claimResultSubmission(input:CallScope & {executionId:string}):Promise<{id:string;assetId:string;state:'sending'|'unknown'|'sent';isNew:boolean}>;
 finishResultSubmission(input:{actor:Actor;submissionId:string;state:'sent'|'unknown'}):Promise<void>;
}
export function createImageToolReservationStore(options:StoreOptions):ImageReservationStore;
