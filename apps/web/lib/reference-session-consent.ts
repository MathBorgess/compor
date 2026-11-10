type SessionStore=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key='compor-reference-session-consent';

/** One tab session and one authenticated account; no project or provider key is stored. */
export function referenceConsentGranted(storage:SessionStore,userId:string) {
  return storage.getItem(key)===JSON.stringify({userId,granted:true});
}
export function grantReferenceConsent(storage:SessionStore,userId:string) {
  storage.setItem(key,JSON.stringify({userId,granted:true}));
}
export function syncReferenceConsentAccount(storage:SessionStore,userId:string|null) {
  if(!userId || !referenceConsentGranted(storage,userId))storage.removeItem(key);
}
