import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {PlannerStore} from '@compor/agents-api/exploration-planner';
import type {createExplorationBatchStore} from './exploration-batch-store.ts';

const id=z.string().uuid();
const batchInput=z.strictObject({projectId:id,batchId:id});
const planInput=batchInput.extend({conversationId:z.union([z.literal('references'),id]),requestId:id});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
type Deps={appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;getBatch:ReturnType<typeof createExplorationBatchStore>['getBatch'];getPlan:PlannerStore['get']};

/** Authenticated local receipt lookup; a missing record is not an authorization to retry. */
export function createExplorationRecoveryStatusRoute(deps:Deps){
 async function parse(request:Request){
  if(request.method!=='POST'||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('invalid request');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 async function authorize(projectId:string){const actor=await deps.resolveActor();if(!actor)return {actor:null,status:401};if(!await deps.ownsProject(actor,projectId))return {actor:null,status:404};return {actor,status:200};}
 async function batch(request:Request){
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  let value:z.infer<typeof batchInput>;try{value=batchInput.parse(await parse(request));}catch{return reply({error:'invalid_request'},400);}
  try{const auth=await authorize(value.projectId);if(!auth.actor)return reply({error:auth.status===401?'unauthorized':'not_found'},auth.status);
   const result=await deps.getBatch(auth.actor,value.projectId,value.batchId);
   return result===null?reply({status:'absent',...value},200):reply(result,200);
  }catch{return reply({error:'unavailable'},503);}
 }
 async function plan(request:Request){
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  let value:z.infer<typeof planInput>;try{value=planInput.parse(await parse(request));}catch{return reply({error:'invalid_request'},400);}
  try{const auth=await authorize(value.projectId);if(!auth.actor)return reply({error:auth.status===401?'unauthorized':'not_found'},auth.status);
   const result=await deps.getPlan({actor:auth.actor,...value});
   if(result!==null&&(result.userId!==auth.actor.userId||result.projectId!==value.projectId||result.conversationId!==value.conversationId||result.batchId!==value.batchId||result.requestId!==value.requestId))throw Error('scope mismatch');
   return reply({status:result===null?'absent':result.state,...value},200);
  }catch{return reply({error:'unavailable'},503);}
 }
 return {batch,plan};
}
