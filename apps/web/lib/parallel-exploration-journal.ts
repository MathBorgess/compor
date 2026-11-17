import {validateCompletedExplorationPlan,validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import * as z from './schema.ts';
import {parallelProgressSchema,observeParallelChild,pauseParallelWait,restoreParallelWait,resumeParallelWait,reconcileParallelGates,type ParallelObservation,type ParallelGates} from './parallel-exploration-progress.ts';

const id=z.uuid();
const scopeSchema=z.strictObject({userId:id,projectId:id,batchId:id});
const journalSchema=z.strictObject({version:z.literal(1),userId:id,projectId:id,batchId:id,conversationId:z.union([id,z.literal('references')]),planRequestId:id,credentialSource:z.enum(['byok','default']),context:z.unknown(),plan:z.unknown(),revision:z.number().check(z.int()).check(z.nonnegative()),progress:parallelProgressSchema});
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
      try{request=indexedDB.open(name,1);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('journals'))request.result.createObjectStore('journals');};
      request.onerror=()=>rejectOnce(request.error);
      request.onblocked=()=>rejectOnce(new ParallelJournalError('parallel_storage_blocked'));
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=null;};resolve(db);};
    }).finally(()=>{opening=null;});
    return opening;
  }
  async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(value:T)=>void,abort:(error:unknown)=>void)=>void):Promise<T>{
    const db=await open();
    return new Promise<T>((resolve,reject)=>{
      let tx:IDBTransaction,result:T,failure:ParallelJournalError|null=null;
      try{tx=db.transaction('journals',mode);}catch(error){reject(failCode(error));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>{};
      tx.onabort=()=>reject(failure??failCode(tx.error));
      const abort=(error:unknown)=>{failure=failCode(error);try{tx.abort();}catch{reject(failure);}};
      try{action(tx.objectStore('journals'),value=>{result=value;},abort);}catch(error){abort(error);}
    });
  }
  /** A recovered view cannot infer elapsed visible time while the page was closed. */
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
  return {loadForRecovery,createBeforeDispatch,update,close:()=>{connection?.close();connection=null;}};
}
