import {createHash} from 'node:crypto';
import type {PlannerBindings,ExplorationPlannerContext,PlannerProvider} from '@compor/agents-api/exploration-planner';
import type {Actor} from './agent-auth.ts';
import {parseVisualInputManifest,visualInputMatchesProject,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';

export type ExplorationIntentScope={actor:Actor;projectId:string;conversationId:string;batchId:string;intentId:string;context:ExplorationPlannerContext;visualInput?:VisualInputManifest}&(
 {purpose:'batch';position?:never;previousId?:never}|{purpose:'replacement';position:number;previousId:string}
);
/** Server-only derived capability. No secret or key belongs in a response,
 * local journal, log or database; the database receives only its SHA-256. */
export function deriveExplorationIntent(bindings:PlannerBindings,input:ExplorationIntentScope){
 if(input.visualInput!==undefined&&!visualInputMatchesProject(input.visualInput,input.projectId))throw Error('invalid visual scope');
 const contextDigest=bindings.digest(input.visualInput===undefined?{type:'parallel-intent-context-v1',context:input.context}:{type:`parallel-intent-visual-context-v${input.visualInput.version}`,context:input.context,visualInput:parseVisualInputManifest(input.visualInput)});
 const credentialDigest=bindings.digest({type:'parallel-intent-credential-v1',intentId:input.intentId});
 const intentSecret=bindings.digest({type:'parallel-intent-capability-v1',userId:input.actor.userId,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,purpose:input.purpose,position:input.purpose==='replacement'?input.position:null,previousId:input.purpose==='replacement'?input.previousId:null,contextDigest,credentialDigest});
 if(!/^[0-9a-f]{64}$/.test(intentSecret)||!/^[0-9a-f]{64}$/.test(contextDigest)||!/^[0-9a-f]{64}$/.test(credentialDigest))throw Error('invalid binding');
 return {contextDigest,credentialDigest,intentSecret,intentProofDigest:createHash('sha256').update(Buffer.from(intentSecret,'hex')).digest('hex')};
}

/** Reservation may already be durable; an aborted request must not start a
 * provider call that has not yet been sent. It remains blocked for recovery. */
export function guardExplorationPlannerProvider(provider:PlannerProvider,signal:AbortSignal):PlannerProvider {
 return {...provider,create:async input=>{if(signal.aborted)throw Error('aborted before dispatch');return provider.create(input);}};
}
