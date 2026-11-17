import {z} from 'zod';
import {validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import type {ExplorationPlannerInput,PlannerResult} from '@compor/agents-api/exploration-planner';
import type {Actor} from './agent-auth.ts';
const id=z.string().uuid();
const schema=z.strictObject({op:z.enum(['submit','poll']),projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,requestId:id,context:z.unknown(),explicitIntent:z.literal(true).optional(),apiKey:z.string().regex(/^sk-[^\s]{20,300}$/)});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
type Planner={submit:(input:ExplorationPlannerInput)=>Promise<PlannerResult>;poll:(input:ExplorationPlannerInput)=>Promise<PlannerResult>};
type Dependencies={appOrigin:string;apiKey:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;planner:Planner};
export function createExplorationPlannerRoute(deps:Dependencies){
 return async(request:Request)=>{
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
  let raw:unknown;try{if(!request.body)throw Error('missing');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('large');chunks.push(value);}raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}}catch{return reply({error:'invalid_request'},400);}
  const parsed=schema.safeParse(raw);if(!parsed.success||parsed.data.apiKey!==deps.apiKey||!validateExplorationContext(parsed.data.context)||(parsed.data.op==='submit'?parsed.data.explicitIntent!==true:parsed.data.explicitIntent!==undefined))return reply({error:'invalid_request'},400);
  let actor:Actor|null;try{actor=await deps.resolveActor();}catch{return reply({error:'unavailable'},503);}
  if(!actor)return reply({error:'unauthorized'},401);
  try{if(!await deps.ownsProject(actor,parsed.data.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
  const input={actor,projectId:parsed.data.projectId,conversationId:parsed.data.conversationId,batchId:parsed.data.batchId,requestId:parsed.data.requestId,context:parsed.data.context};
  try{const result=await deps.planner[parsed.data.op](input);const status=result.status==='running'||result.status==='unknown'?202:result.status==='conflict'||result.status==='busy'?409:result.status==='unavailable'?503:200;return reply(result,status);}catch{return reply({status:'unknown',retryAutomatically:false},503);}
 };
}
