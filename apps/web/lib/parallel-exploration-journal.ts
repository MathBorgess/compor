import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import {validateVisualInputManifest, parseVisualInputManifest} from '@compor/agents-api/visual-input-contract';
import * as z from './schema.ts';
import {validateVisualSnapshot, type SelectedVisualInput} from './selected-visual-input.ts';
import {creationContextSchema} from './studio-domain.ts';
import {parallelProgressSchema,observeParallelChild,replaceRejectedParallelChild,pauseParallelWait,restoreParallelWait,resumeParallelWait,reconcileParallelGates,parallelWaitElapsed,type ParallelObservation,type ParallelGates} from './parallel-exploration-progress.ts';

const id=z.uuid();
const scopeSchema=z.strictObject({userId:id,projectId:id,batchId:id});
const epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1));
const replacementSchema=z.strictObject({position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),previousId:id,requestId:id,intentId:id,expectedEpoch:epoch,intentEpoch:z.optional(epoch),state:z.enum(['prepared','submitted','observed','abandoned']),revocationRequested:z.boolean(),revocationConfirmed:z.boolean(),revocationEpoch:z.optional(epoch)}).check(z.refine(value=>value.previousId!==value.requestId&&(value.intentEpoch===undefined||value.intentEpoch===value.expectedEpoch+1)&&(!['submitted','observed'].includes(value.state)||value.intentEpoch!==undefined)&&(!value.revocationConfirmed||value.revocationRequested)&&(value.revocationEpoch===undefined||value.revocationConfirmed)));
const journalSchema=z.strictObject({version:z.literal(1),userId:id,projectId:id,batchId:id,conversationId:z.union([id,z.literal('references')]),planRequestId:id,intentId:z.optional(id),credentialSource:z.enum(['byok','default']),context:z.unknown(),creationContext:z.optional(creationContextSchema),plan:z.unknown(),revision:z.number().check(z.int()).check(z.nonnegative()),progress:parallelProgressSchema,replacements:z.optional(z.array(replacementSchema))});
const preparationSchema=z.strictObject({version:z.literal(1),userId:id,projectId:id,batchId:id,conversationId:z.union([id,z.literal('references')]),planRequestId:id,credentialSource:z.enum(['byok','default']),imageIds:z.array(id).check(z.minLength(3)).check(z.maxLength(3)),context:z.unknown(),visualInput:z.optional(z.unknown()),creationContext:z.optional(creationContextSchema),intentId:z.optional(id),expectedEpoch:z.optional(epoch),intentEpoch:z.optional(epoch),planSubmitted:z.optional(z.boolean()),revocationRequested:z.optional(z.boolean()),revocationConfirmed:z.optional(z.boolean()),revocationEpoch:z.optional(epoch),plan:z.nullable(z.unknown()),stage:z.enum(['planning','planned','executing','completed','failed']),revision:z.number().check(z.int()).check(z.nonnegative())}).check(z.refine(value=>new Set(value.imageIds).size===3&&(value.stage==='planning'||value.stage==='failed'?value.plan===null:value.plan!==null)&&(value.intentId===undefined)===(value.expectedEpoch===undefined)&&(value.intentEpoch===undefined||value.expectedEpoch!==undefined&&value.intentEpoch===value.expectedEpoch+1)&&(!value.planSubmitted||value.intentEpoch!==undefined||value.stage==='planned')&&(!value.revocationConfirmed||value.revocationRequested===true)&&(value.revocationEpoch===undefined||value.revocationConfirmed===true)));
export type ParallelPreparation=z.infer<typeof preparationSchema>;
export type ParallelJournal=z.infer<typeof journalSchema>;
export type ParallelScope=z.infer<typeof scopeSchema>;
export type ParallelReplacement=z.infer<typeof replacementSchema>;
export type ParallelJournalUpdate=
 | {kind:'observe';observation:ParallelObservation;now:number;visible:boolean}
 | {kind:'observe_replacement';observation:ParallelObservation&{previousId:string};now:number;visible:boolean}
 | {kind:'pause';now:number}
 | {kind:'restore'}
 | {kind:'gates';now:number;gates:ParallelGates}
 | {kind:'resume';now:number;gates:ParallelGates};

/** Creative context stays local; authentication, tokens and planBinding are rejected by the strict schema. */
export function parseParallelJournal(input:unknown):ParallelJournal {
  const value=journalSchema.parse(input);
  if(!validateExplorationContext(value.context)||!validateCompletedExplorationPlan(value.plan,value.context))throw Error('parallel_invalid_plan');
  const heads=new Map<number,string>(),requests=new Set<string>(),intents=new Set<string>();
  for(const [index,claim] of (value.replacements??[]).entries()){
    if((heads.has(claim.position)&&heads.get(claim.position)!==claim.previousId)||requests.has(claim.requestId)||intents.has(claim.intentId)||claim.intentId===value.intentId||(['prepared','submitted'].includes(claim.state)&&index!==(value.replacements?.length??0)-1))throw Error('parallel_invalid_replacement');
    requests.add(claim.requestId);intents.add(claim.intentId);heads.set(claim.position,claim.state==='observed'?claim.requestId:claim.previousId);
  }
  for(const [position,head] of heads)if(value.progress.children.find(item=>item.position===position)?.requestId!==head)throw Error('parallel_invalid_replacement');
  return value;
}
export function parseParallelPreparation(input:unknown):ParallelPreparation {
  const value=preparationSchema.parse(input);
  if(value.visualInput!==undefined&&!validateVisualInputManifest(value.visualInput))throw Error('parallel_invalid_visual_input');
  if(!validateExplorationContext(value.context)||(value.plan!==null&&!validateCompletedExplorationPlan(value.plan,value.context)))throw Error('parallel_invalid_plan');
  return value;
}

export class ParallelJournalError extends Error {
  constructor(public code:string){super(code);this.name='ParallelJournalError';}
}
const failCode=(error:unknown)=>error instanceof ParallelJournalError?error:new ParallelJournalError(error instanceof Error&&error.name==='QuotaExceededError'?'parallel_storage_quota':'parallel_storage_unavailable');
const key=(scope:ParallelScope)=>JSON.stringify([scope.userId,scope.projectId,scope.batchId]);
const scopeFrom=(value:ParallelJournal):ParallelScope=>({userId:value.userId,projectId:value.projectId,batchId:value.batchId});

/**
 * Inactive local journal. `createBeforeDispatch` commits before resolving;
 * callers must never invoke the external command if it rejects. It neither
 * invokes nor retries an external effect, and cannot replace server reservation.
 */
export function createParallelJournalStore({indexedDB=globalThis.indexedDB,name='compor-parallel-exploration-v1'}:{indexedDB?:IDBFactory;name?:string}={}) {
  if(!/^compor-parallel-exploration-[a-z0-9-]{1,60}$/.test(name))throw new ParallelJournalError('parallel_storage_invalid');
  let connection:IDBDatabase|null=null,opening:Promise<IDBDatabase>|null=null;
  function open():Promise<IDBDatabase>{
    if(connection)return Promise.resolve(connection);
    if(opening)return opening;
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.reject(new ParallelJournalError('parallel_storage_unavailable'));
    opening=new Promise<IDBDatabase>((resolve,reject)=>{
      let request:IDBOpenDBRequest,settled=false;
      const rejectOnce=(error:unknown)=>{if(!settled){settled=true;reject(failCode(error));}};
      try{request=indexedDB.open(name,4);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('journals'))request.result.createObjectStore('journals');if(!request.result.objectStoreNames.contains('preparations'))request.result.createObjectStore('preparations');if(!request.result.objectStoreNames.contains('preparationHistory'))request.result.createObjectStore('preparationHistory');if(!request.result.objectStoreNames.contains('visualSnapshots'))request.result.createObjectStore('visualSnapshots');};
      request.onerror=()=>rejectOnce(request.error);
      request.onblocked=()=>rejectOnce(new ParallelJournalError('parallel_storage_blocked'));
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=null;};resolve(db);};
    }).finally(()=>{opening=null;});
    return opening;
  }
  async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(value:T)=>void,abort:(error:unknown)=>void)=>void,storeName='journals'):Promise<T>{
    const db=await open();
    return new Promise<T>((resolve,reject)=>{
      let tx:IDBTransaction,result:T,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(storeName,mode);}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>{};
      tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      try{action(tx.objectStore(storeName),value=>{result=value;},abort);}catch(error){abort(error);}
    });
  }
  /** A recovered view cannot infer elapsed visible time while the page was closed. */
  async function load(scope:ParallelScope):Promise<ParallelJournal|null>{
    const address=scopeSchema.parse(scope);
    return transaction('readonly',(store,done,abort)=>{const request=store.get(key(address));request.onsuccess=()=>{try{if(request.result===undefined){done(null);return;}const value=parseParallelJournal(request.result);if(key(scopeFrom(value))!==key(address))throw Error();done(value);}catch{abort(new ParallelJournalError('parallel_storage_corrupt'));}};});
  }
  async function loadForRecovery(scope:ParallelScope):Promise<ParallelJournal|null>{
    const address=scopeSchema.parse(scope);
    return transaction('readwrite',(store,done,abort)=>{
      const request=store.get(key(address));request.onsuccess=()=>{try{if(request.result===undefined){done(null);return;}const value=parseParallelJournal(request.result);if(key(scopeFrom(value))!==key(address))throw Error();const progress=restoreParallelWait(value.progress);if(progress.wait.mode===value.progress.wait.mode){done(value);return;}const restored=parseParallelJournal({...value,progress,revision:value.revision+1});store.put(restored,key(address));done(restored);}catch{abort(new ParallelJournalError('parallel_storage_corrupt'));}};
    });
  }
  async function createBeforeDispatch(input:unknown):Promise<ParallelJournal>{
    let value:ParallelJournal;try{value=parseParallelJournal(input);}catch{throw new ParallelJournalError('parallel_storage_invalid');}
    if(value.revision!==0||value.progress.wait.mode!=='none'||value.progress.children.some(item=>item.status!=='unconfirmed'||item.revision!==0))throw new ParallelJournalError('parallel_storage_invalid');
    return transaction('readwrite',(store,done,abort)=>{
      const address=key(scopeFrom(value)),request=store.get(address);
      request.onsuccess=()=>{if(request.result!==undefined){abort(new ParallelJournalError('parallel_storage_exists'));return;}try{store.add(value,address);done(value);}catch(error){abort(error);}};
    });
  }
  async function loadPreparation(userId:string):Promise<ParallelPreparation|null>{
    const owner=id.parse(userId);
    return transaction('readonly',(store,done,abort)=>{const request=store.get(owner);request.onsuccess=()=>{try{if(request.result===undefined){done(null);return;}const value=parseParallelPreparation(request.result);if(value.userId!==owner)throw Error();done(value);}catch{abort(new ParallelJournalError('parallel_storage_corrupt'));}};},'preparations');
  }
  /** The owner-wide record is committed before the paid planning request. */
  async function createBeforePlanning(input:unknown):Promise<ParallelPreparation>{
    let value:ParallelPreparation;try{value=parseParallelPreparation(input);}catch{throw new ParallelJournalError('parallel_storage_invalid');}
    if(value.visualInput!==undefined||value.revision!==0||value.stage!=='planning'||(value.intentId!==undefined&&(value.planSubmitted!==false||value.revocationRequested!==false)))throw new ParallelJournalError('parallel_storage_invalid');
    return transaction('readwrite',(store,done,abort)=>{const request=store.get(value.userId);request.onsuccess=()=>{if(request.result!==undefined){abort(new ParallelJournalError('parallel_storage_exists'));return;}try{store.add(value,value.userId);done(value);}catch(error){abort(error);}};},'preparations');
  }
  /** Commit the owner-wide preparation and immutable transport blobs together. */
  async function createBeforePlanningWithVisual(input:unknown,snapshot:SelectedVisualInput):Promise<ParallelPreparation>{
    let value:ParallelPreparation;
    try{
      value=parseParallelPreparation(structuredClone(input));
      if(value.visualInput===undefined||JSON.stringify(value.visualInput)!==JSON.stringify(snapshot.manifest)||value.revision!==0||value.stage!=='planning'||(value.intentId!==undefined&&(value.planSubmitted!==false||value.revocationRequested!==false)))throw Error();
      snapshot={manifest:parseVisualInputManifest(snapshot.manifest),blobs:[...snapshot.blobs]};
      await validateVisualSnapshot(snapshot);
    }catch{throw new ParallelJournalError('parallel_storage_invalid');}
    value={...value,visualInput:snapshot.manifest};
    const db=await open(),address=key(value),record={userId:value.userId,projectId:value.projectId,batchId:value.batchId,conversationId:value.conversationId,manifest:snapshot.manifest,blobs:snapshot.blobs};
    return new Promise<ParallelPreparation>((resolve,reject)=>{
      let tx:IDBTransaction,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','visualSnapshots'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(value);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const preparations=tx.objectStore('preparations'),snapshots=tx.objectStore('visualSnapshots');
      const existing=preparations.get(value.userId),all=snapshots.getAll();let checked=false,records:unknown[]|undefined;
      const commit=()=>{if(!checked||!records)return;try{
        let bytes=0,files=0;
        for(const item of records){
          if(!item||typeof item!=='object'||!('blobs' in item)||!Array.isArray(item.blobs)||item.blobs.some(blob=>!(blob instanceof Blob)))throw new ParallelJournalError('parallel_storage_corrupt');
          files+=item.blobs.length;bytes+=item.blobs.reduce((sum,blob)=>sum+blob.size,0);
        }
        if(files+snapshot.blobs.length>500||bytes+snapshot.blobs.reduce((sum,blob)=>sum+blob.size,0)>256*1024*1024)throw new ParallelJournalError('parallel_storage_quota');
        preparations.add(value,value.userId);snapshots.add(record,address);
      }catch(error){abort(error);}};
      existing.onsuccess=()=>{if(existing.result!==undefined){abort(new ParallelJournalError('parallel_storage_exists'));return;}checked=true;commit();};
      all.onsuccess=()=>{records=all.result;commit();};
    });
  }
  /** Missing or corrupt bytes do not prevent the separate read-only receipt path. */
  async function loadVisualSnapshot(scope:ParallelScope,conversationId:string):Promise<SelectedVisualInput|null>{
    const address=scopeSchema.parse(scope);
    if(conversationId!=='references'&&!id.safeParse(conversationId).success)throw new ParallelJournalError('parallel_storage_invalid');
    const raw=await transaction('readonly',(store,done)=>{const request=store.get(key(address));request.onsuccess=()=>done(request.result);},'visualSnapshots');
    if(raw===undefined)return null;
    if(!raw||typeof raw!=='object'||!('userId' in raw)||!('projectId' in raw)||!('batchId' in raw)||!('conversationId' in raw)||!('manifest' in raw)||!('blobs' in raw)||raw.userId!==address.userId||raw.projectId!==address.projectId||raw.batchId!==address.batchId||raw.conversationId!==conversationId)throw new ParallelJournalError('parallel_storage_corrupt');
    try{
      if(!Array.isArray(raw.blobs)||raw.blobs.some(blob=>!(blob instanceof Blob)))throw Error();
      const snapshot={manifest:parseVisualInputManifest(raw.manifest),blobs:raw.blobs};
      await validateVisualSnapshot(snapshot);return snapshot;
    }catch{throw new ParallelJournalError('parallel_storage_corrupt');}
  }
  /** Standalone request snapshot for chat/artwork, committed before their separate journal permits dispatch. */
  async function saveRequestVisualSnapshot(scope:{userId:string;projectId:string;conversationId:string;requestId:string},input:SelectedVisualInput):Promise<void>{
    const parsed=z.strictObject({userId:id,projectId:id,conversationId:z.union([id,z.literal('references')]),requestId:id}).parse(scope);
    let snapshot:SelectedVisualInput;
    try{snapshot={manifest:parseVisualInputManifest(input.manifest),blobs:[...input.blobs]};await validateVisualSnapshot(snapshot);}catch{throw new ParallelJournalError('parallel_storage_invalid');}
    const address=JSON.stringify([parsed.userId,parsed.projectId,parsed.conversationId,parsed.requestId]);
    return transaction('readwrite',(store,done,abort)=>{
      const request=store.getAll();request.onsuccess=()=>{try{
        const records:unknown[]=request.result;let bytes=0,files=0;
        for(const item of records){
          if(!item||typeof item!=='object'||!('blobs' in item)||!Array.isArray(item.blobs)||item.blobs.some(blob=>!(blob instanceof Blob)))throw new ParallelJournalError('parallel_storage_corrupt');
          files+=item.blobs.length;bytes+=item.blobs.reduce((sum,blob)=>sum+blob.size,0);
        }
        if(files+snapshot.blobs.length>500||bytes+snapshot.blobs.reduce((sum,blob)=>sum+blob.size,0)>256*1024*1024)throw new ParallelJournalError('parallel_storage_quota');
        store.add({...parsed,...snapshot},address);done();
      }catch(error){abort(error);}};
    },'visualSnapshots');
  }
  async function loadRequestVisualSnapshot(scope:{userId:string;projectId:string;conversationId:string;requestId:string}):Promise<SelectedVisualInput|null>{
    const parsed=z.strictObject({userId:id,projectId:id,conversationId:z.union([id,z.literal('references')]),requestId:id}).parse(scope);
    const address=JSON.stringify([parsed.userId,parsed.projectId,parsed.conversationId,parsed.requestId]);
    const raw=await transaction('readonly',(store,done)=>{const request=store.get(address);request.onsuccess=()=>done(request.result);},'visualSnapshots');
    if(raw===undefined)return null;
    if(!raw||typeof raw!=='object'||!('userId' in raw)||!('projectId' in raw)||!('conversationId' in raw)||!('requestId' in raw)||!('manifest' in raw)||!('blobs' in raw)||raw.userId!==parsed.userId||raw.projectId!==parsed.projectId||raw.conversationId!==parsed.conversationId||raw.requestId!==parsed.requestId)throw new ParallelJournalError('parallel_storage_corrupt');
    try{
      if(!Array.isArray(raw.blobs)||raw.blobs.some(blob=>!(blob instanceof Blob)))throw Error();
      const snapshot={manifest:parseVisualInputManifest(raw.manifest),blobs:raw.blobs};
      await validateVisualSnapshot(snapshot);return snapshot;
    }catch{throw new ParallelJournalError('parallel_storage_corrupt');}
  }
  async function updatePreparation(userId:string,revision:number,operation:{kind:'intent_confirmed';epoch:number}|{kind:'plan_submitted'}|{kind:'revoke'}|{kind:'revoke_confirmed';epoch?:number}|{kind:'planned';plan:unknown}|{kind:'executing'}|{kind:'failed'}|{kind:'completed'}):Promise<ParallelPreparation>{
    const owner=id.parse(userId);
    if(!Number.isSafeInteger(revision)||revision<0)throw new ParallelJournalError('parallel_storage_invalid');
    return transaction('readwrite',(store,done,abort)=>{const request=store.get(owner);request.onsuccess=()=>{try{
      const current=parseParallelPreparation(request.result);
      if(current.userId!==owner)throw new ParallelJournalError('parallel_storage_corrupt');
      if(current.revision!==revision)throw new ParallelJournalError('parallel_storage_conflict');
      let next:ParallelPreparation;
      if(operation.kind==='intent_confirmed'&&['planning','planned'].includes(current.stage)&&current.intentId&&current.expectedEpoch!==undefined&&!current.revocationRequested&&current.intentEpoch===undefined&&operation.epoch===current.expectedEpoch+1)next=parseParallelPreparation({...current,intentEpoch:operation.epoch,revision:revision+1});
      else if(operation.kind==='plan_submitted'&&current.stage==='planning'&&current.intentEpoch!==undefined&&!current.revocationRequested&&!current.planSubmitted)next=parseParallelPreparation({...current,planSubmitted:true,revision:revision+1});
      else if(operation.kind==='revoke'&&current.intentId&&!current.revocationRequested)next=parseParallelPreparation({...current,revocationRequested:true,revision:revision+1});
      else if(operation.kind==='revoke_confirmed'&&current.intentId&&current.revocationRequested&&(!current.revocationConfirmed||current.revocationEpoch===undefined&&operation.epoch!==undefined)&&current.expectedEpoch!==undefined&&(operation.epoch===undefined||operation.epoch>current.expectedEpoch))next=parseParallelPreparation({...current,revocationConfirmed:true,...(operation.epoch===undefined?{}:{revocationEpoch:operation.epoch}),revision:revision+1});
      else if(operation.kind==='planned'&&current.stage==='planning'&&(!current.intentId||current.planSubmitted))next=parseParallelPreparation({...current,plan:operation.plan,stage:'planned',revision:revision+1});
      else if(operation.kind==='failed'&&current.stage==='planning')next=parseParallelPreparation({...current,stage:'failed',revision:revision+1});
      else if(operation.kind==='executing'&&current.stage==='planned'&&!current.revocationRequested)next=parseParallelPreparation({...current,stage:'executing',revision:revision+1});
      else if(operation.kind==='completed'&&current.stage==='executing')next=parseParallelPreparation({...current,stage:'completed',revision:revision+1});
      else throw new ParallelJournalError('parallel_storage_invalid');
      store.put(next,owner);done(next);
    }catch(error){abort(error instanceof ParallelJournalError?error:new ParallelJournalError('parallel_storage_invalid'));}};},'preparations');
  }
  /** Call only after the matching authenticated status read following confirmed revocation. */
  async function archiveTerminalPreparation(scope:ParallelScope,expectedRevision:number,evidence:'plan_absent'|'plan_failed'|'batch_absent'):Promise<void>{
    const address=scopeSchema.parse(scope),db=await open();
    return new Promise<void>((resolve,reject)=>{
      let tx:IDBTransaction,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','preparationHistory'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve();tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const live=tx.objectStore('preparations'),request=live.get(address.userId);
      request.onsuccess=()=>{try{
        const value=parseParallelPreparation(request.result);
        const terminal=value.stage==='planning'&&evidence==='plan_absent'||value.stage==='failed'&&evidence==='plan_failed'||(value.stage==='executing'||value.stage==='planned')&&evidence==='batch_absent';
        if(value.userId!==address.userId||value.projectId!==address.projectId||value.batchId!==address.batchId||value.revision!==expectedRevision||!value.intentId||!value.revocationConfirmed||!terminal)throw new ParallelJournalError('parallel_storage_conflict');
        tx.objectStore('preparationHistory').add(value,JSON.stringify([value.userId,value.batchId,value.intentId]));live.delete(value.userId);
      }catch(error){abort(error);}};
    });
  }
  async function loadArchivedPreparation(scope:ParallelScope,intentId:string):Promise<ParallelPreparation|null>{
    const address=scopeSchema.parse(scope),intent=id.parse(intentId);
    return transaction('readonly',(store,done,abort)=>{const request=store.get(JSON.stringify([address.userId,address.batchId,intent]));request.onsuccess=()=>{try{if(request.result===undefined){done(null);return;}const value=parseParallelPreparation(request.result);if(value.userId!==address.userId||value.projectId!==address.projectId||value.batchId!==address.batchId||value.intentId!==intent)throw Error();done(value);}catch{abort(new ParallelJournalError('parallel_storage_corrupt'));}};},'preparationHistory');
  }
  /** A fresh user gesture can bind an already paid plan to a new intent after confirmed revocation. */
  async function reissuePlannedIntent(scope:ParallelScope,expectedRevision:number,newIntentId:string,expectedEpoch:number):Promise<ParallelPreparation>{
    const address=scopeSchema.parse(scope),nextId=id.parse(newIntentId),nextEpoch=epoch.parse(expectedEpoch),db=await open();
    return new Promise<ParallelPreparation>((resolve,reject)=>{
      let tx:IDBTransaction,result:ParallelPreparation,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','preparationHistory'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const live=tx.objectStore('preparations'),request=live.get(address.userId);
      request.onsuccess=()=>{try{
        const current=parseParallelPreparation(request.result);
        if(current.userId!==address.userId||current.projectId!==address.projectId||current.batchId!==address.batchId||current.revision!==expectedRevision||current.stage!=='planned'||current.planSubmitted!==true||!current.intentId||current.intentId===nextId||!current.revocationConfirmed||current.revocationEpoch!==nextEpoch)throw new ParallelJournalError('parallel_storage_conflict');
        result=parseParallelPreparation({...current,intentId:nextId,expectedEpoch:nextEpoch,intentEpoch:undefined,revocationRequested:false,revocationConfirmed:false,revocationEpoch:undefined,revision:current.revision+1});
        tx.objectStore('preparationHistory').add(current,JSON.stringify([current.userId,current.batchId,current.intentId]));live.put(result,address.userId);
      }catch(error){abort(error);}};
    });
  }
  /** Commit the execution claim and all three local slots together before POST. */
  async function prepareExecution(scope:ParallelScope,expectedRevision:number):Promise<ParallelPreparation>{
    const address=scopeSchema.parse(scope),db=await open();
    return new Promise<ParallelPreparation>((resolve,reject)=>{
      let tx:IDBTransaction,result:ParallelPreparation,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','journals'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const preparations=tx.objectStore('preparations'),journals=tx.objectStore('journals'),a=preparations.get(address.userId),b=journals.get(key(address));let first:unknown,second:unknown,ready=0;
      const check=()=>{if(++ready!==2)return;try{
        const current=parseParallelPreparation(first);
        if(current.userId!==address.userId||current.projectId!==address.projectId||current.batchId!==address.batchId||current.revision!==expectedRevision||current.stage!=='planned'||current.planSubmitted!==true||!current.intentId||current.intentEpoch===undefined||current.revocationRequested)throw new ParallelJournalError('parallel_storage_conflict');
        const progress={children:current.imageIds.map((requestId,index)=>({requestId,position:index+1,status:'unconfirmed',revision:0,confirmedAt:null})),wait:{mode:'none'}};
        const journal=parseParallelJournal({version:1,...address,conversationId:current.conversationId,planRequestId:current.planRequestId,intentId:current.intentId,credentialSource:current.credentialSource,context:current.context,...(current.creationContext?{creationContext:current.creationContext}:{}),plan:current.plan,revision:0,progress});
        if(second!==undefined){const old=parseParallelJournal(second);const comparable={...old,intentId:current.intentId};if(JSON.stringify(comparable)!==JSON.stringify(journal))throw new ParallelJournalError('parallel_storage_conflict');}
        result=parseParallelPreparation({...current,stage:'executing',revision:current.revision+1});journals.put(journal,key(address));preparations.put(result,address.userId);
      }catch(error){abort(error);}};
      a.onsuccess=()=>{first=a.result;check();};b.onsuccess=()=>{second=b.result;check();};
    });
  }
  /** Retire only a complete batch after its visible wait; its immutable journal remains. */
  async function retireCompleted(scope:ParallelScope,expectedRevision:number,now:number,gates:ParallelGates):Promise<number>{
    const address=scopeSchema.parse(scope),db=await open();
    return new Promise<number>((resolve,reject)=>{
      let tx:IDBTransaction,result:number,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','journals','preparationHistory'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=()=>{failure=new ParallelJournalError('parallel_storage_conflict');try{tx.abort();}catch{reject(failure);}};
      const preparations=tx.objectStore('preparations'),a=preparations.get(address.userId),b=tx.objectStore('journals').get(key(address));
      let first:unknown,second:unknown,ready=0;
      const check=()=>{if(++ready!==2)return;try{
        const preparation=parseParallelPreparation(first),journal=parseParallelJournal(second),last=journal.replacements?.at(-1);
        const lastEpoch=last?(last.revocationRequested?last.revocationConfirmed?last.revocationEpoch:undefined:last.intentEpoch):(preparation.revocationRequested?preparation.revocationConfirmed?preparation.revocationEpoch:undefined:preparation.intentEpoch);
        if(preparation.userId!==address.userId||preparation.projectId!==address.projectId||preparation.batchId!==address.batchId||preparation.stage!=='executing'||preparation.revision!==expectedRevision||preparation.revocationRequested&&(!preparation.revocationConfirmed||preparation.revocationEpoch===undefined)||preparation.intentEpoch===undefined||!preparation.intentId||journal.intentId!==preparation.intentId||key(scopeFrom(journal))!==key(address)||last&&last.state!=='observed'||lastEpoch===undefined||!parallelWaitElapsed(journal.progress,now,gates))throw Error();
        result=lastEpoch;tx.objectStore('preparationHistory').add(preparation,JSON.stringify([preparation.userId,preparation.batchId,preparation.intentId]));preparations.delete(address.userId);
      }catch{abort();}};
      a.onsuccess=()=>{first=a.result;check();};b.onsuccess=()=>{second=b.result;check();};
    });
  }
  /** Persist one explicit replacement claim before creating authority or dispatching. */
  async function prepareReplacement(scope:ParallelScope,expectedRevision:number,claim:{position:number;previousId:string;requestId:string;intentId:string;expectedEpoch:number}):Promise<ParallelJournal>{
    const address=scopeSchema.parse(scope),db=await open();
    return new Promise<ParallelJournal>((resolve,reject)=>{
      let tx:IDBTransaction,result:ParallelJournal,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','journals'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const preparations=tx.objectStore('preparations'),journals=tx.objectStore('journals'),a=preparations.get(address.userId),b=journals.get(key(address));let first:unknown,second:unknown,ready=0;
      const check=()=>{if(++ready!==2)return;try{
        const prep=parseParallelPreparation(first),journal=parseParallelJournal(second),history=journal.replacements??[],last=history.at(-1);
        const candidate=replacementSchema.parse({...claim,state:'prepared',revocationRequested:false,revocationConfirmed:false});
        const priorEpoch=last?(last.revocationRequested?last.revocationConfirmed?last.revocationEpoch:undefined:last.intentEpoch):(prep.revocationRequested?prep.revocationConfirmed?prep.revocationEpoch:undefined:prep.intentEpoch);
        if(prep.userId!==address.userId||prep.projectId!==address.projectId||prep.batchId!==address.batchId||prep.stage!=='executing'||key(scopeFrom(journal))!==key(address)||journal.revision!==expectedRevision||prep.intentId!==journal.intentId||priorEpoch===undefined||candidate.expectedEpoch!==priorEpoch||last&&!['observed','abandoned'].includes(last.state)||journal.progress.children.some(item=>!['completed','rejected'].includes(item.status))||!journal.progress.children.some(item=>item.position===candidate.position&&item.requestId===candidate.previousId&&item.status==='rejected')||journal.progress.children.some(item=>item.requestId===candidate.requestId)||prep.imageIds.includes(candidate.requestId)||candidate.intentId===prep.intentId||history.some(item=>item.requestId===candidate.requestId||item.intentId===candidate.intentId))throw new ParallelJournalError('parallel_storage_conflict');
        result=parseParallelJournal({...journal,replacements:[...history,candidate],revision:journal.revision+1});journals.put(result,key(address));
      }catch(error){abort(error);}};a.onsuccess=()=>{first=a.result;check();};b.onsuccess=()=>{second=b.result;check();};
    });
  }
  async function updateReplacement(scope:ParallelScope,expectedRevision:number,operation:{kind:'intent_confirmed';epoch:number}|{kind:'submitted'}|{kind:'revoke'}|{kind:'revoke_confirmed';epoch?:number}):Promise<ParallelJournal>{
    const address=scopeSchema.parse(scope);
    return transaction('readwrite',(store,done,abort)=>{const request=store.get(key(address));request.onsuccess=()=>{try{
      const journal=parseParallelJournal(request.result),history=journal.replacements??[],current=history.at(-1);
      if(key(scopeFrom(journal))!==key(address)||journal.revision!==expectedRevision||!current)throw new ParallelJournalError('parallel_storage_conflict');
      let next:ParallelReplacement;
      if(operation.kind==='intent_confirmed'&&current.state==='prepared'&&!current.revocationRequested&&current.intentEpoch===undefined&&operation.epoch===current.expectedEpoch+1)next={...current,intentEpoch:operation.epoch};
      else if(operation.kind==='submitted'&&current.state==='prepared'&&current.intentEpoch!==undefined&&!current.revocationRequested)next={...current,state:'submitted'};
      else if(operation.kind==='revoke'&&!current.revocationRequested)next={...current,revocationRequested:true};
      else if(operation.kind==='revoke_confirmed'&&current.revocationRequested&&(!current.revocationConfirmed||current.revocationEpoch===undefined&&operation.epoch!==undefined)&&(operation.epoch===undefined||operation.epoch>current.expectedEpoch))next={...current,revocationConfirmed:true,...(operation.epoch===undefined?{}:{revocationEpoch:operation.epoch})};
      else throw new ParallelJournalError('parallel_storage_conflict');
      const result=parseParallelJournal({...journal,replacements:[...history.slice(0,-1),next],revision:journal.revision+1});store.put(result,key(address));done(result);
    }catch(error){abort(error);}};});
  }
  /** Caller supplies the scoped authenticated status read after confirmed revocation. */
  async function abandonReplacement(scope:ParallelScope,expectedRevision:number,observation:ParallelObservation):Promise<ParallelJournal>{
    const address=scopeSchema.parse(scope);
    const observed=z.strictObject({requestId:id,position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),status:z.literal('rejected'),revision:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER))}).parse(observation);
    return transaction('readwrite',(store,done,abort)=>{const request=store.get(key(address));request.onsuccess=()=>{try{
      const journal=parseParallelJournal(request.result),history=journal.replacements??[],current=history.at(-1),child=journal.progress.children.find(item=>item.position===observed.position);
      if(key(scopeFrom(journal))!==key(address)||journal.revision!==expectedRevision||!current||!['prepared','submitted'].includes(current.state)||!current.revocationConfirmed||current.position!==observed.position||current.previousId!==observed.requestId||!child||child.requestId!==current.previousId||child.status!=='rejected'||observed.revision<child.revision)throw new ParallelJournalError('parallel_storage_conflict');
      const result=parseParallelJournal({...journal,replacements:[...history.slice(0,-1),{...current,state:'abandoned'}],revision:journal.revision+1});store.put(result,key(address));done(result);
    }catch(error){abort(error);}};});
  }
  async function update(scope:ParallelScope,expectedRevision:number,operation:ParallelJournalUpdate):Promise<ParallelJournal>{
    const address=scopeSchema.parse(scope);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new ParallelJournalError('parallel_storage_invalid');
    return transaction('readwrite',(store,done,abort)=>{
      const request=store.get(key(address));
      request.onsuccess=()=>{try{
        const current=parseParallelJournal(request.result);
        if(key(scopeFrom(current))!==key(address))throw new ParallelJournalError('parallel_storage_corrupt');
        if(current.revision!==expectedRevision)throw new ParallelJournalError('parallel_storage_conflict');
        let progress,replacements=current.replacements;
        switch(operation.kind){
          case 'observe':progress=observeParallelChild(current.progress,operation.observation,operation.now,operation.visible);break;
          case 'observe_replacement':{
            const claim=replacements?.at(-1),observed=operation.observation;
            if(!claim||claim.state!=='submitted'||claim.position!==observed.position||claim.previousId!==observed.previousId||claim.requestId!==observed.requestId)throw new ParallelJournalError('parallel_storage_conflict');
            progress=replaceRejectedParallelChild(current.progress,observed,operation.now,operation.visible);
            replacements=[...replacements!.slice(0,-1),{...claim,state:'observed'}];break;
          }
          case 'pause':progress=pauseParallelWait(current.progress,operation.now);break;
          case 'restore':progress=restoreParallelWait(current.progress);break;
          case 'gates':progress=reconcileParallelGates(current.progress,operation.now,operation.gates);break;
          case 'resume':progress=resumeParallelWait(current.progress,operation.now,operation.gates);break;
          default:throw new ParallelJournalError('parallel_storage_invalid');
        }
        if(JSON.stringify(progress)===JSON.stringify(current.progress)&&replacements===current.replacements){done(current);return;}
        const next=parseParallelJournal({...current,progress,...(replacements?{replacements}:{}),revision:current.revision+1});store.put(next,key(address));done(next);
      }catch(error){abort(error instanceof ParallelJournalError?error:new ParallelJournalError('parallel_storage_invalid'));}};
    });
  }
  return {load,loadForRecovery,createBeforeDispatch,loadPreparation,createBeforePlanning,createBeforePlanningWithVisual,loadVisualSnapshot,saveRequestVisualSnapshot,loadRequestVisualSnapshot,updatePreparation,archiveTerminalPreparation,loadArchivedPreparation,reissuePlannedIntent,prepareExecution,retireCompleted,prepareReplacement,updateReplacement,abandonReplacement,update,close:()=>{connection?.close();connection=null;}};
}
