import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import * as z from './schema.ts';
import {creationContextSchema} from './studio-domain.ts';
import {parallelProgressSchema,observeParallelChild,pauseParallelWait,restoreParallelWait,resumeParallelWait,reconcileParallelGates,parallelWaitElapsed,type ParallelObservation,type ParallelGates} from './parallel-exploration-progress.ts';

const id=z.uuid();
const scopeSchema=z.strictObject({userId:id,projectId:id,batchId:id});
const journalSchema=z.strictObject({version:z.literal(1),userId:id,projectId:id,batchId:id,conversationId:z.union([id,z.literal('references')]),planRequestId:id,intentId:z.optional(id),credentialSource:z.enum(['byok','default']),context:z.unknown(),plan:z.unknown(),revision:z.number().check(z.int()).check(z.nonnegative()),progress:parallelProgressSchema});
const epoch=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1));
const preparationSchema=z.strictObject({version:z.literal(1),userId:id,projectId:id,batchId:id,conversationId:z.union([id,z.literal('references')]),planRequestId:id,credentialSource:z.enum(['byok','default']),imageIds:z.array(id).check(z.minLength(3)).check(z.maxLength(3)),context:z.unknown(),creationContext:z.optional(creationContextSchema),intentId:z.optional(id),expectedEpoch:z.optional(epoch),intentEpoch:z.optional(epoch),planSubmitted:z.optional(z.boolean()),revocationRequested:z.optional(z.boolean()),revocationConfirmed:z.optional(z.boolean()),revocationEpoch:z.optional(epoch),plan:z.nullable(z.unknown()),stage:z.enum(['planning','planned','executing','completed','failed']),revision:z.number().check(z.int()).check(z.nonnegative())}).check(z.refine(value=>new Set(value.imageIds).size===3&&(value.stage==='planning'||value.stage==='failed'?value.plan===null:value.plan!==null)&&(value.intentId===undefined)===(value.expectedEpoch===undefined)&&(value.intentEpoch===undefined||value.expectedEpoch!==undefined&&value.intentEpoch===value.expectedEpoch+1)&&(!value.planSubmitted||value.intentEpoch!==undefined||value.stage==='planned')&&(!value.revocationConfirmed||value.revocationRequested===true&&value.revocationEpoch!==undefined)&&(value.revocationEpoch===undefined||value.revocationConfirmed===true)));
export type ParallelPreparation=z.infer<typeof preparationSchema>;
export type ParallelJournal=z.infer<typeof journalSchema>;
export type ParallelScope=z.infer<typeof scopeSchema>;
export type ParallelJournalUpdate=
 | {kind:'observe';observation:ParallelObservation;now:number;visible:boolean}
 | {kind:'pause';now:number}
 | {kind:'restore'}
 | {kind:'gates';now:number;gates:ParallelGates}
 | {kind:'resume';now:number;gates:ParallelGates};

/** Creative context stays local; authentication, tokens and planBinding are rejected by the strict schema. */
export function parseParallelJournal(input:unknown):ParallelJournal {
  const value=journalSchema.parse(input);
  if(!validateExplorationContext(value.context)||!validateCompletedExplorationPlan(value.plan,value.context))throw Error('parallel_invalid_plan');
  return value;
}
export function parseParallelPreparation(input:unknown):ParallelPreparation {
  const value=preparationSchema.parse(input);
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
      try{request=indexedDB.open(name,3);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('journals'))request.result.createObjectStore('journals');if(!request.result.objectStoreNames.contains('preparations'))request.result.createObjectStore('preparations');if(!request.result.objectStoreNames.contains('preparationHistory'))request.result.createObjectStore('preparationHistory');};
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
    if(value.revision!==0||value.stage!=='planning'||(value.intentId!==undefined&&(value.planSubmitted!==false||value.revocationRequested!==false)))throw new ParallelJournalError('parallel_storage_invalid');
    return transaction('readwrite',(store,done,abort)=>{const request=store.get(value.userId);request.onsuccess=()=>{if(request.result!==undefined){abort(new ParallelJournalError('parallel_storage_exists'));return;}try{store.add(value,value.userId);done(value);}catch(error){abort(error);}};},'preparations');
  }
  async function updatePreparation(userId:string,revision:number,operation:{kind:'intent_confirmed';epoch:number}|{kind:'plan_submitted'}|{kind:'revoke'}|{kind:'revoke_confirmed';epoch:number}|{kind:'planned';plan:unknown}|{kind:'executing'}|{kind:'failed'}|{kind:'completed'}):Promise<ParallelPreparation>{
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
      else if(operation.kind==='revoke_confirmed'&&current.intentId&&current.revocationRequested&&!current.revocationConfirmed&&current.expectedEpoch!==undefined&&operation.epoch>current.expectedEpoch)next=parseParallelPreparation({...current,revocationConfirmed:true,revocationEpoch:operation.epoch,revision:revision+1});
      else if(operation.kind==='planned'&&current.stage==='planning'&&(!current.intentId||current.planSubmitted))next=parseParallelPreparation({...current,plan:operation.plan,stage:'planned',revision:revision+1});
      else if(operation.kind==='failed'&&current.stage==='planning')next=parseParallelPreparation({...current,stage:'failed',revision:revision+1});
      else if(operation.kind==='executing'&&current.stage==='planned'&&!current.revocationRequested)next=parseParallelPreparation({...current,stage:'executing',revision:revision+1});
      else if(operation.kind==='completed'&&current.stage==='executing')next=parseParallelPreparation({...current,stage:'completed',revision:revision+1});
      else throw new ParallelJournalError('parallel_storage_invalid');
      store.put(next,owner);done(next);
    }catch(error){abort(error instanceof ParallelJournalError?error:new ParallelJournalError('parallel_storage_invalid'));}};},'preparations');
  }
  /** Archive and release only an explicitly revoked terminal/no-submit attempt. */
  async function archiveTerminalPreparation(scope:ParallelScope,expectedRevision:number):Promise<void>{
    const address=scopeSchema.parse(scope),db=await open();
    return new Promise<void>((resolve,reject)=>{
      let tx:IDBTransaction,failure:ParallelJournalError|null=null;
      try{tx=db.transaction(['preparations','preparationHistory'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve();tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      const live=tx.objectStore('preparations'),request=live.get(address.userId);
      request.onsuccess=()=>{try{
        const value=parseParallelPreparation(request.result);
        if(value.userId!==address.userId||value.projectId!==address.projectId||value.batchId!==address.batchId||value.revision!==expectedRevision||!value.intentId||!value.revocationConfirmed||!(value.stage==='failed'||value.stage==='planning'&&value.planSubmitted===false))throw new ParallelJournalError('parallel_storage_conflict');
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
        const journal=parseParallelJournal({version:1,...address,conversationId:current.conversationId,planRequestId:current.planRequestId,intentId:current.intentId,credentialSource:current.credentialSource,context:current.context,plan:current.plan,revision:0,progress});
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
      try{tx=db.transaction(['preparations','journals'],'readwrite');}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=()=>{failure=new ParallelJournalError('parallel_storage_conflict');try{tx.abort();}catch{reject(failure);}};
      const preparations=tx.objectStore('preparations'),a=preparations.get(address.userId),b=tx.objectStore('journals').get(key(address));
      let first:unknown,second:unknown,ready=0;
      const check=()=>{if(++ready!==2)return;try{const preparation=parseParallelPreparation(first),journal=parseParallelJournal(second);if(preparation.userId!==address.userId||preparation.projectId!==address.projectId||preparation.batchId!==address.batchId||preparation.stage!=='executing'||preparation.revision!==expectedRevision||preparation.revocationRequested&&!preparation.revocationConfirmed||preparation.intentEpoch===undefined||journal.intentId!==preparation.intentId||key(scopeFrom(journal))!==key(address)||!parallelWaitElapsed(journal.progress,now,gates))throw Error();result=preparation.revocationEpoch??preparation.intentEpoch;preparations.delete(address.userId);}catch{abort();}};
      a.onsuccess=()=>{first=a.result;check();};b.onsuccess=()=>{second=b.result;check();};
    });
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
        let progress;
        switch(operation.kind){
          case 'observe':progress=observeParallelChild(current.progress,operation.observation,operation.now,operation.visible);break;
          case 'pause':progress=pauseParallelWait(current.progress,operation.now);break;
          case 'restore':progress=restoreParallelWait(current.progress);break;
          case 'gates':progress=reconcileParallelGates(current.progress,operation.now,operation.gates);break;
          case 'resume':progress=resumeParallelWait(current.progress,operation.now,operation.gates);break;
          default:throw new ParallelJournalError('parallel_storage_invalid');
        }
        if(JSON.stringify(progress)===JSON.stringify(current.progress)){done(current);return;}
        const next=parseParallelJournal({...current,progress,revision:current.revision+1});store.put(next,key(address));done(next);
      }catch(error){abort(error instanceof ParallelJournalError?error:new ParallelJournalError('parallel_storage_invalid'));}};
    });
  }
  return {load,loadForRecovery,createBeforeDispatch,loadPreparation,createBeforePlanning,updatePreparation,archiveTerminalPreparation,loadArchivedPreparation,reissuePlannedIntent,prepareExecution,retireCompleted,update,close:()=>{connection?.close();connection=null;}};
}
