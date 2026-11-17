import {createReferenceAuthorityClient} from './reference-authority-client.ts';

type Consent={userId:string;consentId:string;capability:string};
type Withdrawal={userId:string;consentId:string;status:'withdrawing'|'unknown'|'active'|'revoked'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let current:Consent|null=null,epoch=0;
let withdrawal:Withdrawal|null=null;
const listeners=new Set<()=>void>();
const changed=()=>{for(const listener of listeners)listener();};
export function subscribeReferenceAuthorityConsent(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Only the current loaded tab holds the capability; reload requires a new gesture. */
export function readReferenceAuthorityConsent(userId:string):Consent|null{return current?.userId===userId?{...current}:null;}
export function readReferenceAuthorityWithdrawal(userId:string):Withdrawal|null{return withdrawal?.userId===userId?{...withdrawal}:null;}
export function clearReferenceAuthorityConsent(){epoch++;current=null;withdrawal=null;changed();}
/** Called only for a new explicit consent gesture; no retries or secret reconstruction. */
export async function grantReferenceAuthorityConsent(userId:string,client=createReferenceAuthorityClient(),isCurrent:()=>boolean=()=>true){
 if(!uuid.test(userId)||!isCurrent())throw Error('reference_authority_invalid_user');
 if(withdrawal?.userId===userId&&withdrawal.status!=='revoked')throw Error('reference_authority_withdrawal_unconfirmed');
 const attempt=++epoch,consentId=crypto.randomUUID(),result=await client.grant(consentId);
 if(attempt!==epoch||!isCurrent()||result.status!=='granted')throw Error('reference_authority_unconfirmed');
 current={userId,consentId,capability:result.capability};withdrawal=null;changed();
 return {...current};
}

/** Discard the capability synchronously; a lost response never restores it. */
export async function withdrawReferenceAuthorityConsent(userId:string,client=createReferenceAuthorityClient()){
 const consentId=current?.userId===userId?current.consentId:withdrawal?.userId===userId?withdrawal.consentId:null;
 if(!consentId||withdrawal?.userId===userId&&withdrawal.status==='withdrawing')throw Error('reference_authority_withdrawal_unavailable');
 const attempt=++epoch,record:Withdrawal={userId,consentId,status:'withdrawing'};
 current=null;withdrawal=record;changed();
 try{
  const result=await client.revoke(consentId);
  if(attempt!==epoch||withdrawal!==record)throw Error('reference_authority_scope_changed');
  if(result.status!=='revoked'||result.consentId!==consentId)throw Error('reference_authority_unconfirmed');
  withdrawal={...record,status:'revoked'};changed();return {...withdrawal};
 }catch(error){if(attempt===epoch&&withdrawal===record){withdrawal={...record,status:'unknown'};changed();}throw error;}
}

/** An explicit state query only; active/absent cannot reconstruct permission. */
export async function inspectReferenceAuthorityWithdrawal(userId:string,client=createReferenceAuthorityClient()){
 const record=withdrawal,attempt=epoch;
 if(!record||record.userId!==userId||record.status==='withdrawing')throw Error('reference_authority_withdrawal_unavailable');
 try{
  const result=await client.consentState(record.consentId);
  if(attempt!==epoch||withdrawal!==record)throw Error('reference_authority_scope_changed');
  if(result.consentId!==record.consentId||!['active','revoked','absent'].includes(result.state))throw Error('reference_authority_unconfirmed');
  withdrawal={...record,status:result.state==='absent'?'unknown':result.state};changed();return {...withdrawal};
 }catch(error){if(attempt===epoch&&withdrawal===record){withdrawal={...record,status:'unknown'};changed();}throw error;}
}
