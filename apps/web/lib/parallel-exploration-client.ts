import * as z from './schema.ts';
import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import {createParallelJournalStore,type ParallelPreparation,type ParallelJournal} from './parallel-exploration-journal.ts';

const id=z.uuid();
const planResponse=z.object({status:z.enum(['running','completed','failed','unknown','unavailable','busy','conflict']),retryAutomatically:z.literal(false),requestId:z.optional(id),batchId:z.optional(id),plan:z.optional(z.unknown()),planBinding:z.optional(z.string().check(z.minLength(1)).check(z.maxLength(8192)))});
const statusImage=z.strictObject({requestId:id,status:z.enum(['running','unknown','completed','rejected']),ordinal:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER)),revision:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER)),position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),replacesImageId:z.nullable(id)});
const statusResponse=z.strictObject({batchId:id,projectId:id,pieceId:z.nullable(id),state:z.enum(['running','unknown','partial','completed']),completedAt:z.nullable(z.string().check(z.maxLength(100))),nextAt:z.nullable(z.string().check(z.maxLength(100))),closedAt:z.nullable(z.string().check(z.maxLength(100))),images:z.array(statusImage).check(z.minLength(3)).check(z.maxLength(3))});
type Store=ReturnType<typeof createParallelJournalStore>;
export type BatchSnapshot=z.infer<typeof statusResponse>;
export type PlanningResult={preparation:ParallelPreparation;binding:string|null;status:z.infer<typeof planResponse>['status']};

/** Recovery only. A binding is returned in memory, never persisted. */
export function createParallelExplorationClient({store,fetchApi=fetch,canInspect}:{store:Store;fetchApi?:typeof fetch;canInspect:()=>boolean}) {
  let planning=false;
  const headers={'content-type':'application/json'};
  function credential(preparation:ParallelPreparation,apiKey:string){
    if(preparation.credentialSource==='byok'){
      if(!/^sk-[^\s]{20,300}$/.test(apiKey))throw Error('credential_unavailable');
      return {apiKey};
    }
    return {};
  }
  async function planRequest(preparation:ParallelPreparation,apiKey:string):Promise<PlanningResult>{
    const response=await fetchApi('/api/studio/exploration-batches/plan',{method:'POST',headers,body:JSON.stringify({op:'poll',projectId:preparation.projectId,conversationId:preparation.conversationId,batchId:preparation.batchId,requestId:preparation.planRequestId,context:preparation.context,...credential(preparation,apiKey)})});
    const result=planResponse.parse(await response.json());
    if(result.requestId!==undefined&&result.requestId!==preparation.planRequestId)throw Error('plan_mismatch');
    if(result.status==='completed'){
      if(!response.ok||result.requestId!==preparation.planRequestId||result.batchId!==preparation.batchId||!result.planBinding||!validateExplorationContext(preparation.context)||!validateCompletedExplorationPlan(result.plan,preparation.context))throw Error('plan_mismatch');
      if(preparation.stage==='planning')preparation=await store.updatePreparation(preparation.userId,preparation.revision,{kind:'planned',plan:result.plan});
      else if(preparation.stage!=='planned'||JSON.stringify(preparation.plan)!==JSON.stringify(result.plan))throw Error('plan_mismatch');
      return {preparation,binding:result.planBinding,status:result.status};
    }
    if(result.status==='failed'&&preparation.stage==='planning')preparation=await store.updatePreparation(preparation.userId,preparation.revision,{kind:'failed'});
    return {preparation,binding:null,status:result.status};
  }
  /** A user-requested read of the original planning attempt; never submits a new one. */
  async function inspectPlan(preparation:ParallelPreparation,apiKey:string):Promise<PlanningResult>{
    if(planning||!canInspect()||!['planning','planned'].includes(preparation.stage))throw Error('parallel_not_allowed');
    planning=true;try{return await planRequest(preparation,apiKey);}finally{planning=false;}
  }
  async function inspectBatch(preparation:ParallelPreparation,now:number,visible:boolean):Promise<{snapshot:BatchSnapshot;journal:ParallelJournal}>{
    if(!canInspect()||preparation.stage!=='executing')throw Error('parallel_not_allowed');
    const response=await fetchApi('/api/studio/exploration-batches/status',{method:'POST',headers,body:JSON.stringify({projectId:preparation.projectId,batchId:preparation.batchId})});
    if(!response.ok)throw Error('parallel_unconfirmed');
    const snapshot=statusResponse.parse(await response.json());
    const pieceId=preparation.conversationId==='references'?null:preparation.conversationId;
    if(snapshot.batchId!==preparation.batchId||snapshot.projectId!==preparation.projectId||snapshot.pieceId!==pieceId||new Set(snapshot.images.map(image=>image.position)).size!==3||new Set(snapshot.images.map(image=>image.ordinal)).size!==3||snapshot.images.some(image=>image.replacesImageId!==null||preparation.imageIds[image.position-1]!==image.requestId))throw Error('parallel_batch_mismatch');
    const scope={userId:preparation.userId,projectId:preparation.projectId,batchId:preparation.batchId};
    let journal=await store.load(scope);if(!journal)throw Error('parallel_journal_missing');
    for(const image of snapshot.images)journal=await store.update(scope,journal.revision,{kind:'observe',observation:{requestId:image.requestId,position:image.position,status:image.status,revision:image.revision},now,visible});
    return {snapshot,journal};
  }
  return {inspectPlan,inspectBatch};
}
