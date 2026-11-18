import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {AuthConfig} from './supabase.ts';
import {createExplorationImageStore} from './exploration-image-store.ts';

const reservation=z.array(z.strictObject({state:z.enum(['running','unknown','completed','rejected','busy','blocked','awaiting_feedback','cooldown','partial','conflict','revoked']),is_new:z.boolean()})).length(1);
const timestamp=z.string().max(100);
const batch=z.strictObject({batch_id:z.string().uuid(),project_id:z.string().uuid(),piece_id:z.string().uuid().nullable(),plan_digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['running','unknown','partial','completed']),created_at:timestamp,updated_at:timestamp,completed_at:timestamp.nullable(),next_at:timestamp.nullable(),closed_at:timestamp.nullable(),images:z.array(z.strictObject({id:z.string().uuid(),project_id:z.string().uuid(),prompt_digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['running','unknown','completed','rejected']),ordinal:z.number().int().positive().safe(),revision:z.number().int().positive().safe(),batch_position:z.number().int().min(1).max(3),replaces_image_id:z.string().uuid().nullable(),created_at:timestamp,updated_at:timestamp})).length(3)});
type Reservation={state:z.infer<typeof reservation>[number]['state'];isNew:boolean};
const id=z.string().uuid();
type VisualAuthority={requestId:string;manifestDigest:string;consentSecret:string|null};
export type BatchReservationInput={projectId:string;batchId:string;pieceId:string|null;planDigest:string;intentId:string;intentSecret:string;imageIds:string[];promptDigests:string[];rejectionDigests:string[];visualAuthority?:VisualAuthority};
export type ReplacementInput={projectId:string;batchId:string;position:number;previousId:string;requestId:string;intentId:string;intentSecret:string;promptDigest:string;rejectionDigest:string;visualAuthority?:VisualAuthority};
const validAuthority=(value:VisualAuthority)=>id.safeParse(value.requestId).success&&/^[a-f0-9]{64}$/.test(value.manifestDigest)&&(value.consentSecret===null||/^[a-f0-9]{64}$/.test(value.consentSecret));

/** Uses the person's token and the existing RLS-scoped image store. */
export function createExplorationBatchStore(config:AuthConfig,fetchApi:typeof fetch=fetch){
 const imageStore=createExplorationImageStore(config,fetchApi);
 const plan=imageStore.plan;
 if(!plan)throw Error('exploration plan storage unavailable');
 async function rpc(actor:Actor,name:string,body:unknown){
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('unavailable');return response.json();
 }
 function parseReservation(value:unknown):Reservation{const [row]=reservation.parse(value);if(row.is_new&&row.state!=='running')throw Error('invalid reservation');return {state:row.state,isNew:row.is_new};}
 return {
  ...imageStore,
  plan,
  async getBatch(actor:Actor,projectId:string,batchId:string){
   const value=await rpc(actor,'get_exploration_batch',{p_project_id:projectId,p_batch_id:batchId});
   if(value===null)return null;
   const row=batch.parse(value);
   if(row.batch_id!==batchId||row.project_id!==projectId||row.images.some(image=>image.project_id!==projectId)||new Set(row.images.map(image=>image.batch_position)).size!==3||new Set(row.images.map(image=>image.id)).size!==3)throw Error('invalid batch');
   return {batchId:row.batch_id,projectId:row.project_id,pieceId:row.piece_id,state:row.state,completedAt:row.completed_at,nextAt:row.next_at,closedAt:row.closed_at,images:row.images.map(image=>({requestId:image.id,status:image.state,ordinal:image.ordinal,revision:image.revision,position:image.batch_position,replacesImageId:image.replaces_image_id}))};
  },
  async reserveBatch(actor:Actor,value:BatchReservationInput):Promise<Reservation>{
   const authority=value.visualAuthority;if(authority&&!validAuthority(authority))throw Error('invalid visual authority');
   return parseReservation(await rpc(actor,authority?'reserve_exploration_batch_authorized':'reserve_exploration_batch_proven',{p_project_id:value.projectId,p_batch_id:value.batchId,p_piece_id:value.pieceId,p_plan_digest:value.planDigest,p_image_ids:value.imageIds,p_prompt_digests:value.promptDigests,p_rejection_digests:value.rejectionDigests,p_intent_id:value.intentId,p_intent_secret:value.intentSecret,...(authority?{p_authority_request_id:authority.requestId,p_manifest_digest:authority.manifestDigest,p_consent_secret:authority.consentSecret}:{})}));
  },
  async replaceRejected(actor:Actor,value:ReplacementInput):Promise<Reservation>{
   const authority=value.visualAuthority;if(authority&&(!validAuthority(authority)||authority.requestId!==value.requestId))throw Error('invalid visual authority');
   return parseReservation(await rpc(actor,authority?'replace_exploration_slot_authorized':'replace_rejected_exploration_batch_slot_proven',{p_project_id:value.projectId,p_batch_id:value.batchId,p_position:value.position,p_previous_id:value.previousId,p_id:value.requestId,p_prompt_digest:value.promptDigest,p_rejection_digest:value.rejectionDigest,p_intent_id:value.intentId,p_intent_secret:value.intentSecret,...(authority?{p_manifest_digest:authority.manifestDigest,p_consent_secret:authority.consentSecret}:{})}));
  },
 };
}
