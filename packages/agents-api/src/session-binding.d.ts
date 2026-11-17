import type {Buffer} from 'node:buffer';
import type {ImageProposal} from './image-proposal.js';
import type {ArtworkInput} from './artwork-input.js';
export interface ClaimScope {userId:string;projectId:string;attemptId:string}
export interface SessionClaim extends ClaimScope {sessionId:string}
export interface RecoveryClaim extends SessionClaim {origin?:'reference_selection';conversationId?:string}
export interface ActionClaim extends SessionClaim {turnId:string;callId:string;proposalDigest:string}
export interface ApprovedActionClaim extends ActionClaim {pieceId:string;version:number;artworkDigest:string}
export interface SessionBindings {
 issue(input:SessionClaim):string;
 verify(input:ClaimScope & {token:string}):SessionClaim|null;
 issueRecovery(input:RecoveryClaim):string;
 verifyRecovery(input:ClaimScope & {token:string}):RecoveryClaim|null;
 verifyBoundRecovery?(input:ClaimScope & {token:string}):RecoveryClaim|null;
 recoveryAttemptKey(input:ClaimScope):string;
 issueAction(input:SessionClaim & {turnId:string;callId:string;prompt?:string;proposal?:ImageProposal}):string;
 verifyAction(input:ClaimScope & {token:string}):ActionClaim|null;
 issueApprovedAction(input:ClaimScope & {actionBinding:string;pieceId:string;version:number;artworkInput?:ArtworkInput}):string;
 verifyApprovedAction(input:ClaimScope & {token:string;pieceId:string;version:number}):ApprovedActionClaim|null;
}
export function createSessionBindings(options:{secret:Buffer;now?:()=>number}):Readonly<SessionBindings>;
