import {z} from 'zod';
import {validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import type {PlannerBindings,VisualAuthorizationInput} from '@compor/agents-api/exploration-planner';
import type {Actor} from './agent-auth.ts';
import {deriveExplorationIntent} from './exploration-intent.ts';
import type {createExplorationParallelResumeStore} from './exploration-parallel-resume-store.ts';
import {parallelResumeReceipt,parallelResumeResult} from './exploration-parallel-resume-store.ts';
import {parseVisualInputManifest,visualInputMatchesProject,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';
const id=z.string().uuid(),epoch=z.number().int().nonnegative().safe();
const input=z.strictObject({projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,intentId:id,expectedEpoch:epoch.positive(),context:z.unknown(),visualInput:z.unknown().optional(),apiKey:z.string().regex(/^sk-[^\s]{20,300}$/)});
const statusInput=z.strictObject({projectId:id,intentId:id});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
type Deps={appOrigin:string;apiKey?:string;bindings?:PlannerBindings;allowResume:()=>boolean;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;store:ReturnType<typeof createExplorationParallelResumeStore>;authorizeVisualInput?:(input:VisualAuthorizationInput)=>Promise<boolean>};
export function createExplorationParallelResumeRoute(deps:Deps){
 async function read(request:Request){if(request.method!=='POST'||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('invalid request');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}}
 async function authorize(projectId:string){const actor=await deps.resolveActor();if(!actor)return {actor:null,status:401};if(!await deps.ownsProject(actor,projectId))return {actor:null,status:404};return {actor,status:200};}
 async function resume(request:Request){
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  let value:z.infer<typeof input>;try{value=input.parse(await read(request));}catch{return reply({error:'invalid_request'},400);}
  if(!deps.apiKey||value.apiKey!==deps.apiKey||!deps.bindings||!validateExplorationContext(value.context)||JSON.stringify(value.context).includes(deps.apiKey))return reply({error:'invalid_request'},400);
  let visualInput:VisualInputManifest|undefined;try{if(value.visualInput!==undefined)visualInput=parseVisualInputManifest(value.visualInput);}catch{return reply({error:'invalid_request'},400);}
  if(visualInput!==undefined&&!visualInputMatchesProject(visualInput,value.projectId))return reply({error:'invalid_request'},400);
  if(!deps.allowResume())return reply({status:'unavailable',retryAutomatically:false},503);
  try{const auth=await authorize(value.projectId);if(!auth.actor)return reply({error:auth.status===401?'unauthorized':'not_found'},auth.status);
   if(visualInput?.version===2&&visualInput.entries.some(entry=>entry.inputOrigin!=='local-upload')&&(!deps.authorizeVisualInput||await deps.authorizeVisualInput({actor:auth.actor,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,intentId:value.intentId,visualInput})!==true))return reply({error:'visual_references_not_authorized',retryAutomatically:false},403);
   if(request.signal.aborted)return reply({status:'unknown',retryAutomatically:false},409);
   const capability=deriveExplorationIntent(deps.bindings,{actor:auth.actor,projectId:value.projectId,conversationId:value.conversationId,batchId:value.batchId,intentId:value.intentId,context:value.context,purpose:'batch',...(visualInput===undefined?{}:{visualInput})});
   const result=parallelResumeResult.parse(await deps.store.resume({actor:auth.actor,projectId:value.projectId,pieceId:value.conversationId==='references'?null:value.conversationId,batchId:value.batchId,intentId:value.intentId,intentSecret:capability.intentSecret,expectedEpoch:value.expectedEpoch}));
   if('intentEpoch' in result&&result.intentEpoch!==value.expectedEpoch)throw Error('invalid epoch');
   return reply({...result,retryAutomatically:false},result.status==='not_found'?404:result.status==='revoked'||result.status==='conflict'||result.status==='blocked'?409:200);
  }catch{return reply({status:'unknown',retryAutomatically:false},503);}
 }
 async function status(request:Request){
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  let value:z.infer<typeof statusInput>;try{value=statusInput.parse(await read(request));}catch{return reply({error:'invalid_request'},400);}
  try{const auth=await authorize(value.projectId);if(!auth.actor)return reply({error:auth.status===401?'unauthorized':'not_found'},auth.status);const result=await deps.store.get({actor:auth.actor,...value});return reply(result===null?{status:'absent',...value}:{...parallelResumeReceipt.parse(result),...value},200);}catch{return reply({error:'unavailable'},503);}
 }
 return {resume,status};
}
