import {explorationImageOutcomes,explorationQualityReasons} from './exploration-image-outcome.ts';
import {byokJsonHeaders} from './openai-byok-transport.ts';
import * as z from './schema.ts';
import type {ParallelPreparation} from './parallel-exploration-journal.ts';
import {parseVisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import {selectedVisualInputImages,type SelectedVisualInput} from './selected-visual-input.ts';
import {assertReferenceVisualCapability} from './reference-visual-authority.ts';

const id=z.uuid(),epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1));
const claimSchema=z.strictObject({position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),previousId:id,requestId:id,intentId:id,expectedEpoch:epoch});
const created=z.strictObject({status:z.literal('created'),epoch});
export type ParallelReplacementClaim=z.infer<typeof claimSchema>;

/** Callers persist the claim before create and the submission marker before dispatch. Neither call retries. */
export function createParallelReplacementClient(fetchApi:typeof fetch=fetch){
  function credentialHeader(preparation:ParallelPreparation,key:string,marked=false):Record<string,string>{
    if(preparation.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(key))throw Error('credential_unavailable');
    if(preparation.credentialSource!=='byok')return {};
    return marked?byokJsonHeaders(key):{'x-compor-openai-key':key};
  }
  async function create(preparation:ParallelPreparation,input:ParallelReplacementClaim,key:string,signal:AbortSignal,authority?:{requestId:string;headers:Record<string,string>}):Promise<number>{
    const claim=claimSchema.parse(input);if(claim.previousId===claim.requestId)throw Error('replacement_invalid');
    const visualInput=preparation.visualInput===undefined?undefined:parseVisualInputManifest(preparation.visualInput);
    if(authority&&visualInput)assertReferenceVisualCapability(preparation.userId,visualInput,authority.headers);
    const response=await fetchApi('/api/studio/exploration-batches/intent',{method:'POST',headers:{'content-type':'application/json',...authority?.headers,...credentialHeader(preparation,key,true)},signal,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,intentId:claim.intentId,...(authority?{authorityRequestId:authority.requestId}:{}),purpose:'replacement',position:claim.position,previousId:claim.previousId,context:preparation.context,expectedEpoch:claim.expectedEpoch,...(visualInput?{visualInput}:{})})});
    if(!response.ok)throw Error('intent_unconfirmed');const receipt=created.parse(await response.json());
    if(receipt.epoch!==claim.expectedEpoch+1)throw Error('intent_unconfirmed');return receipt.epoch;
  }
  async function dispatch(preparation:ParallelPreparation,input:ParallelReplacementClaim,binding:string,key:string,signal:AbortSignal,snapshot?:SelectedVisualInput,authority?:{requestId:string;headers:Record<string,string>}):Promise<void>{
    const claim=claimSchema.parse(input);if(!binding||claim.previousId===claim.requestId||preparation.stage!=='executing'||preparation.plan===null)throw Error('replacement_invalid');
    const credential=credentialHeader(preparation,key);
    let visual;
    if(preparation.visualInput!==undefined){
      const visualInput=parseVisualInputManifest(preparation.visualInput);
      if(!snapshot||JSON.stringify(visualInput)!==JSON.stringify(parseVisualInputManifest(snapshot.manifest))||!validateExplorationContext(preparation.context)||!validateCompletedExplorationPlan(preparation.plan,preparation.context,visualInput))throw Error('visual_snapshot_unavailable');
      const ids=preparation.plan.version===2?preparation.plan.referenceIds:visualInput.entries.map(entry=>entry.id);
      visual={visualInput,referenceImages:await selectedVisualInputImages(snapshot,ids)};
    }else if(snapshot)throw Error('replacement_invalid');
    if(signal.aborted)throw Error('replacement_paused');
    if(authority&&visual)assertReferenceVisualCapability(preparation.userId,visual.visualInput,authority.headers);
    const response=await fetchApi('/api/studio/exploration-batches/replace',{method:'POST',headers:{'content-type':'application/json',...authority?.headers,...credential},signal,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,intentId:claim.intentId,planRequestId:preparation.planRequestId,context:preparation.context,plan:preparation.plan,planBinding:binding,position:claim.position,previousId:claim.previousId,requestId:claim.requestId,...visual})});
    if(!response.ok)throw Error('replacement_unconfirmed');
    const receipt=z.object({status:z.enum(explorationImageOutcomes),qualityReason:z.optional(z.enum(explorationQualityReasons)),batchId:id,requestId:id,retryAutomatically:z.literal(false)}).parse(await response.json());
    if(receipt.batchId!==preparation.batchId||receipt.requestId!==claim.requestId||(receipt.status==='quality_held')!==(receipt.qualityReason!==undefined))throw Error('replacement_unconfirmed');
  }
  return {create,dispatch};
}
