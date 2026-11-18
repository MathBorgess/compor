import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {AuthConfig} from './supabase.ts';
const id=z.string().uuid(),revision=z.number().int().nonnegative().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const ref=z.strictObject({id,inputOrigin:z.enum(['local-upload','external','generated']),sourceDigest:digest});
const post=z.strictObject({pieceId:id,referenceIds:z.array(id).max(20),excludedReferenceIds:z.array(id).max(20)});
export const referenceAuthorityStateSchema=z.strictObject({version:z.literal(1),references:z.array(ref).max(500),projectReferenceIds:z.array(id).max(20),posts:z.array(post).max(500)});
export const referenceAuthoritySnapshotSchema=z.strictObject({requestId:id,projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id.nullable(),purpose:z.enum(['parallel','replacement','artwork']),selectionRevision:revision,manifestDigest:digest,consentId:id.nullable()});
const fenced=z.strictObject({status:z.literal('fenced'),commandId:id});
const receipt=z.union([z.strictObject({status:z.literal('applied'),commandId:id,revision}),fenced]);
const command=z.union([fenced,z.strictObject({status:z.enum(['applied','existing']),commandId:id,revision}),z.strictObject({status:z.enum(['conflict','invalid','unavailable','not_found']),revision:revision.optional()})]);
const consent=z.union([z.strictObject({status:z.enum(['granted','existing','revoked']),consentId:id}),z.strictObject({status:z.literal('unavailable')})]);
const created=z.union([z.strictObject({status:z.enum(['created','existing']),snapshot:referenceAuthoritySnapshotSchema}),z.strictObject({status:z.enum(['conflict','not_found','unavailable','unauthorized'])})]);
export type ReferenceSnapshotScope={projectId:string;conversationId:string;requestId:string;batchId:string|null;purpose:'parallel'|'replacement'|'artwork';manifestDigest:string;consentSecret:string|null};

/** Fixed RPCs under the person's JWT; no service credential or arbitrary table access. */
export function createReferenceAuthorityStore(config:Pick<AuthConfig,'service'|'key'>,fetchApi:typeof fetch=fetch){
 async function rpc(actor:Actor,name:string,value:Record<string,unknown>){
  id.parse(actor.userId);if(!/^\S{1,8192}$/.test(actor.token))throw Error('invalid actor');
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify(value),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)throw Error('reference authority unavailable');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024*1024)throw Error('invalid response');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 const checkArgs=(scope:ReferenceSnapshotScope)=>({p_project_id:scope.projectId,p_piece_id:scope.conversationId==='references'?null:scope.conversationId,p_request_id:scope.requestId,p_batch_id:scope.batchId,p_purpose:scope.purpose,p_manifest_digest:scope.manifestDigest,p_consent_secret:scope.consentSecret});
 return {
  async read(actor:Actor,projectId:string){return z.strictObject({status:z.literal('ready'),revision,state:referenceAuthorityStateSchema}).nullable().parse(await rpc(actor,'get_reference_selection',{p_project_id:projectId}));},
  async write(actor:Actor,value:{projectId:string;commandId:string;expectedRevision:number;state:unknown}){return command.parse(await rpc(actor,'write_reference_selection',{p_project_id:value.projectId,p_command_id:value.commandId,p_expected_revision:value.expectedRevision,p_state:value.state}));},
  async receipt(actor:Actor,projectId:string,commandId:string){return receipt.nullable().parse(await rpc(actor,'get_reference_selection_command',{p_project_id:projectId,p_command_id:commandId}));},
  async fence(actor:Actor,projectId:string,commandId:string){return z.union([receipt,z.strictObject({status:z.enum(['conflict','not_found','unavailable'])})]).parse(await rpc(actor,'fence_reference_selection_command',{p_project_id:projectId,p_command_id:commandId}));},
  async grant(actor:Actor,consentId:string,proofDigest:string){return consent.parse(await rpc(actor,'grant_reference_consent',{p_consent_id:consentId,p_proof_digest:proofDigest}));},
  async revoke(actor:Actor,consentId:string){return consent.parse(await rpc(actor,'revoke_reference_consent',{p_consent_id:consentId}));},
  async consentState(actor:Actor,consentId:string){return z.strictObject({state:z.enum(['active','revoked','absent']),consentId:id}).parse(await rpc(actor,'get_reference_consent',{p_consent_id:consentId}));},
  async snapshot(actor:Actor,value:Omit<ReferenceSnapshotScope,'manifestDigest'>&{selectionRevision:number;manifestJson:string;consentId:string|null}){return created.parse(await rpc(actor,'create_reference_snapshot',{p_project_id:value.projectId,p_piece_id:value.conversationId==='references'?null:value.conversationId,p_request_id:value.requestId,p_batch_id:value.batchId,p_purpose:value.purpose,p_selection_revision:value.selectionRevision,p_manifest_json:value.manifestJson,p_consent_id:value.consentId,p_consent_secret:value.consentSecret}));},
  async readSnapshot(actor:Actor,projectId:string,requestId:string){return referenceAuthoritySnapshotSchema.nullable().parse(await rpc(actor,'get_reference_snapshot',{p_project_id:projectId,p_request_id:requestId}));},
  async check(actor:Actor,scope:ReferenceSnapshotScope){return z.boolean().parse(await rpc(actor,'check_reference_authority',checkArgs(scope)));},
  async checkDispatch(actor:Actor,scope:ReferenceSnapshotScope&{intentId:string;intentEpoch:number;intentState:'active'|'consumed'}){return z.boolean().parse(await rpc(actor,'check_reference_exploration_dispatch',{...checkArgs(scope),p_intent_id:scope.intentId,p_intent_epoch:scope.intentEpoch,p_intent_state:scope.intentState}));},
 };
}
export type ReferenceAuthorityStore=ReturnType<typeof createReferenceAuthorityStore>;
