import * as z from './schema.ts';
import {referenceSchema, type StudioReference, type StudioState, type StudioScope} from './studio-domain.ts';
export interface DraftAssetAddress {pieceId:string;baseVersion:number;kind:'base'|'preview'}
export interface DraftAssetMetadata extends DraftAssetAddress {mime:string;size:number;width:number;height:number}
export interface StoredReference {metadata:StudioReference;file:Blob}
export interface StoredDraftAsset {metadata:DraftAssetMetadata;file:Blob}
interface StoredRecord {key:string;scope:string;metadata:StudioReference|DraftAssetMetadata;file:Blob}
const assetMetadataSchema=z.strictObject({pieceId:z.string(),baseVersion:z.number(),kind:z.enum(['base','preview']),mime:z.string(),size:z.number(),width:z.number(),height:z.number()});
const recordSchema=z.object({key:z.string(),scope:z.string(),metadata:z.union([referenceSchema,assetMetadataSchema]),file:z.instanceof(Blob)});
function parseRecord(input:unknown):StoredRecord {const value=recordSchema.safeParse(input);if(!value.success)throw new StudioStorageError('studio_storage_corrupt');return value.data;}
function parseRecords(input:unknown):StoredRecord[]{if(!Array.isArray(input))throw new StudioStorageError('studio_storage_corrupt');return input.map(parseRecord);}
import {studioImageDimensions,studioImageDimensionsMatch} from './studio-image.ts';
import { parseStudioState, STUDIO_LIMITS } from './studio-state.ts';
import {effectiveReferences,selectScopedReference,unselectScopedReference} from './studio-post-context.ts';
import {referenceSelectionProjection,referenceSelectionWriteSchema} from './reference-selection-projection.ts';

export class StudioStorageError extends Error {
  code:string; currentRevision?:number;
  constructor(code:string, {currentRevision}: {currentRevision?:number} = {}) { super(code); this.name='StudioStorageError'; this.code=code; if(Number.isSafeInteger(currentRevision))this.currentRevision=currentRevision; }
}
const uuid = (value:unknown):value is string => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function scopeOf({userId,projectId}: Partial<StudioScope>={}) { if(!uuid(userId)||!uuid(projectId))throw new StudioStorageError('studio_storage_invalid');return JSON.stringify([userId,projectId]); }
const referenceKey = (scope:string,id:string) => {if(!uuid(id))throw new StudioStorageError('studio_storage_invalid');return JSON.stringify([scope,id]);};
function draftAddress(scope:string,{pieceId,baseVersion,kind}:Partial<DraftAssetAddress>={}) {if(!uuid(pieceId)||typeof baseVersion!=='number'||!Number.isSafeInteger(baseVersion)||baseVersion<0||(kind!=='base'&&kind!=='preview'))throw new StudioStorageError('studio_storage_invalid');return{key:JSON.stringify([scope,pieceId,baseVersion,kind]),pieceId,baseVersion,kind};}
const storageError = (error: unknown) => error instanceof StudioStorageError ? error : new StudioStorageError(error instanceof Error && error.name==='QuotaExceededError'?'studio_storage_quota':'studio_storage_unavailable');
const metadataValid = (value: StudioReference) => value && Object.getPrototypeOf(value)===Object.prototype && referenceSchema.safeParse(value).success && uuid(value.id) && typeof value.name==='string' && value.name.length>0 && value.name.length<=200 && !/sk-[A-Za-z0-9_-]{20,}/.test(value.name) && ['image/png','image/jpeg'].includes(value.mime) && Number.isSafeInteger(value.size) && value.size>0 && value.size<=STUDIO_LIMITS.referenceBytes && Number.isSafeInteger(value.width)&&value.width>0 && Number.isSafeInteger(value.height)&&value.height>0 && value.width*value.height<=40_000_000;
const assetMetadataValid = (value: DraftAssetMetadata) => value && Object.getPrototypeOf(value)===Object.prototype && Object.keys(value).sort().join(',')==='baseVersion,height,kind,mime,pieceId,size,width' && uuid(value.pieceId) && Number.isSafeInteger(value.baseVersion)&&value.baseVersion>=0 && ['base','preview'].includes(value.kind) && ['image/png','image/jpeg'].includes(value.mime) && Number.isSafeInteger(value.size)&&value.size>0&&value.size<=STUDIO_LIMITS.referenceBytes && Number.isSafeInteger(value.width)&&value.width>0 && Number.isSafeInteger(value.height)&&value.height>0 && value.width*value.height<=40_000_000;
const recordValid = (record: StoredRecord,asset=false) => record && (asset?("pieceId" in record.metadata && assetMetadataValid(record.metadata)):("id" in record.metadata && metadataValid(record.metadata))) && record.file instanceof Blob && record.file.size===record.metadata.size && record.file.type===record.metadata.mime;

function checkGlobalBudget(references:StoredRecord[],assets:StoredRecord[],replacementKey:string|null,newSize:number) {
  if(references.some(record=>!recordValid(record))||assets.some(record=>!recordValid(record,true)))throw new StudioStorageError('studio_storage_corrupt');
  const records=[...references,...assets].filter(record=>record.key!==replacementKey);
  if(records.length+1>STUDIO_LIMITS.localFiles||records.reduce((total,record)=>total+record.metadata.size,newSize)>STUDIO_LIMITS.localFileBytes)throw new StudioStorageError('studio_storage_quota');
}

/**
 * Browser-only content. IDB v6 retains state/reference/draft asset stores and archives schemas 1–3 before their first converted save.
 * References and draft assets share an atomic 256 MiB / 500 blob budget for this database;
 * existing per-project reference limits still apply. Quota errors never evict content.
 * State is limited to 512 KiB per project, without a global project/state count limit.
 * Scope keys segregate app state, not access from other same-origin code.
 */
export function createStudioStorage({indexedDB=globalThis.indexedDB, name='compor-studio-v1', decodeImage=globalThis.createImageBitmap}: {indexedDB?:IDBFactory;name?:string;decodeImage?:(blob:Blob)=>Promise<Pick<ImageBitmap,'width'|'height'|'close'>>}={}) {
  if(typeof name!=='string'||!/^compor-studio-[a-z0-9-]{1,60}$/.test(name))throw new StudioStorageError('studio_storage_invalid');
  let connection:IDBDatabase|null=null, opening:Promise<IDBDatabase>|null=null, fileQueue:Promise<unknown>=Promise.resolve();
  const open=():Promise<IDBDatabase>=>{
    if(connection)return Promise.resolve(connection);
    if(opening)return opening;
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.reject(new StudioStorageError('studio_storage_unavailable'));
    opening=new Promise<IDBDatabase>((resolve,reject)=>{
      let request:IDBOpenDBRequest,settled=false;
      const rejectOnce=(error:unknown)=>{if(!settled){settled=true;reject(storageError(error));}};
      try{request=indexedDB.open(name,6);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('states'))db.createObjectStore('states',{keyPath:'scope'});if(!db.objectStoreNames.contains('legacyStates'))db.createObjectStore('legacyStates',{keyPath:'scope'});if(!db.objectStoreNames.contains('stateArchives'))db.createObjectStore('stateArchives',{keyPath:'key'});if(!db.objectStoreNames.contains('references'))db.createObjectStore('references',{keyPath:'key'}).createIndex('scope','scope');if(!db.objectStoreNames.contains('draftAssets'))db.createObjectStore('draftAssets',{keyPath:'key'}).createIndex('scope','scope');if(!db.objectStoreNames.contains('referenceCommands'))db.createObjectStore('referenceCommands',{keyPath:'scope'});if(!db.objectStoreNames.contains('referenceSync'))db.createObjectStore('referenceSync',{keyPath:'scope'});};
      request.onerror=()=>rejectOnce(request.error);
      request.onblocked=()=>rejectOnce(new StudioStorageError('studio_storage_blocked'));
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=null;};resolve(db);};
    }).finally(()=>{opening=null;});
    return opening;
  };
  const transaction=async<T>(stores:string[],mode:IDBTransactionMode,action:(tx:IDBTransaction,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>=>{
    const db=await open();
    return new Promise<T>((resolve,reject)=>{
      let tx:IDBTransaction,result:T,failure:StudioStorageError|null=null;
      try{tx=db.transaction(stores,mode);}catch(error){reject(storageError(error));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure??storageError(tx.error));
      tx.onerror=()=>{};
      const fail=(error:unknown)=>{failure=storageError(error);try{tx.abort();}catch{reject(failure);}};
      try{action(tx,value=>{result=value;},fail);}catch(error){fail(error);}
    });
  };
  const readState=(input:unknown,scope:string):StudioState|null=>{
    const record=z.optional(z.object({scope:z.string(),state:z.unknown()})).parse(input);
    if(record===undefined)return null;
    try{if(record.scope!==scope)throw Error();const state=parseStudioState(record.state);if(scopeOf(state)!==scope)throw Error();return state;}catch{throw new StudioStorageError('studio_storage_corrupt');}
  };
  async function load(scope:StudioScope):Promise<StudioState|null> {
    const key=scopeOf(scope);
    return transaction(['states'],'readonly',(tx,done,fail)=>{const request=tx.objectStore('states').get(key);request.onsuccess=()=>{try{done(readState(request.result,key));}catch(error){fail(error);}};});
  }
  async function save(value:unknown,{expectedRevision}: {expectedRevision?:number|null}={}):Promise<StudioState> {
    let state;try{state=parseStudioState(value);}catch{throw new StudioStorageError('studio_storage_invalid');}
    if(expectedRevision!==null && (typeof expectedRevision!=='number'||!Number.isSafeInteger(expectedRevision)||expectedRevision<0))throw new StudioStorageError('studio_storage_invalid');
    const scope=scopeOf(state);
    return transaction(['states','legacyStates','stateArchives'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('states'),request=store.get(scope);
      request.onsuccess=()=>{
        try{
          const existing=readState(request.result,scope);
          if((existing?.revision??null)!==expectedRevision)throw new StudioStorageError('studio_storage_conflict',{currentRevision:existing?.revision});
          if(existing && state.revision<=existing.revision){if(JSON.stringify(existing)===JSON.stringify(state)){done(state);return;}throw new StudioStorageError('studio_storage_invalid');}
          const previous=z.optional(z.object({state:z.catchall(z.object({schemaVersion:z.number()}),z.unknown())})).parse(request.result);
          if(previous&&[1,2,3].includes(previous.state.schemaVersion)){tx.objectStore('stateArchives').put({key:JSON.stringify([scope,previous.state.schemaVersion]),scope,state:previous.state});if(previous.state.schemaVersion===1)tx.objectStore('legacyStates').put({scope,state:previous.state});}
          store.put({scope,state});done(state);
        }catch(error){fail(error);}
      };
    });
  }
  /** Selection changes and their pending command commit in one local transaction. */
  const authorityRecord=z.strictObject({scope:z.string(),commandId:z.uuid(),expectedRemoteRevision:z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1)),localRevision:z.number().check(z.int()).check(z.nonnegative()),selection:referenceSelectionWriteSchema});
  const authoritySync=z.strictObject({scope:z.string(),revision:z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER)),selection:referenceSelectionWriteSchema});
  type AuthorityCommand=z.infer<typeof authorityRecord>;
  async function readReferenceAuthority(scope:StudioScope){
    const address=scopeOf(scope);
    return transaction<{state:StudioState;pending:AuthorityCommand|null;confirmed:z.infer<typeof authoritySync>|null}>(['states','referenceCommands','referenceSync'],'readonly',(tx,done,fail)=>{
      const requests=[tx.objectStore('states').get(address),tx.objectStore('referenceCommands').get(address),tx.objectStore('referenceSync').get(address)];let remaining=requests.length;
      const finish=()=>{if(--remaining)return;try{const state=readState(requests[0].result,address);if(!state)throw new StudioStorageError('studio_storage_invalid');const pending=requests[1].result===undefined?null:authorityRecord.parse(requests[1].result),confirmed=requests[2].result===undefined?null:authoritySync.parse(requests[2].result);if(pending&&pending.scope!==address||confirmed&&confirmed.scope!==address)throw Error();done({state,pending,confirmed});}catch(error){fail(error instanceof StudioStorageError?error:new StudioStorageError('studio_storage_corrupt'));}};
      requests.forEach(request=>{request.onsuccess=finish;});
    });
  }
  /** Establish only an observed matching baseline; never adopt a later revision silently. */
  async function establishReferenceAuthority(scope:StudioScope,localRevision:number,remoteRevision:number,selection:z.infer<typeof referenceSelectionWriteSchema>){
    const address=scopeOf(scope),expected=referenceSelectionWriteSchema.parse(selection);
    if(!Number.isSafeInteger(localRevision)||localRevision<0||!Number.isSafeInteger(remoteRevision)||remoteRevision<0)throw new StudioStorageError('studio_storage_invalid');
    return transaction<void>(['states','referenceCommands','referenceSync'],'readwrite',(tx,done,fail)=>{
      const requests=[tx.objectStore('states').get(address),tx.objectStore('referenceCommands').get(address),tx.objectStore('referenceSync').get(address)];let remaining=requests.length;
      const finish=()=>{if(--remaining)return;try{const state=readState(requests[0].result,address),old=requests[2].result===undefined?null:authoritySync.parse(requests[2].result);if(!state||state.revision!==localRevision||requests[1].result!==undefined||JSON.stringify(referenceSelectionProjection(state))!==JSON.stringify(expected)||old&&(old.scope!==address||old.revision!==remoteRevision||JSON.stringify(old.selection)!==JSON.stringify(expected)))throw new StudioStorageError('studio_storage_conflict');tx.objectStore('referenceSync').put({scope:address,revision:remoteRevision,selection:expected});done();}catch(error){fail(error);}};
      requests.forEach(request=>{request.onsuccess=finish;});
    });
  }
  type ReferenceChange={kind:'select';reference:StudioReference;target:string}|{kind:'unselect';id:string;target:string};
  async function beginReferenceAuthorityChange(scope:StudioScope,{commandId,expectedLocalRevision,expectedRemoteRevision,change}:{commandId:string;expectedLocalRevision:number;expectedRemoteRevision:number;change:ReferenceChange}){
    const address=scopeOf(scope);
    if(!uuid(commandId)||!Number.isSafeInteger(expectedLocalRevision)||expectedLocalRevision<0||!Number.isSafeInteger(expectedRemoteRevision)||expectedRemoteRevision<0||expectedRemoteRevision>=Number.MAX_SAFE_INTEGER||!change||!['select','unselect'].includes(change.kind)||(change.target!=='references'&&!uuid(change.target)))throw new StudioStorageError('studio_storage_invalid');
    return transaction<{state:StudioState;command:AuthorityCommand|null}>(['states','references','referenceCommands','referenceSync','stateArchives','legacyStates'],'readwrite',(tx,done,fail)=>{
      const requests=[tx.objectStore('states').get(address),tx.objectStore('referenceCommands').get(address),tx.objectStore('referenceSync').get(address)];let remaining=requests.length;
      const finish=()=>{if(--remaining)return;try{
        const state=readState(requests[0].result,address),synced=requests[2].result===undefined?null:authoritySync.parse(requests[2].result);
        if(!state||state.revision!==expectedLocalRevision||requests[1].result!==undefined||!synced||synced.scope!==address||synced.revision!==expectedRemoteRevision||JSON.stringify(referenceSelectionProjection(state))!==JSON.stringify(synced.selection))throw new StudioStorageError('studio_storage_conflict');
        const apply=(reference?:StudioReference)=>{try{
          if(change.kind==='unselect'&&!effectiveReferences(state,change.target).some(item=>item.id===change.id))throw new StudioStorageError('studio_storage_invalid');
          const next=change.kind==='select'?selectScopedReference(state,reference!,change.target):unselectScopedReference(state,change.id,change.target);
          const selection=referenceSelectionProjection(next);
          const previous=z.optional(z.object({state:z.catchall(z.object({schemaVersion:z.number()}),z.unknown())})).parse(requests[0].result);
          if(previous&&[1,2,3].includes(previous.state.schemaVersion)){tx.objectStore('stateArchives').put({key:JSON.stringify([address,previous.state.schemaVersion]),scope:address,state:previous.state});if(previous.state.schemaVersion===1)tx.objectStore('legacyStates').put({scope:address,state:previous.state});}
          tx.objectStore('states').put({scope:address,state:next});
          if(JSON.stringify(selection)===JSON.stringify(synced.selection)){done({state:next,command:null});return;}
          const command=authorityRecord.parse({scope:address,commandId,expectedRemoteRevision,localRevision:next.revision,selection});
          tx.objectStore('referenceCommands').add(command);done({state:next,command});
        }catch(error){fail(error);}};
        if(change.kind==='select'){
          const metadata=referenceSchema.parse(change.reference);if(!uuid(metadata.id))throw new StudioStorageError('studio_storage_invalid');
          const request=tx.objectStore('references').get(referenceKey(address,metadata.id));request.onsuccess=()=>{try{const stored=parseRecord(request.result);if(stored.scope!==address||!('id' in stored.metadata)||!recordValid(stored)||JSON.stringify(stored.metadata)!==JSON.stringify(metadata))throw new StudioStorageError('studio_storage_corrupt');apply(metadata);}catch(error){fail(error);}};
        }else apply();
      }catch(error){fail(error);}};
      requests.forEach(request=>{request.onsuccess=finish;});
    });
  }
  /** Clear only the exact confirmed command and retain its synchronized revision. */
  async function confirmReferenceAuthorityChange(scope:StudioScope,commandId:string,remoteRevision:number){
    const address=scopeOf(scope);if(!uuid(commandId)||!Number.isSafeInteger(remoteRevision)||remoteRevision<1)throw new StudioStorageError('studio_storage_invalid');
    return transaction<void>(['states','referenceCommands','referenceSync'],'readwrite',(tx,done,fail)=>{
      const requests=[tx.objectStore('states').get(address),tx.objectStore('referenceCommands').get(address),tx.objectStore('referenceSync').get(address)];let remaining=requests.length;
      const finish=()=>{if(--remaining)return;try{const state=readState(requests[0].result,address),command=authorityRecord.parse(requests[1].result),old=authoritySync.parse(requests[2].result);if(!state||command.scope!==address||old.scope!==address||command.commandId!==commandId||command.expectedRemoteRevision!==old.revision||remoteRevision!==old.revision+1||JSON.stringify(referenceSelectionProjection(state))!==JSON.stringify(command.selection))throw new StudioStorageError('studio_storage_conflict');tx.objectStore('referenceSync').put({scope:address,revision:remoteRevision,selection:command.selection});tx.objectStore('referenceCommands').delete(address);done();}catch(error){fail(error);}};
      requests.forEach(request=>{request.onsuccess=finish;});
    });
  }
  async function prepareFile({id,file,source}:{id:string;file:File;source?:StudioReference['source']}):Promise<StudioReference> {
    if(!uuid(id)||!(file instanceof Blob)||!['image/png','image/jpeg'].includes(file.type)||file.size<1||file.size>STUDIO_LIMITS.referenceBytes||typeof file.name!=='string'||file.name.length<1||file.name.length>200||/sk-[A-Za-z0-9_-]{20,}/.test(file.name)||typeof decodeImage!=='function')throw new StudioStorageError('studio_reference_invalid');
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const png=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if((file.type==='image/png'&&!png)||(file.type==='image/jpeg'&&!jpeg))throw new StudioStorageError('studio_reference_invalid');
    let image;
    try{const dimensions=await studioImageDimensions(file);image=await decodeImage(file);if(!await studioImageDimensionsMatch(file,dimensions,image))throw Error();const metadata=referenceSchema.parse({id,name:file.name,mime:file.type,size:file.size,width:image.width,height:image.height,...(source ? {source}: {})});if(!metadataValid(metadata))throw Error();return metadata;}
    catch{throw new StudioStorageError('studio_reference_invalid');}
    finally{try{image?.close();}catch{}}
  }
  function putReference(input:StudioScope & {id:string;file:File;source?:StudioReference['source']}):Promise<StudioReference> {
    const task=fileQueue.then(async()=>{
      const scope=scopeOf(input),key=referenceKey(scope,input.id),metadata=await prepareFile(input);
      return transaction<StudioReference>(['references','draftAssets'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('references'),request=store.getAll(),assetsRequest=tx.objectStore('draftAssets').getAll();
        let referenceRecords:StoredRecord[]|undefined,assetRecords:StoredRecord[]|undefined;
        const put=()=>{if(!referenceRecords||!assetRecords)return;try{
          checkGlobalBudget(referenceRecords,assetRecords,null,metadata.size);
          const records=referenceRecords.filter(record=>record.scope===scope);
          if(records.some(record=>record.key===key))throw new StudioStorageError('studio_reference_exists');
          if(records.length>=STUDIO_LIMITS.references||records.reduce((sum,record)=>sum+record.metadata.size,metadata.size)>STUDIO_LIMITS.referenceTotalBytes)throw new StudioStorageError('studio_storage_quota');
          store.add({key,scope,metadata,file:input.file});done(Object.freeze(metadata));
        }catch(error){fail(error);}};
        request.onsuccess=()=>{
          try{referenceRecords=parseRecords(request.result);put();}catch(error){fail(error);}
        };
        assetsRequest.onsuccess=()=>{try{assetRecords=parseRecords(assetsRequest.result);put();}catch(error){fail(error);}};
      });
    }).catch(error=>{throw storageError(error);});
    fileQueue=task.catch(()=>{});
    return task;
  }
  async function getReference(scope:StudioScope,id:string):Promise<StoredReference|null> {
    const scopeKey=scopeOf(scope),key=referenceKey(scopeKey,id);
    return transaction(['references'],'readonly',(tx,done,fail)=>{
      const request=tx.objectStore('references').get(key);
      request.onsuccess=()=>{const raw:unknown=request.result;if(raw===undefined){done(null);return;}let value;try{value=parseRecord(raw);}catch(error){fail(error);return;}if(value.scope!==scopeKey||!("id" in value.metadata)||!metadataValid(value.metadata)||value.metadata.id!==id||!(value.file instanceof Blob)||value.file.size!==value.metadata.size||value.file.type!==value.metadata.mime){fail(new StudioStorageError('studio_storage_corrupt'));return;}done({metadata:Object.freeze({...value.metadata}),file:value.file});};
    });
  }
  async function removeReference(scope:StudioScope,id:string):Promise<boolean> {
    const scopeKey=scopeOf(scope),key=referenceKey(scopeKey,id);
    return transaction(['states','references'],'readwrite',(tx,done,fail)=>{
      const request=tx.objectStore('states').get(scopeKey);
      request.onsuccess=()=>{try{const state=readState(request.result,scopeKey);if(state&&(state.references.some(item=>item.id===id)||[state.direction,...Object.values(state.posts).map(post=>post.direction)].some(direction=>direction.criteria.some(item=>[item.example.referenceId,item.counterexample.referenceId].includes(id)))||state.drafts.some(draft=>draft.creationContext?.references.some(reference=>reference.id===id))||state.adjustments.some(item=>item.context.references.some(reference=>reference.id===id))))throw new StudioStorageError('studio_reference_in_use');tx.objectStore('references').delete(key);done(true);}catch(error){fail(error);}};
    });
  }
  function putDraftAsset(input:StudioScope & DraftAssetAddress & {file:Blob;ifAbsent?:boolean;expectedRevision?:number}):Promise<DraftAssetMetadata> {
    const task=fileQueue.then(async()=>{
      const scope=scopeOf(input),address=draftAddress(scope,input),file=input.file;
      if(!(file instanceof Blob)||typeof decodeImage!=='function')throw new StudioStorageError('studio_draft_asset_invalid');
      let image:Pick<ImageBitmap,"width"|"height"|"close">|undefined,metadata:DraftAssetMetadata;
      try{
        const dimensions=await studioImageDimensions(file);
        image=await decodeImage(file);
        if(!await studioImageDimensionsMatch(file,dimensions,image))throw Error();
        metadata={pieceId:address.pieceId,baseVersion:address.baseVersion,kind:address.kind,mime:file.type,size:file.size,width:image.width,height:image.height};
        if(!assetMetadataValid(metadata))throw Error();
      }catch{throw new StudioStorageError('studio_draft_asset_invalid');}
      finally{try{image?.close();}catch{}}
      const blob=file.slice(0,file.size,file.type);
      return transaction<DraftAssetMetadata>(['references','draftAssets','states'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('draftAssets'),referencesRequest=tx.objectStore('references').getAll(),assetsRequest=store.getAll();
        let references:StoredRecord[]|undefined,assets:StoredRecord[]|undefined;
        let revisionChecked=input.expectedRevision===undefined;
        const put=()=>{if(!references||!assets||!revisionChecked)return;try{if(input.ifAbsent&&assets.some(record=>record.key===address.key))throw new StudioStorageError('studio_draft_asset_exists');checkGlobalBudget(references,assets,address.key,metadata.size);store.put({key:address.key,scope,metadata,file:blob});done(Object.freeze(metadata));}catch(error){fail(error);}};
        if(input.expectedRevision!==undefined){const stateRequest=tx.objectStore('states').get(scope);stateRequest.onsuccess=()=>{try{if(!Number.isSafeInteger(input.expectedRevision)||readState(stateRequest.result,scope)?.revision!==input.expectedRevision)throw new StudioStorageError('studio_storage_conflict');revisionChecked=true;put();}catch(error){fail(error);}};}
        referencesRequest.onsuccess=()=>{try{references=parseRecords(referencesRequest.result);put();}catch(error){fail(error);}};
        assetsRequest.onsuccess=()=>{try{assets=parseRecords(assetsRequest.result);put();}catch(error){fail(error);}};
      });
    }).catch(error=>{throw storageError(error);});
    fileQueue=task.catch(()=>{});return task;
  }
  async function getDraftAsset(scope:StudioScope,input:DraftAssetAddress):Promise<StoredDraftAsset|null> {
    const scopeKey=scopeOf(scope),address=draftAddress(scopeKey,input);
    return transaction(['draftAssets'],'readonly',(tx,done,fail)=>{
      const request=tx.objectStore('draftAssets').get(address.key);
      request.onsuccess=()=>{const raw:unknown=request.result;if(raw===undefined){done(null);return;}let value;try{value=parseRecord(raw);}catch(error){fail(error);return;}if(value.scope!==scopeKey||!("pieceId" in value.metadata)||!recordValid(value,true)||value.metadata.pieceId!==address.pieceId||value.metadata.baseVersion!==address.baseVersion||value.metadata.kind!==address.kind){fail(new StudioStorageError('studio_storage_corrupt'));return;}done({metadata:Object.freeze({...value.metadata}),file:value.file});};
    });
  }
  // Preserve an existing destination, including one written by another tab.
  // Read source and create the destination in the same transaction so a
  // concurrent upload cannot be silently overwritten between check and copy.
  function copyDraftAsset(scope:StudioScope,source:DraftAssetAddress,target:DraftAssetAddress):Promise<'copied'|'exists'|'missing'> {
    const task=fileQueue.then(async()=>{
      const scopeKey=scopeOf(scope),from=draftAddress(scopeKey,source),to=draftAddress(scopeKey,target);
      if(from.pieceId!==to.pieceId || from.kind!==to.kind || from.key===to.key)throw new StudioStorageError('studio_storage_invalid');
      return transaction<'copied'|'exists'|'missing'>(['references','draftAssets'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('draftAssets'),refs=tx.objectStore('references').getAll(),assets=store.getAll();
        let references:StoredRecord[]|undefined,records:StoredRecord[]|undefined;
        const copy=()=>{if(!references||!records)return;try{
          const original=records.find(record=>record.key===from.key),existing=records.find(record=>record.key===to.key);
          const matches=(record:StoredRecord,address:ReturnType<typeof draftAddress>)=>record.scope===scopeKey && 'pieceId' in record.metadata && recordValid(record,true) && record.metadata.pieceId===address.pieceId && record.metadata.baseVersion===address.baseVersion && record.metadata.kind===address.kind;
          if(existing){if(!matches(existing,to))throw new StudioStorageError('studio_storage_corrupt');done('exists');return;}
          if(!original){done('missing');return;}
          if(!matches(original,from)||!('pieceId' in original.metadata))throw new StudioStorageError('studio_storage_corrupt');
          checkGlobalBudget(references,records,null,original.file.size);
          store.add({key:to.key,scope:scopeKey,metadata:{...original.metadata,baseVersion:to.baseVersion},file:original.file});done('copied');
        }catch(error){fail(error);}};
        refs.onsuccess=()=>{try{references=parseRecords(refs.result);copy();}catch(error){fail(error);}};
        assets.onsuccess=()=>{try{records=parseRecords(assets.result);copy();}catch(error){fail(error);}};
      });
    }).catch(error=>{throw storageError(error);});
    fileQueue=task.catch(()=>{});return task;
  }
  async function removeDraftAsset(scope:StudioScope,input:DraftAssetAddress):Promise<boolean> {
    const address=draftAddress(scopeOf(scope),input);
    return transaction(['draftAssets'],'readwrite',(tx,done)=>{tx.objectStore('draftAssets').delete(address.key);done(true);});
  }
  return Object.freeze({load,save,readReferenceAuthority,establishReferenceAuthority,beginReferenceAuthorityChange,confirmReferenceAuthorityChange,putReference,getReference,removeReference,putDraftAsset,getDraftAsset,copyDraftAsset,removeDraftAsset,close(){connection?.close();connection=null;}});
}
