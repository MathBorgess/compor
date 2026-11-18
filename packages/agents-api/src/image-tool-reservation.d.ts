import type {Actor,AttemptScope,VersionScope,StoreOptions} from './contracts.js';
export type CallScope=AttemptScope & VersionScope & {sessionId:string;turnId:string;callId:string};
export type ImageWaitStatus='ready'|'waiting_priority'|'waiting_planning'|'waiting_exploration'|'waiting_image'|'blocked'|'unverified';
export interface ImageReservationStore {
 reserve(input:CallScope):Promise<{id:string;state:'reserved'|'unknown';isNew:boolean}>;
 markUnknown(input:Pick<CallScope,'actor'|'projectId'|'sessionId'|'turnId'|'callId'>):Promise<void>;
 fenceUnsubmitted(input:CallScope):Promise<{status:'fenced'|'unverified'}>;
 getWaitStatus(input:CallScope):Promise<{status:ImageWaitStatus}>;
 confirmClosedAttempt(input:{actor:Actor;projectId:string;requestId:string}):Promise<{status:'confirmed';outcome?:'failed_without_dispatch'}|{status:'unverified'}>;
 declareConsent(input:{actor:Actor;reservationId:string;confirmed:true}):Promise<{id:string;isNew:boolean}>;
 claimExecution(input:{actor:Actor;reservationId:string;visualAuthority?:{requestId:string;manifestDigest:string;consentSecret:string|null}}):Promise<{state:'busy'|'blocked'} | {id:string;assetId:string;state:'running'|'unknown'|'completed';isNew:boolean}>;
 markExecutionUnknown(input:{actor:Actor;executionId:string}):Promise<void>;
 completeExecution(input:{actor:Actor;executionId:string}):Promise<void>;
 claimResultSubmission(input:CallScope & {executionId:string}):Promise<{id:string;assetId:string;state:'sending'|'unknown'|'sent';isNew:boolean}>;
 finishResultSubmission(input:{actor:Actor;submissionId:string;state:'sent'|'unknown'}):Promise<void>;
}
export function createImageToolReservationStore(options:StoreOptions):ImageReservationStore;
