import {parseVisualInputManifest,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {createReferenceAuthorityClient} from './reference-authority-client.ts';
import {readReferenceAuthorityConsent} from './reference-authority-consent.ts';

type Scope={userId:string;projectId:string;conversationId:string;requestId:string;batchId:string|null;purpose:'parallel'|'replacement'|'artwork'};
type Client=Pick<ReturnType<typeof createReferenceAuthorityClient>,'createSnapshot'|'readSnapshot'>;
type Consent={userId:string;consentId:string;capability:string};
const containsExternal=(manifest:VisualInputManifest)=>manifest.version===2&&manifest.entries.some(entry=>entry.inputOrigin==='external');
async function digest(manifest:VisualInputManifest){
 const bytes=new TextEncoder().encode(`compor-visual-input-v${manifest.version}\0${JSON.stringify(manifest)}`);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
}
/** A snapshot is created once before an effect; consent capability stays in this tab's memory. */
export function createReferenceVisualAuthority({client=createReferenceAuthorityClient(),readConsent=readReferenceAuthorityConsent,isCurrent}:{client?:Client;readConsent?:(userId:string)=>Consent|null;isCurrent:()=>boolean}){
 const ensure=()=>{if(!isCurrent())throw Error('reference_authority_scope_changed');};
 function consent(scope:Scope,manifest:VisualInputManifest){
  if(!containsExternal(manifest))return null;
  const value=readConsent(scope.userId);if(!value||value.userId!==scope.userId)throw Error('reference_authority_consent_required');return value;
 }
 async function create(scope:Scope,visualInput:VisualInputManifest,selectionRevision:number){
  ensure();const manifest=parseVisualInputManifest(visualInput),value=consent(scope,manifest);
  await client.createSnapshot({projectId:scope.projectId,conversationId:scope.conversationId,requestId:scope.requestId,batchId:scope.batchId,purpose:scope.purpose,selectionRevision,visualInput:manifest,...(value?{consentId:value.consentId}:{})},value?.capability);
  ensure();if(value){const current=consent(scope,manifest);if(!current||current.consentId!==value.consentId||current.capability!==value.capability)throw Error('reference_authority_consent_changed');}
 }
 /** Check the original consent again without retrying the snapshot or an effect. */
 async function headers(scope:Scope,visualInput:VisualInputManifest):Promise<Record<string,string>>{
  ensure();const manifest=parseVisualInputManifest(visualInput),value=consent(scope,manifest);
  if(!value)return {};
  const found=await client.readSnapshot(scope.projectId,scope.requestId);ensure();
  if(found.status!=='found'||found.snapshot.conversationId!==scope.conversationId||found.snapshot.batchId!==scope.batchId||found.snapshot.purpose!==scope.purpose||found.snapshot.consentId!==value.consentId||found.snapshot.manifestDigest!==await digest(manifest))throw Error('reference_authority_snapshot_unconfirmed');
  ensure();const current=consent(scope,manifest);if(!current||current.consentId!==value.consentId||current.capability!==value.capability)throw Error('reference_authority_consent_changed');return {'x-compor-reference-consent':value.capability};
 }
 return {create,headers};
}
