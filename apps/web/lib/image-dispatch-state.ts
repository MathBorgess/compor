/** A local 400 invalid_request is returned before image reservation or dispatch. */
export function imageRejectedBeforeDispatch(status:number,error:unknown) {
  return status===400 && error==='invalid_request';
}

/** Persist the explicit-decision gate before releasing the submitted marker. */
export function recordImageNotDispatched(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,submittedKey:string,rejectedKey:string,requestId:string,allowMissing=false) {
  const submitted=storage.getItem(submittedKey);
  if(submitted!==requestId&&!(allowMissing&&submitted===null))return false;
  storage.setItem(rejectedKey,requestId);
  if(storage.getItem(submittedKey)!==submitted)return false;
  if(submitted!==null)storage.removeItem(submittedKey);
  return true;
}
