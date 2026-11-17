import type {RequestScope,StoreOptions} from './contracts.js';
export type TurnState='starting'|'running'|'action_required'|'completed'|'failed'|'unknown';
export interface StudioTurn {requestId:string;projectId:string;userId:string;attemptId:string;inputDigest:string;state:TurnState;binding:unknown;expiresAt:unknown;priorTurnId:unknown;turnId:unknown;initialInput:unknown;initialOutput:unknown}
export interface ActionAddress extends RequestScope {turnId:string;callId:string}
export interface StudioStore {
 reserve(input:RequestScope & {inputDigest:string;visualAuthority?:{pieceId:string|null;manifestDigest:string;consentSecret:string|null}}):Promise<{status:'reserved'|'existing'|'busy'|'conflict'|'not_found';turn?:StudioTurn}>;
 get(input:RequestScope):Promise<StudioTurn|null>;
 bind(input:RequestScope & {binding:string;expiresAt:string;priorTurnId?:string|null;initialInput?:number|null;initialOutput?:number|null}):Promise<void>;
 state(input:RequestScope & {state:TurnState;turnId?:string|null}):Promise<void>;
 claimAction(input:ActionAddress & {actionDigest:string;resultDigest:string}):Promise<{status:'claimed'|'existing';id:string}|{status:'conflict'|'unavailable'}>;
 getAction(input:ActionAddress):Promise<{state:'sending'|'accepted'|'unknown'}|null>;
 finishAction(input:RequestScope & {submissionId:string;state:'accepted'|'unknown'}):Promise<void>;
}
export function createStudioStore(options:StoreOptions):StudioStore;
