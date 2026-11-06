/** A local 400 invalid_request is returned before image reservation or dispatch. */
export function imageRejectedBeforeDispatch(status:number,error:unknown) {
  return status===400 && error==='invalid_request';
}

/** Persist the explicit-decision gate before releasing the submitted marker. */
export function recordImageNotDispatched(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,submittedKey:string,rejectedKey:string,requestId:string) {
  if(storage.getItem(submittedKey)!==requestId)return false;
  storage.setItem(rejectedKey,requestId);
  if(storage.getItem(submittedKey)!==requestId)return false;
  storage.removeItem(submittedKey);
  return true;
}
