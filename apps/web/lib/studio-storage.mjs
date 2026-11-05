import { parseStudioState, STUDIO_LIMITS } from './studio-state.mjs';

export class StudioStorageError extends Error {
  constructor(code, {currentRevision} = {}) { super(code); this.name='StudioStorageError'; this.code=code; if(Number.isSafeInteger(currentRevision))this.currentRevision=currentRevision; }
}
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function scopeOf({userId,projectId}={}) { if(!uuid(userId)||!uuid(projectId))throw new StudioStorageError('studio_storage_invalid');return JSON.stringify([userId,projectId]); }
const referenceKey = (scope,id) => {if(!uuid(id))throw new StudioStorageError('studio_storage_invalid');return JSON.stringify([scope,id]);};
const storageError = error => error instanceof StudioStorageError ? error : new StudioStorageError(error?.name==='QuotaExceededError'?'studio_storage_quota':'studio_storage_unavailable');
const metadataValid = value => value && Object.getPrototypeOf(value)===Object.prototype && Object.keys(value).sort().join(',')==='height,id,mime,name,size,width' && uuid(value.id) && typeof value.name==='string' && value.name.length>0 && value.name.length<=200 && !/sk-[A-Za-z0-9_-]{20,}/.test(value.name) && ['image/png','image/jpeg'].includes(value.mime) && Number.isSafeInteger(value.size) && value.size>0 && value.size<=STUDIO_LIMITS.referenceBytes && Number.isSafeInteger(value.width)&&value.width>0 && Number.isSafeInteger(value.height)&&value.height>0 && value.width*value.height<=40_000_000;

/** Local content only. Its keys segregate app state, not access from same-origin code. */
export function createStudioStorage({indexedDB=globalThis.indexedDB, name='compor-studio-v1', decodeImage=globalThis.createImageBitmap}={}) {
  if(typeof name!=='string'||!/^compor-studio-[a-z0-9-]{1,60}$/.test(name))throw new StudioStorageError('studio_storage_invalid');
  let connection=null, opening=null, fileQueue=Promise.resolve();
  const open=()=>{
    if(connection)return Promise.resolve(connection);
    if(opening)return opening;
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.reject(new StudioStorageError('studio_storage_unavailable'));
    opening=new Promise((resolve,reject)=>{
      let request,settled=false;
      const rejectOnce=error=>{if(!settled){settled=true;reject(storageError(error));}};
      try{request=indexedDB.open(name,1);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('states'))db.createObjectStore('states',{keyPath:'scope'});if(!db.objectStoreNames.contains('references'))db.createObjectStore('references',{keyPath:'key'}).createIndex('scope','scope');};
      request.onerror=()=>rejectOnce(request.error);
      request.onblocked=()=>rejectOnce(new StudioStorageError('studio_storage_blocked'));
      request.onsuccess=()=>{const db=request.result;if(settled){db.close();return;}settled=true;connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=null;};resolve(db);};
    }).finally(()=>{opening=null;});
    return opening;
  };
  const transaction=async(stores,mode,action)=>{
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx,result,failure=null;
      try{tx=db.transaction(stores,mode);}catch(error){reject(storageError(error));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure??storageError(tx.error));
      tx.onerror=()=>{};
      const fail=error=>{failure=storageError(error);try{tx.abort();}catch{reject(failure);}};
      try{action(tx,value=>{result=value;},fail);}catch(error){fail(error);}
    });
  };
  const readState=(record,scope)=>{
    if(record===undefined)return null;
    try{if(record.scope!==scope)throw Error();const state=parseStudioState(record.state);if(scopeOf(state)!==scope)throw Error();return state;}catch{throw new StudioStorageError('studio_storage_corrupt');}
  };
  async function load(scope) {
    const key=scopeOf(scope);
    return transaction(['states'],'readonly',(tx,done,fail)=>{const request=tx.objectStore('states').get(key);request.onsuccess=()=>{try{done(readState(request.result,key));}catch(error){fail(error);}};});
  }
  async function save(value,{expectedRevision}={}) {
    let state;try{state=parseStudioState(value);}catch{throw new StudioStorageError('studio_storage_invalid');}
    if(expectedRevision!==null && (!Number.isSafeInteger(expectedRevision)||expectedRevision<0))throw new StudioStorageError('studio_storage_invalid');
    const scope=scopeOf(state);
    return transaction(['states'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('states'),request=store.get(scope);
      request.onsuccess=()=>{
        try{
          const existing=readState(request.result,scope);
          if((existing?.revision??null)!==expectedRevision)throw new StudioStorageError('studio_storage_conflict',{currentRevision:existing?.revision});
          if(existing && state.revision<=existing.revision){if(JSON.stringify(existing)===JSON.stringify(state)){done(state);return;}throw new StudioStorageError('studio_storage_invalid');}
          store.put({scope,state});done(state);
        }catch(error){fail(error);}
      };
    });
  }
  async function prepareFile({id,file}) {
    if(!uuid(id)||!(file instanceof Blob)||!['image/png','image/jpeg'].includes(file.type)||file.size<1||file.size>STUDIO_LIMITS.referenceBytes||typeof file.name!=='string'||file.name.length<1||file.name.length>200||/sk-[A-Za-z0-9_-]{20,}/.test(file.name)||typeof decodeImage!=='function')throw new StudioStorageError('studio_reference_invalid');
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const png=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if((file.type==='image/png'&&!png)||(file.type==='image/jpeg'&&!jpeg))throw new StudioStorageError('studio_reference_invalid');
    let image;
    try{image=await decodeImage(file);const metadata={id,name:file.name,mime:file.type,size:file.size,width:image.width,height:image.height};if(!metadataValid(metadata))throw Error();return metadata;}
    catch{throw new StudioStorageError('studio_reference_invalid');}
    finally{try{image?.close();}catch{}}
  }
  function putReference(input) {
    const task=fileQueue.then(async()=>{
      const scope=scopeOf(input),key=referenceKey(scope,input.id),metadata=await prepareFile(input);
      return transaction(['references'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('references'),request=store.index('scope').getAll(scope);
        request.onsuccess=()=>{
          try{
            const records=request.result;
            if(records.some(record=>!metadataValid(record.metadata)||record.file?.size!==record.metadata.size))throw new StudioStorageError('studio_storage_corrupt');
            if(records.some(record=>record.key===key))throw new StudioStorageError('studio_reference_exists');
            if(records.length>=STUDIO_LIMITS.references||records.reduce((sum,record)=>sum+record.metadata.size,metadata.size)>STUDIO_LIMITS.referenceTotalBytes)throw new StudioStorageError('studio_storage_quota');
            store.add({key,scope,metadata,file:input.file});done(Object.freeze(metadata));
          }catch(error){fail(error);}
        };
      });
    }).catch(error=>{throw storageError(error);});
    fileQueue=task.catch(()=>{});
    return task;
  }
  async function getReference(scope,id) {
    const scopeKey=scopeOf(scope),key=referenceKey(scopeKey,id);
    return transaction(['references'],'readonly',(tx,done,fail)=>{
      const request=tx.objectStore('references').get(key);
      request.onsuccess=()=>{const value=request.result;if(value===undefined){done(null);return;}if(value.scope!==scopeKey||!metadataValid(value.metadata)||value.metadata.id!==id||!(value.file instanceof Blob)||value.file.size!==value.metadata.size||value.file.type!==value.metadata.mime){fail(new StudioStorageError('studio_storage_corrupt'));return;}done({metadata:Object.freeze({...value.metadata}),file:value.file});};
    });
  }
  async function removeReference(scope,id) {
    const scopeKey=scopeOf(scope),key=referenceKey(scopeKey,id);
    return transaction(['states','references'],'readwrite',(tx,done,fail)=>{
      const request=tx.objectStore('states').get(scopeKey);
      request.onsuccess=()=>{try{const state=readState(request.result,scopeKey);if(state&&(state.references.some(item=>item.id===id)||state.adjustments.some(item=>item.context.references.some(reference=>reference.id===id))))throw new StudioStorageError('studio_reference_in_use');tx.objectStore('references').delete(key);done(true);}catch(error){fail(error);}};
    });
  }
  return Object.freeze({load,save,putReference,getReference,removeReference,close(){connection?.close();connection=null;}});
}
