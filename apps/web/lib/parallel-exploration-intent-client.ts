import * as z from './schema.ts';
import type {ParallelPreparation} from './parallel-exploration-journal.ts';

const epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER));
const epochResponse=z.strictObject({epoch});
const intentState=z.strictObject({state:z.enum(['active','consumed','revoked','absent']),epoch,revocationEpoch:z.optional(z.nullable(epoch))});
const created=z.strictObject({status:z.literal('created'),epoch});
const revocation=z.strictObject({status:z.enum(['revoked','conflict']),epoch,revocationEpoch:z.optional(z.nullable(epoch))});
const headers={'content-type':'application/json'};

/** These calls never retry a mutation or treat an unconfirmed response as permission. */
export function createParallelIntentClient(fetchApi:typeof fetch=fetch){
  async function readEpoch(projectId:string):Promise<number>{
    const response=await fetchApi('/api/studio/exploration-batches/intent/epoch',{method:'POST',headers,body:JSON.stringify({projectId})});
    if(!response.ok)throw Error('intent_unavailable');return epochResponse.parse(await response.json()).epoch;
  }
  async function create(preparation:ParallelPreparation,apiKey:string):Promise<number>{
    if(!preparation.intentId||preparation.expectedEpoch===undefined||preparation.revocationRequested)throw Error('intent_invalid');
    if(preparation.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(apiKey))throw Error('credential_unavailable');
    const response=await fetchApi('/api/studio/exploration-batches/intent',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,intentId:preparation.intentId,purpose:'batch',context:preparation.context,expectedEpoch:preparation.expectedEpoch,...(preparation.visualInput===undefined?{}:{visualInput:preparation.visualInput}),...(preparation.credentialSource==='byok'?{apiKey}:{})})});
    if(!response.ok)throw Error('intent_unconfirmed');
    const value=created.parse(await response.json());
    if(value.epoch!==preparation.expectedEpoch+1)throw Error('intent_unconfirmed');
    return value.epoch;
  }
  async function revoke(preparation:ParallelPreparation):Promise<z.infer<typeof revocation>>{
    if(!preparation.intentId||preparation.expectedEpoch===undefined)throw Error('intent_invalid');
    const response=await fetchApi('/api/studio/exploration-batches/intent/revoke',{method:'POST',headers,keepalive:true,body:JSON.stringify({projectId:preparation.projectId,intentId:preparation.intentId,expectedEpoch:preparation.intentEpoch??preparation.expectedEpoch})});
    if(response.status!==200&&response.status!==409)throw Error('intent_unconfirmed');return revocation.parse(await response.json());
  }
  async function inspect(preparation:ParallelPreparation):Promise<z.infer<typeof intentState>>{
    if(!preparation.intentId)throw Error('intent_invalid');
    const response=await fetchApi('/api/studio/exploration-batches/intent/state',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,intentId:preparation.intentId})});
    if(!response.ok)throw Error('intent_unconfirmed');return intentState.parse(await response.json());
  }
  return {readEpoch,create,revoke,inspect};
}
