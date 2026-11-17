import {z} from 'zod';
import type {AuthConfig} from './supabase.ts';
import type {Actor} from './agent-auth.ts';
import type {IntentStore} from './exploration-intent-route.ts';
const id=z.string().uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/),epoch=z.number().int().nonnegative().safe();
const row=z.strictObject({userId:id,projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,intentId:id,contextDigest:digest,credentialDigest:digest,purpose:z.enum(['batch','replacement']),position:z.number().int().min(1).max(3).nullable(),previousId:id.nullable(),state:z.enum(['active','revoked','consumed']),epoch});
const createResponse=z.discriminatedUnion('status',[z.strictObject({status:z.enum(['reserved','existing']),intent:row}),z.strictObject({status:z.enum(['conflict','busy','revoked','not_found'])})]);
const revokeResponse=z.discriminatedUnion('status',[z.strictObject({status:z.enum(['revoked','conflict']),epoch}),z.strictObject({status:z.literal('not_found')})]);
export function createExplorationIntentStore(config:Pick<AuthConfig,'service'|'key'>,fetchApi:typeof fetch=fetch):IntentStore{
 async function rpc(actor:Actor,name:string,args:Record<string,string|number|null>){
  if(!id.safeParse(actor.userId).success||!/^\S{1,8192}$/.test(actor.token))throw Error('invalid actor');
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${actor.token}`,'content-type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)throw Error('unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('invalid response');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 return {
  async create(value){
   const result=createResponse.parse(await rpc(value.actor,'reserve_exploration_intent',{p_project_id:value.projectId,p_piece_id:value.conversationId==='references'?null:value.conversationId,p_batch_id:value.batchId,p_intent_id:value.intentId,p_expected_epoch:value.expectedEpoch,p_context_digest:value.contextDigest,p_credential_digest:value.credentialDigest,p_proof_digest:value.intentProofDigest,p_purpose:value.purpose,p_position:value.position,p_previous_id:value.previousId}));
   if(result.status!=='reserved'&&result.status!=='existing')return {status:result.status};
   const r=result.intent;if(r.userId!==value.actor.userId||r.projectId!==value.projectId||r.conversationId!==value.conversationId||r.batchId!==value.batchId||r.intentId!==value.intentId||r.contextDigest!==value.contextDigest||r.credentialDigest!==value.credentialDigest||r.purpose!==value.purpose||r.position!==value.position||r.previousId!==value.previousId)throw Error('invalid intent');
   if(r.state!=='active')return {status:r.state==='revoked'?'revoked':'conflict'};
   return {status:result.status==='reserved'?'created':'existing',epoch:r.epoch};
  },
  async revoke(value){return revokeResponse.parse(await rpc(value.actor,'revoke_exploration_intent',{p_project_id:value.projectId,p_intent_id:value.intentId,p_expected_epoch:value.expectedEpoch}));},
  async state(value){const result=await rpc(value.actor,'get_exploration_intent_state',{p_project_id:value.projectId,p_intent_id:value.intentId});return result===null?null:z.strictObject({state:z.enum(['active','consumed','revoked','absent']),epoch}).parse(result);},
  async epoch(value){return {epoch:epoch.parse(await rpc(value.actor,'get_exploration_intent_epoch',{}))};},
 };
}
