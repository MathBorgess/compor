import {createReferenceAuthorityClient} from './reference-authority-client.ts';

const key='compor-reference-authority-consent';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Consent={userId:string;consentId:string;capability:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=(value:unknown):value is Consent=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const record=value as Record<string,unknown>;
 return Object.keys(record).sort().join(',')==='capability,consentId,userId'&&typeof record.userId==='string'&&uuid.test(record.userId)&&typeof record.consentId==='string'&&uuid.test(record.consentId)&&typeof record.capability==='string'&&/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(record.capability);
};
export function readReferenceAuthorityConsent(storage:Store,userId:string):Consent|null{
 try{const raw=storage.getItem(key),value:unknown=raw?JSON.parse(raw):null;return valid(value)&&value.userId===userId?value:null;}catch{return null;}
}
export function clearReferenceAuthorityConsent(storage:Store){storage.removeItem(key);}
/** Called only for a new explicit consent gesture; no retries or secret reconstruction. */
export async function grantReferenceAuthorityConsent(storage:Store,userId:string,client=createReferenceAuthorityClient()){
 if(!uuid.test(userId))throw Error('reference_authority_invalid_user');
 const consentId=crypto.randomUUID(),result=await client.grant(consentId);
 if(result.status!=='granted')throw Error('reference_authority_unconfirmed');
 const value:Consent={userId,consentId,capability:result.capability};
 try{storage.setItem(key,JSON.stringify(value));if(!readReferenceAuthorityConsent(storage,userId))throw Error('unavailable');}catch{throw Error('reference_authority_unavailable');}
 return value;
}
