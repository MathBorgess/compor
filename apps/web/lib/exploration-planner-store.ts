import {z} from 'zod';
import type {PlannerStore,PlannerRecord} from '@compor/agents-api/exploration-planner';
import type {AuthConfig} from './supabase.ts';
const id=z.string().uuid();
const recordSchema=z.strictObject({userId:id,projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,requestId:id,attemptId:id,inputDigest:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['starting','running','completed','failed','unknown']),binding:z.string().max(2048).nullable()});
const reservationSchema=z.discriminatedUnion('status',[z.strictObject({status:z.enum(['reserved','existing']),record:recordSchema}),z.strictObject({status:z.enum(['busy','conflict','not_found'])})]);
type Scope=Parameters<PlannerStore['get']>[0];
function validateScope(scope:Scope) {id.parse(scope.actor.userId);id.parse(scope.projectId);id.parse(scope.batchId);id.parse(scope.requestId);if(scope.conversationId!=='references')id.parse(scope.conversationId);if(!/^\S{1,8192}$/.test(scope.actor.token))throw Error('invalid actor');}
function checkRecord(record:PlannerRecord,scope:Scope) {if(record.userId!==scope.actor.userId||record.projectId!==scope.projectId||record.conversationId!==scope.conversationId||record.batchId!==scope.batchId||record.requestId!==scope.requestId)throw Error('invalid scope');return record;}
export function createExplorationPlannerStore(config:Pick<AuthConfig,'service'|'key'>,fetchApi:typeof fetch=fetch,intent?:{intentId:string;intentSecret:string;visualAuthority?:{manifestDigest:string;consentSecret:string|null}}):PlannerStore {
 async function rpc(name:string,scope:Scope,extra:Record<string,string|null>={}) {
  validateScope(scope);
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${scope.actor.token}`,'content-type':'application/json'},body:JSON.stringify({p_project_id:scope.projectId,p_request_id:scope.requestId,...extra}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)throw Error('unavailable');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('invalid response');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 return {
  async reserve(scope) {
   if(!intent||!id.safeParse(intent.intentId).success||!(/^[a-f0-9]{64}$/).test(intent.intentSecret))throw Error('missing intent');
   if(scope.userId!==scope.actor.userId||!(/^[a-f0-9]{64}$/).test(scope.inputDigest)||!(/^[a-f0-9]{64}$/).test(scope.completionDigest))throw Error('invalid reservation');
   const visual=intent.visualAuthority;
   if(visual&&(!/^[a-f0-9]{64}$/.test(visual.manifestDigest)||(visual.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(visual.consentSecret))))throw Error('invalid visual authority');
   const result=reservationSchema.parse(await rpc(visual?'reserve_exploration_plan_authorized':'reserve_exploration_plan',scope,{p_piece_id:scope.conversationId==='references'?null:scope.conversationId,p_batch_id:scope.batchId,p_input_digest:scope.inputDigest,p_completion_digest:scope.completionDigest,p_intent_id:intent.intentId,p_intent_secret:intent.intentSecret,...(visual?{p_manifest_digest:visual.manifestDigest,p_consent_secret:visual.consentSecret}:{})}));
   if(result.status==='reserved'||result.status==='existing')checkRecord(result.record,scope);return result;
  },
  async get(scope){const value=await rpc('get_exploration_plan',scope);return value===null?null:checkRecord(recordSchema.parse(value),scope);},
  async bind(scope){if(await rpc('bind_exploration_plan',scope,{p_binding:scope.binding,p_completion_secret:scope.completionSecret})!==true)throw Error('unavailable');},
  async finish(scope){if(await rpc('finish_exploration_plan',scope,{p_state:scope.state,p_completion_secret:scope.completionSecret})!==true)throw Error('unavailable');},
 };
}
