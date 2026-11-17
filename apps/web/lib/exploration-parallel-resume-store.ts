import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {AuthConfig} from './supabase.ts';
const epoch=z.number().int().nonnegative().safe(),id=z.string().uuid();
export const parallelResumeReceipt=z.strictObject({status:z.enum(['resumed','not_paused']),intentEpoch:epoch,reviewEpoch:epoch});
export const parallelResumeResult=z.union([parallelResumeReceipt,z.strictObject({status:z.enum(['revoked','conflict','blocked','not_found'])})]);
type Scope={actor:Actor;projectId:string;intentId:string};
type ResumeInput=Scope&{pieceId:string|null;batchId:string;intentSecret:string;expectedEpoch:number};
export function createExplorationParallelResumeStore(config:Pick<AuthConfig,'service'|'key'>,fetchApi:typeof fetch=fetch){
 async function rpc(scope:Scope,name:string,args:Record<string,string|number|null>){
  id.parse(scope.actor.userId);id.parse(scope.projectId);id.parse(scope.intentId);if(!/^\S{1,8192}$/.test(scope.actor.token))throw Error('invalid actor');
  const response=await fetchApi(new URL(`/rest/v1/rpc/${name}`,config.service),{method:'POST',headers:{apikey:config.key,authorization:`Bearer ${scope.actor.token}`,'content-type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)throw Error('unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('invalid response');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 return {
  async resume(value:ResumeInput){id.parse(value.batchId);if(value.pieceId!==null)id.parse(value.pieceId);epoch.positive().parse(value.expectedEpoch);if(!/^[a-f0-9]{64}$/.test(value.intentSecret))throw Error('invalid capability');
   const result=parallelResumeResult.parse(await rpc(value,'resume_exploration_parallel_review',{p_project_id:value.projectId,p_piece_id:value.pieceId,p_batch_id:value.batchId,p_intent_id:value.intentId,p_intent_secret:value.intentSecret,p_expected_epoch:value.expectedEpoch}));
   if('intentEpoch' in result&&result.intentEpoch!==value.expectedEpoch)throw Error('invalid epoch');return result;
  },
  async get(value:Scope){const result=await rpc(value,'get_exploration_parallel_review',{p_project_id:value.projectId,p_intent_id:value.intentId});return result===null?null:parallelResumeReceipt.parse(result);},
 };
}
