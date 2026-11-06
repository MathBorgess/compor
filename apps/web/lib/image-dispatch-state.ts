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

/** The envelope refers only to this HTTP invocation; server fencing is still required. */
export function imagePreflightRejected(status:number,input:unknown,expected:{requestId:unknown;attemptId:unknown;dispatchId:unknown}) {
  if(status!==503 || !input || typeof input!=='object' || Array.isArray(input))return false;
  if(Object.keys(input).sort().join(',')!=='attemptId,dispatchId,error,requestId')return false;
  if(typeof expected.requestId!=='string' || typeof expected.attemptId!=='string' || typeof expected.dispatchId!=='string')return false;
  const value=input as Record<string,unknown>;
  return value.error==='image_preflight_unavailable' && value.requestId===expected.requestId && value.attemptId===expected.attemptId && value.dispatchId===expected.dispatchId;
}
