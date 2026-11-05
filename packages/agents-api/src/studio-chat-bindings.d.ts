import type {Buffer} from 'node:buffer';
export interface StudioActionClaim {userId:string;projectId:string;requestId:string;attemptId:string;sessionId:string;turnId:string;callId:string;name:string;argsDigest:string;issuedAt:number;expiresAt:number}
export interface StudioBindings {digest(value:unknown):string;issue(value:Omit<StudioActionClaim,'argsDigest'|'issuedAt'|'expiresAt'> & {args:unknown}):string;verify(input:Pick<StudioActionClaim,'userId'|'projectId'|'requestId'> & {token:string}):StudioActionClaim|null;actionRequestId(value:unknown):string}
export function createStudioBindings(options:{secret:Buffer;now?:()=>number}):StudioBindings;
