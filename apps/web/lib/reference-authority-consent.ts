import {createReferenceAuthorityClient} from './reference-authority-client.ts';

type Consent={userId:string;consentId:string;capability:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let current:Consent|null=null,epoch=0;
/** Only the current loaded tab holds the capability; reload requires a new gesture. */
export function readReferenceAuthorityConsent(userId:string):Consent|null{return current?.userId===userId?{...current}:null;}
export function clearReferenceAuthorityConsent(){epoch++;current=null;}
/** Called only for a new explicit consent gesture; no retries or secret reconstruction. */
export async function grantReferenceAuthorityConsent(userId:string,client=createReferenceAuthorityClient(),isCurrent:()=>boolean=()=>true){
 if(!uuid.test(userId)||!isCurrent())throw Error('reference_authority_invalid_user');
 const attempt=++epoch,consentId=crypto.randomUUID(),result=await client.grant(consentId);
 if(attempt!==epoch||!isCurrent()||result.status!=='granted')throw Error('reference_authority_unconfirmed');
 current={userId,consentId,capability:result.capability};
 return {...current};
}
