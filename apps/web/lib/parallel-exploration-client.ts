import {explorationImageOutcomes,explorationQualityReasons} from './exploration-image-outcome.ts';
import * as z from './schema.ts';
import {byokJsonHeaders} from './openai-byok-transport.ts';
import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import {parseVisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {createParallelJournalStore,type ParallelPreparation,type ParallelJournal} from './parallel-exploration-journal.ts';

const id=z.uuid();
const planResponse=z.object({status:z.enum(['running','completed','failed','unknown','unavailable','busy','conflict']),retryAutomatically:z.literal(false),requestId:z.optional(id),batchId:z.optional(id),plan:z.optional(z.unknown()),planBinding:z.optional(z.string().check(z.minLength(1)).check(z.maxLength(8192)))});
const statusImage=z.strictObject({requestId:id,status:z.enum(explorationImageOutcomes),qualityReason:z.optional(z.enum(explorationQualityReasons)),ordinal:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER)),revision:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER)),position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),replacesImageId:z.nullable(id)}).check(z.refine(value=>(value.status==='quality_held')===(value.qualityReason!==undefined)));
const statusResponse=z.strictObject({batchId:id,projectId:id,pieceId:z.nullable(id),state:z.enum(['running','unknown','partial','completed']),completedAt:z.nullable(z.string().check(z.maxLength(100))),nextAt:z.nullable(z.string().check(z.maxLength(100))),closedAt:z.nullable(z.string().check(z.maxLength(100))),images:z.array(statusImage).check(z.minLength(3)).check(z.maxLength(3))});
const absentBatch=z.strictObject({status:z.literal('absent'),projectId:id,batchId:id});
const planRecord=z.strictObject({status:z.enum(['absent','starting','running','unknown','failed','completed']),projectId:id,conversationId:z.union([id,z.literal('references')]),batchId:id,requestId:id});
type Store=ReturnType<typeof createParallelJournalStore>;
export type BatchSnapshot=z.infer<typeof statusResponse>;
export type PlanningResult={preparation:ParallelPreparation;binding:string|null;status:z.infer<typeof planResponse>['status']};

/** Recovery only. A binding is returned in memory, never persisted. */
export function createParallelExplorationClient({store,fetchApi=fetch,canInspect}:{store:Store;fetchApi?:typeof fetch;canInspect:()=>boolean}) {
  let planning=false;
  const headers={'content-type':'application/json'};
  function credentialHeader(preparation:ParallelPreparation,apiKey:string):Record<string,string>{
    if(preparation.credentialSource==='byok'){
      if(!/^sk-[^\s]{20,300}$/.test(apiKey))throw Error('credential_unavailable');
      return byokJsonHeaders(apiKey);
    }
    return {};
  }
  async function planRequest(preparation:ParallelPreparation,apiKey:string):Promise<PlanningResult>{
    const response=await fetchApi('/api/studio/exploration-batches/plan',{method:'POST',headers:{...headers,...credentialHeader(preparation,apiKey)},body:JSON.stringify({op:'poll',projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,requestId:preparation.planRequestId,context:preparation.context,...(preparation.visualInput===undefined?{}:{visualInput:preparation.visualInput})})});
    const result=planResponse.parse(await response.json());
    if(result.requestId!==undefined&&result.requestId!==preparation.planRequestId)throw Error('plan_mismatch');
    if(result.status==='completed'){
      if(!response.ok||result.requestId!==preparation.planRequestId||result.batchId!==preparation.batchId||!result.planBinding||!validateExplorationContext(preparation.context)||!validateCompletedExplorationPlan(result.plan,preparation.context,preparation.visualInput===undefined?undefined:parseVisualInputManifest(preparation.visualInput)))throw Error('plan_mismatch');
      if(preparation.stage==='planning')preparation=await store.updatePreparation(preparation.userId,preparation.revision,{kind:'planned',plan:result.plan});
      else if(!['planned','executing'].includes(preparation.stage)||JSON.stringify(preparation.plan)!==JSON.stringify(result.plan))throw Error('plan_mismatch');
      if(preparation.stage==='executing'){
        const journal=await store.load({userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId});
        if(!canInspect()||!journal||journal.conversationId!==preparation.conversationId||journal.planRequestId!==preparation.planRequestId||journal.credentialSource!==preparation.credentialSource||JSON.stringify(journal.context)!==JSON.stringify(preparation.context)||JSON.stringify(journal.visualInput)!==JSON.stringify(preparation.visualInput)||JSON.stringify(journal.plan)!==JSON.stringify(result.plan))throw Error('plan_mismatch');
      }
      return {preparation,binding:result.planBinding,status:result.status};
    }
    if(result.status==='failed'&&preparation.stage==='planning'){
      if(!response.ok)throw Error('plan_unconfirmed');
      preparation=await store.updatePreparation(preparation.userId,preparation.revision,{kind:'failed'});
    }
    return {preparation,binding:null,status:result.status};
  }
  /** A user-requested read of the original planning attempt; never submits a new one. */
  async function inspectPlan(preparation:ParallelPreparation,apiKey:string):Promise<PlanningResult>{
    if(planning||!canInspect()||!['planning','planned','executing'].includes(preparation.stage))throw Error('parallel_not_allowed');
    planning=true;try{return await planRequest(preparation,apiKey);}finally{planning=false;}
  }
  async function inspectBatch(preparation:ParallelPreparation,now:()=>number,visible:boolean|(()=>boolean)):Promise<{snapshot:BatchSnapshot;journal:ParallelJournal}>{
    if(!canInspect()||preparation.stage!=='executing')throw Error('parallel_not_allowed');
    const response=await fetchApi('/api/studio/exploration-batches/status',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,batchId:preparation.batchId})});
    if(!response.ok)throw Error('parallel_unconfirmed');
    const snapshot=statusResponse.parse(await response.json());
    if(!canInspect())throw Error('parallel_not_allowed');
    const pieceId=preparation.conversationId==='references'?null:preparation.conversationId;
    if(snapshot.batchId!==preparation.batchId||snapshot.projectId!==preparation.projectId||snapshot.pieceId!==pieceId||new Set(snapshot.images.map(image=>image.position)).size!==3||new Set(snapshot.images.map(image=>image.ordinal)).size!==3)throw Error('parallel_batch_mismatch');
    const scope={userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId};
    let journal=await store.load(scope);if(!journal)throw Error('parallel_journal_missing');
    for(const image of snapshot.images){
      const current=journal.progress.children.find(item=>item.position===image.position),claim=journal.replacements?.at(-1);
      const prior=journal.replacements?.find(item=>item.state==='observed'&&item.requestId===image.requestId&&item.position===image.position);
      const same=Boolean(current&&current.requestId===image.requestId&&(prior?image.replacesImageId===prior.previousId:image.replacesImageId===null&&preparation.imageIds[image.position-1]===image.requestId));
      const replacement=Boolean(current&&claim&&claim.state==='submitted'&&current.requestId===claim.previousId&&claim.position===image.position&&claim.requestId===image.requestId&&image.replacesImageId===claim.previousId);
      if(!same&&!replacement)throw Error('parallel_batch_mismatch');
    }
    for(const image of snapshot.images){
      if(!canInspect())throw Error('parallel_not_allowed');
      const current=journal.progress.children.find(item=>item.position===image.position),observation={requestId:image.requestId,position:image.position,status:image.status,revision:image.revision,...(image.qualityReason?{qualityReason:image.qualityReason}:{})};
      if(current?.requestId!==image.requestId){if(!image.replacesImageId)throw Error('parallel_batch_mismatch');journal=await store.update(scope,journal.revision,{kind:'observe_replacement',observation:{...observation,previousId:image.replacesImageId},now:now(),visible:typeof visible==='function'?visible():visible});}
      else journal=await store.update(scope,journal.revision,{kind:'observe',observation,now:now(),visible:typeof visible==='function'?visible():visible});
    }
    return {snapshot,journal};
  }
  async function inspectBatchAbsent(preparation:ParallelPreparation):Promise<boolean>{
    if(!canInspect())throw Error('parallel_not_allowed');
    const response=await fetchApi('/api/studio/exploration-batches/status',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,batchId:preparation.batchId})});
    if(!response.ok||!canInspect())throw Error('parallel_unconfirmed');
    const raw:unknown=await response.json(),value=absentBatch.safeParse(raw);
    if(value.success){if(value.data.projectId!==preparation.projectId||value.data.batchId!==preparation.batchId)throw Error('parallel_mismatch');return true;}
    const present=statusResponse.parse(raw),piece=preparation.conversationId==='references'?null:preparation.conversationId;
    if(present.projectId!==preparation.projectId||present.batchId!==preparation.batchId||present.pieceId!==piece||new Set(present.images.map(image=>image.position)).size!==3||present.images.some(image=>preparation.imageIds[image.position-1]!==image.requestId))throw Error('parallel_mismatch');
    return false;
  }
  async function inspectPlanRecord(preparation:ParallelPreparation):Promise<z.infer<typeof planRecord>['status']>{
    if(!canInspect())throw Error('parallel_not_allowed');
    const response=await fetchApi('/api/studio/exploration-batches/plan/status',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,requestId:preparation.planRequestId})});
    if(!response.ok||!canInspect())throw Error('parallel_unconfirmed');
    const value=planRecord.parse(await response.json());
    if(value.projectId!==preparation.projectId||value.conversationId!==preparation.conversationId||value.batchId!==preparation.batchId||value.requestId!==preparation.planRequestId)throw Error('parallel_mismatch');
    return value.status;
  }
  return {inspectPlan,inspectBatch,inspectBatchAbsent,inspectPlanRecord};
}
