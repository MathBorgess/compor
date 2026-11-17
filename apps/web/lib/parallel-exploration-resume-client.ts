import * as z from './schema.ts';
import type {ParallelPreparation} from './parallel-exploration-journal.ts';

const epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER));
const success=z.strictObject({status:z.enum(['resumed','not_paused']),intentEpoch:epoch,reviewEpoch:epoch,retryAutomatically:z.literal(false)});

/** A single mutation bound to the confirmed intent; unknown is never retried. */
export async function resumeParallelReview(value:ParallelPreparation,key:string,signal:AbortSignal,fetchApi:typeof fetch=fetch,authority?:{requestId:string;headers:Record<string,string>}):Promise<void>{
  if(!value.intentId||value.intentEpoch===undefined||value.revocationRequested)throw Error('intent_unconfirmed');
  if(value.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(key))throw Error('credential_unavailable');
  const result=await fetchApi('/api/studio/exploration-batches/resume',{method:'POST',headers:{'content-type':'application/json',...authority?.headers},signal,body:JSON.stringify({projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,intentId:value.intentId,...(authority?{authorityRequestId:authority.requestId}:{}),expectedEpoch:value.intentEpoch,context:value.context,...(value.visualInput===undefined?{}:{visualInput:value.visualInput}),...(value.credentialSource==='byok'?{apiKey:key}:{})})});
  if(!result.ok)throw Error('resume_unconfirmed');
  const receipt=success.parse(await result.json());
  if(receipt.intentEpoch!==value.intentEpoch)throw Error('resume_unconfirmed');
}
