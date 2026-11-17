import * as z from './schema.ts';
import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import {createParallelJournalStore,parseParallelPreparation,type ParallelPreparation,type ParallelJournal} from './parallel-exploration-journal.ts';
import {createParallelIntentClient} from './parallel-exploration-intent-client.ts';
import {createParallelExplorationClient,type BatchSnapshot} from './parallel-exploration-client.ts';
import {observeParallelBatch} from './parallel-exploration-observer.ts';
import {parseVisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {selectedVisualInputImages,visualInputImages,type SelectedVisualInput} from './selected-visual-input.ts';

const response=z.object({status:z.enum(['running','completed','failed','unknown','unavailable','busy','conflict']),retryAutomatically:z.literal(false),requestId:z.optional(z.uuid()),batchId:z.optional(z.uuid()),plan:z.optional(z.unknown()),planBinding:z.optional(z.string().check(z.minLength(1)).check(z.maxLength(8192)))});
type Store=ReturnType<typeof createParallelJournalStore>;
type Options={store:Store;fetchApi?:typeof fetch;allowed:()=>boolean;canInspect:()=>boolean;visible:()=>boolean;beforePlan?:(preparation:ParallelPreparation,signal:AbortSignal)=>Promise<void>;onPlanning:(status:string)=>void;onSnapshot:(value:{snapshot:BatchSnapshot;journal:ParallelJournal})=>void|Promise<void>;onUnavailable:()=>void;sleep:(ms:number)=>Promise<void>;now:()=>number};

/** One user-authorized attempt; callers hold the account Web Lock and validate all gates. */
export function createParallelDispatcher(options:Options){
  const {store,allowed,canInspect,visible,onPlanning,onSnapshot,onUnavailable,sleep,now}=options,fetchApi=options.fetchApi??fetch,intents=createParallelIntentClient(fetchApi);
  const recovery=createParallelExplorationClient({store,fetchApi,canInspect});
  const headers={'content-type':'application/json'};
  let active=true,started=false,current:ParallelPreparation|null=null;
  const commandAbort=new AbortController();
  const stillAllowed=()=>active&&allowed();
  const ensure=()=>{if(!stillAllowed())throw Error('parallel_paused');};
  const credential=(value:ParallelPreparation,key:string)=>value.credentialSource==='byok'?{apiKey:key}:{};
  async function visualSnapshot(value:ParallelPreparation){
    if(value.visualInput===undefined)return null;
    const snapshot=await store.loadVisualSnapshot({userId:value.userId,projectId:value.projectId,batchId:value.batchId},value.conversationId);
    if(!snapshot||JSON.stringify(snapshot.manifest)!==JSON.stringify(parseVisualInputManifest(value.visualInput)))throw Error('visual_snapshot_unavailable');
    return snapshot;
  }
  async function readPlan(value:ParallelPreparation,key:string,op:'submit'|'poll'){
    const visual=value.visualInput===undefined?undefined:parseVisualInputManifest(value.visualInput);
    const snapshot=op==='submit'?await visualSnapshot(value):null;ensure();
    const images=snapshot?await visualInputImages(snapshot):undefined;ensure();
    const result=await fetchApi('/api/studio/exploration-batches/plan',{method:'POST',headers,signal:commandAbort.signal,body:JSON.stringify({op,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,requestId:value.planRequestId,context:value.context,...(visual?{visualInput:visual}:{}),...(images?{referenceImages:images}:{}),...credential(value,key),...(op==='submit'?{intentId:value.intentId}:{})})});
    const payload=response.parse(await result.json());
    if(payload.requestId!==undefined&&payload.requestId!==value.planRequestId)throw Error('plan_mismatch');
    if(payload.status==='completed'&&(!result.ok||payload.batchId!==value.batchId||payload.requestId!==value.planRequestId||!payload.planBinding||!validateExplorationContext(value.context)||!validateCompletedExplorationPlan(payload.plan,value.context,visual)))throw Error('plan_mismatch');
    return payload;
  }
  async function start(input:unknown,apiKey:string,snapshot?:SelectedVisualInput):Promise<void>{
    if(started)throw Error('parallel_already_started');started=true;ensure();
    const preparation=parseParallelPreparation(input);
    if(!preparation.intentId||preparation.expectedEpoch===undefined||preparation.stage!=='planning'||preparation.planSubmitted||preparation.revocationRequested||(preparation.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(apiKey)))throw Error('parallel_invalid');
    if(Boolean(snapshot)!==(preparation.visualInput!==undefined))throw Error('visual_snapshot_unavailable');
    current=snapshot?await store.createBeforePlanningWithVisual(preparation,snapshot):await store.createBeforePlanning(preparation);ensure();
    const intentEpoch=await intents.create(current,apiKey);ensure();
    current=await store.updatePreparation(current.userId,current.revision,{kind:'intent_confirmed',epoch:intentEpoch});ensure();
    if(options.beforePlan){await options.beforePlan(current,commandAbort.signal);ensure();}
    current=await store.updatePreparation(current.userId,current.revision,{kind:'plan_submitted'});ensure();
    onPlanning('planning');
    let plan=await readPlan(current,apiKey,'submit');
    while(plan.status==='running'&&stillAllowed()){
      await sleep(3000);ensure();plan=await readPlan(current,apiKey,'poll');
    }
    ensure();
    if(plan.status!=='completed'||!plan.planBinding)throw Error('plan_unconfirmed');
    current=await store.updatePreparation(current.userId,current.revision,{kind:'planned',plan:plan.plan});ensure();
    await executePlanned(current,plan.planBinding,apiKey);
  }
  async function executePlanned(preparation:ParallelPreparation,binding:string,apiKey:string):Promise<void>{
    current=preparation;ensure();
    const snapshot=await visualSnapshot(current);ensure();
    const visual=snapshot?.manifest;
    if(!validateExplorationContext(current.context)||!validateCompletedExplorationPlan(current.plan,current.context,visual))throw Error('plan_mismatch');
    const ids=current.plan.version===2?current.plan.referenceIds:visual?.entries.map(entry=>entry.id)??[];
    const images=snapshot?await selectedVisualInputImages(snapshot,ids):undefined;ensure();
    current=await store.prepareExecution({userId:current.userId,projectId:current.projectId,batchId:current.batchId},current.revision);ensure();
    const attempt=current;
    onPlanning('executing');
    // The command is sent once. Observation is independent, read-only and may
    // display individual receipts before the command itself returns.
    const command=fetchApi('/api/studio/exploration-batches/execute',{method:'POST',headers:{...headers,...(attempt.credentialSource==='byok'?{'x-compor-openai-key':apiKey}:{})},signal:commandAbort.signal,body:JSON.stringify({projectId:attempt.projectId,conversationId:attempt.conversationId,batchId:attempt.batchId,intentId:attempt.intentId,planRequestId:attempt.planRequestId,context:attempt.context,plan:attempt.plan,planBinding:binding,imageIds:attempt.imageIds,...(visual?{visualInput:visual,referenceImages:images}:{})})}).catch(()=>null);
    const observation=observeParallelBatch({inspect:()=>recovery.inspectBatch(attempt,now,visible),isActive:()=>active&&canInspect(),onObservation:onSnapshot,onUnavailable,sleep,intervalMs:3000});
    // Stopping observation must not hold the account lock until an already
    // dispatched server request returns. Its outcome remains in the journal.
    void command;
    await observation;
  }
  /** Explicit continuation of the same validated plan, with a fresh intent; never replans. */
  async function resumePlanned(preparation:ParallelPreparation,newIntentId:string,apiKey:string):Promise<void>{
    if(started)throw Error('parallel_already_started');started=true;ensure();
    if(preparation.stage!=='planned'||!preparation.intentId||preparation.expectedEpoch===undefined||!preparation.planSubmitted||(preparation.credentialSource==='byok'&&!/^sk-[^\s]{20,300}$/.test(apiKey)))throw Error('parallel_invalid');
    await visualSnapshot(preparation);ensure();
    // The current revoke endpoint does not prove the epoch at which its
    // tombstone was created. Never adopt the account's later epoch here.
    current=preparation;
    const recovered=await recovery.inspectPlan(current,apiKey);ensure();
    if(recovered.status!=='completed'||!recovered.binding)throw Error('plan_unconfirmed');
    let latest=await store.loadPreparation(current.userId);ensure();
    if(!latest||latest.intentId!==current.intentId||latest.stage!=='planned')throw Error('parallel_conflict');
    const state=await intents.inspect(latest);ensure();
    if(state.state==='consumed')throw Error('intent_consumed');
    if(!latest.revocationRequested)latest=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke'});current=latest;ensure();
    const revoked=state.state==='revoked'?{status:'revoked' as const,revocationEpoch:state.revocationEpoch}:await intents.revoke(latest);ensure();
    if(revoked.status!=='revoked')throw Error('intent_unconfirmed');
    if(!latest.revocationConfirmed||latest.revocationEpoch===undefined&&revoked.revocationEpoch!=null)latest=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke_confirmed',...(revoked.revocationEpoch==null?{}:{epoch:revoked.revocationEpoch})});current=latest;ensure();
    if(latest.revocationEpoch===undefined)throw Error('revocation_epoch_unverified');
    const scope={userId:latest.userId,projectId:latest.projectId,batchId:latest.batchId};
    current=await store.reissuePlannedIntent(scope,latest.revision,newIntentId,latest.revocationEpoch);ensure();
    const createdEpoch=await intents.create(current,apiKey);ensure();
    current=await store.updatePreparation(current.userId,current.revision,{kind:'intent_confirmed',epoch:createdEpoch});ensure();
    if(options.beforePlan){await options.beforePlan(current,commandAbort.signal);ensure();}
    await executePlanned(current,recovered.binding,apiKey);
  }
  /** Locally stop first, then request server-side revocation; unknown stays blocked. */
  async function stop():Promise<'revoked'|'unknown'>{
    active=false;commandAbort.abort();
    const value=current;if(!value?.intentId)return 'unknown';
    const revoke=intents.revoke(value).catch(()=>'unknown' as const);
    try{const latest=await store.loadPreparation(value.userId);if(latest?.intentId===value.intentId&&!latest.revocationRequested)current=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke'});}catch{/* Still request revocation; preserve the existing journal. */}
    const result=await revoke;if(result==='unknown'||result.status!=='revoked')return 'unknown';
    try{
      let latest=await store.loadPreparation(value.userId);
      if(!latest||latest.intentId!==value.intentId)return 'unknown';
      if(!latest.revocationRequested)latest=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke'});
      if(!latest.revocationConfirmed)current=await store.updatePreparation(latest.userId,latest.revision,{kind:'revoke_confirmed',...(result.revocationEpoch==null?{}:{epoch:result.revocationEpoch})});
      return 'revoked';
    }catch{return 'unknown';}
  }
  return {start,resumePlanned,stop};
}
