import {z} from 'zod';
import {validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import type {ExplorationPlannerInput,PlannerResult,PlannerBindings,VisualAuthorizationInput} from '@compor/agents-api/exploration-planner';
import type {Actor} from './agent-auth.ts';
import {deriveExplorationIntent} from './exploration-intent.ts';
import {parseVisualInputManifest,visualInputMatchesProject,MAX_VISUAL_REQUEST_BYTES,type VisualInputManifest,type VisualReferenceImage} from '@compor/agents-api/visual-input-contract';
import {parseVisualInput} from '@compor/agents-api/visual-input';
const id=z.string().uuid();
const schema=z.strictObject({op:z.enum(['submit','poll']),projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,requestId:id,context:z.unknown(),visualInput:z.unknown().optional(),referenceImages:z.unknown().optional(),intentId:id.optional(),apiKey:z.string().regex(/^sk-[^\s]{20,300}$/)});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const containsCredential=(value:unknown,key:string):boolean=>typeof value==='string'?value.includes(key):Array.isArray(value)?value.some(item=>containsCredential(item,key)):value!==null&&typeof value==='object'?Object.values(value).some(item=>containsCredential(item,key)):false;
type Planner={submit:(input:ExplorationPlannerInput)=>Promise<PlannerResult>;poll:(input:ExplorationPlannerInput)=>Promise<PlannerResult>};
type Dependencies={appOrigin:string;apiKey:string;allowSubmit:boolean;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;bindings:PlannerBindings;plannerFor:(intent?:{intentId:string;intentSecret:string})=>Planner;authorizeVisualInput?:(input:VisualAuthorizationInput)=>Promise<boolean>};
export function createExplorationPlannerRoute(deps:Dependencies){
 return async(request:Request)=>{
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
  let raw:unknown;try{if(!request.body)throw Error('missing');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_VISUAL_REQUEST_BYTES)throw Error('large');chunks.push(value);}raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}}catch{return reply({error:'invalid_request'},400);}
  const parsed=schema.safeParse(raw);if(!parsed.success||parsed.data.apiKey!==deps.apiKey||!validateExplorationContext(parsed.data.context)||containsCredential(parsed.data.context,deps.apiKey)||(parsed.data.op==='submit'?parsed.data.intentId===undefined:parsed.data.intentId!==undefined))return reply({error:'invalid_request'},400);
  let visualInput:VisualInputManifest|undefined,referenceImages:readonly VisualReferenceImage[]|undefined;
  try{
   if(parsed.data.visualInput!==undefined){visualInput=parseVisualInputManifest(parsed.data.visualInput);if(parsed.data.op==='submit')({visualInput,referenceImages}=parseVisualInput(visualInput,parsed.data.referenceImages));}
   if(parsed.data.referenceImages!==undefined&&(visualInput===undefined||parsed.data.op==='poll'))throw Error('unbound images');
   if(visualInput!==undefined&&!visualInputMatchesProject(visualInput,parsed.data.projectId))throw Error('invalid visual scope');
  }catch{return reply({error:'invalid_request'},400);}
  if(parsed.data.op==='submit'&&!deps.allowSubmit)return reply({status:'unavailable',retryAutomatically:false},503);
  let actor:Actor|null;try{actor=await deps.resolveActor();}catch{return reply({error:'unavailable'},503);}
  if(!actor)return reply({error:'unauthorized'},401);
  try{if(!await deps.ownsProject(actor,parsed.data.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
  const input={actor,projectId:parsed.data.projectId,conversationId:parsed.data.conversationId,batchId:parsed.data.batchId,requestId:parsed.data.requestId,context:parsed.data.context,...(visualInput===undefined?{}:{visualInput}),...(referenceImages===undefined?{}:{referenceImages})};
  if(parsed.data.op==='submit'&&visualInput?.version===2&&visualInput.entries.some(entry=>entry.inputOrigin!=='local-upload')){
   try{if(!deps.authorizeVisualInput||await deps.authorizeVisualInput({actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,intentId:parsed.data.intentId,visualInput})!==true)return reply({error:'visual_references_not_authorized',retryAutomatically:false},403);}catch{return reply({status:'unavailable',retryAutomatically:false},503);}
  }
  try{let planner:Planner;if(parsed.data.op==='submit'){if(!parsed.data.intentId)return reply({error:'invalid_request'},400);const capability=deriveExplorationIntent(deps.bindings,{...input,intentId:parsed.data.intentId,purpose:'batch'});planner=deps.plannerFor({intentId:parsed.data.intentId,intentSecret:capability.intentSecret});}else planner=deps.plannerFor();const result=await planner[parsed.data.op](input);const status=result.status==='running'||result.status==='unknown'?202:result.status==='conflict'||result.status==='busy'?409:result.status==='unavailable'?503:200;return reply(result,status);}catch{return reply({status:'unknown',retryAutomatically:false},503);}
 };
}
