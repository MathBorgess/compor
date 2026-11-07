/** Reserve a local marker only while the session is current and before the request is sent. */
export function markBeforeDispatch(storage:Pick<Storage,'setItem'|'getItem'|'removeItem'>, key:string, value:string, current:()=>boolean):boolean {
  if (!current()) return false;
  storage.setItem(key,value);
  if (current()) return true;
  if (storage.getItem(key)===value) storage.removeItem(key);
  return false;
}
