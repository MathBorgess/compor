import * as z from './schema.ts';
import type {ParallelPreparation} from './parallel-exploration-journal.ts';

const id=z.uuid(),epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1));
const claimSchema=z.strictObject({position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),previousId:id,requestId:id,intentId:id,expectedEpoch:epoch});
const created=z.strictObject({status:z.literal('created'),epoch});
export type ParallelReplacementClaim=z.infer<typeof claimSchema>;

/** Callers persist the claim before create and the submission marker before dispatch. Neither call retries. */
export function createParallelReplacementClient(fetchApi:typeof fetch=fetch){
  function credential(preparation:ParallelPreparation,key:string){
    if(preparation.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(key))throw Error('credential_unavailable');
    return preparation.credentialSource==='byok'?{apiKey:key}:{};
  }
  async function create(preparation:ParallelPreparation,input:ParallelReplacementClaim,key:string,signal:AbortSignal):Promise<number>{
    const claim=claimSchema.parse(input);if(claim.previousId===claim.requestId)throw Error('replacement_invalid');
    const response=await fetchApi('/api/studio/exploration-batches/intent',{method:'POST',headers:{'content-type':'application/json'},signal,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,intentId:claim.intentId,purpose:'replacement',position:claim.position,previousId:claim.previousId,context:preparation.context,expectedEpoch:claim.expectedEpoch,...credential(preparation,key)})});
    if(!response.ok)throw Error('intent_unconfirmed');const receipt=created.parse(await response.json());
    if(receipt.epoch!==claim.expectedEpoch+1)throw Error('intent_unconfirmed');return receipt.epoch;
  }
  async function dispatch(preparation:ParallelPreparation,input:ParallelReplacementClaim,binding:string,key:string,signal:AbortSignal):Promise<void>{
    const claim=claimSchema.parse(input);if(!binding||claim.previousId===claim.requestId||preparation.stage!=='executing'||preparation.plan===null)throw Error('replacement_invalid');
    credential(preparation,key);
    const response=await fetchApi('/api/studio/exploration-batches/replace',{method:'POST',headers:{'content-type':'application/json',...(preparation.credentialSource==='byok'?{'x-compor-openai-key':key}:{})},signal,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,intentId:claim.intentId,planRequestId:preparation.planRequestId,context:preparation.context,plan:preparation.plan,planBinding:binding,position:claim.position,previousId:claim.previousId,requestId:claim.requestId})});
    if(!response.ok)throw Error('replacement_unconfirmed');
    const receipt=z.object({status:z.enum(['completed','unknown','rejected','running']),batchId:id,requestId:id,retryAutomatically:z.literal(false)}).parse(await response.json());
    if(receipt.batchId!==preparation.batchId||receipt.requestId!==claim.requestId)throw Error('replacement_unconfirmed');
  }
  return {create,dispatch};
}
