import {z} from 'zod';
import {validateExplorationContext} from '@compor/agents-api/exploration-plan-contract';
import type {PlannerBindings,VisualAuthorizationInput} from '@compor/agents-api/exploration-planner';
import type {Actor} from './agent-auth.ts';
import {deriveExplorationIntent} from './exploration-intent.ts';
import type {ExplorationIntentScope} from './exploration-intent.ts';
import {parseVisualInputManifest,visualInputMatchesProject,type VisualInputManifest} from '@compor/agents-api/visual-input-contract';
const id=z.string().uuid(),reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const createSchema=z.strictObject({projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,intentId:id,purpose:z.enum(['batch','replacement']),position:z.number().int().min(1).max(3).optional(),previousId:id.optional(),context:z.unknown(),visualInput:z.unknown().optional(),expectedEpoch:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),apiKey:z.string().regex(/^sk-[^\s]{20,300}$/)});
const projectSchema=z.strictObject({projectId:id}),stateSchema=projectSchema.extend({intentId:id}),revokeSchema=stateSchema.extend({expectedEpoch:z.number().int().nonnegative().safe()});
const contains=(value:unknown,key:string):boolean=>typeof value==='string'?value.includes(key):Array.isArray(value)?value.some(v=>contains(v,key)):value!==null&&typeof value==='object'?Object.values(value).some(v=>contains(v,key)):false;
export type IntentStore={
 create:(value:{actor:Actor;projectId:string;conversationId:string;batchId:string;intentId:string;purpose:'batch'|'replacement';position:number|null;previousId:string|null;expectedEpoch:number;contextDigest:string;credentialDigest:string;intentProofDigest:string})=>Promise<{status:'created'|'existing';epoch:number}|{status:'conflict'|'busy'|'revoked'|'not_found'}>;
 revoke:(value:{actor:Actor;projectId:string;intentId:string;expectedEpoch:number})=>Promise<{status:'revoked';epoch:number;revocationEpoch:number|null}|{status:'conflict';epoch:number}|{status:'not_found'}>;
 epoch:(value:{actor:Actor;projectId:string})=>Promise<{epoch:number}>;
 state:(value:{actor:Actor;projectId:string;intentId:string})=>Promise<{state:'active'|'consumed'|'revoked'|'absent';epoch:number;revocationEpoch:number|null}|null>;
};
type Deps={appOrigin:string;apiKey?:string;bindings?:PlannerBindings;allowCreate:boolean;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;store:IntentStore;authorizeVisualInput?:(input:VisualAuthorizationInput)=>Promise<boolean>};
async function body(request:Request,limit:number):Promise<unknown>{
 if(!request.body)throw Error('missing');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
}
export function createExplorationIntentRoute(deps:Deps){
 async function authorize(projectId:string){
  const actor=await deps.resolveActor();if(!actor||!id.safeParse(actor.userId).success||!actor.token)return null;
  if(!await deps.ownsProject(actor,projectId))return null;return actor;
 }
 async function parse(request:Request,limit:number){
  if(request.method!=='POST'||request.headers.get('origin')!==deps.appOrigin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw Error('invalid request');return body(request,limit);
 }
 return {
  async create(request:Request){
   let raw:unknown;try{raw=await parse(request,65536);}catch{return reply({error:'invalid_request'},400);}
   const parsed=createSchema.safeParse(raw);if(!parsed.success||!deps.apiKey||parsed.data.apiKey!==deps.apiKey||!deps.bindings||!validateExplorationContext(parsed.data.context)||contains(parsed.data.context,deps.apiKey))return reply({error:'invalid_request'},400);
   const validatedContext=parsed.data.context;const data=parsed.data;if(data.purpose==='batch'?(data.position!==undefined||data.previousId!==undefined):(data.position===undefined||data.previousId===undefined))return reply({error:'invalid_request'},400);
   let visualInput:VisualInputManifest|undefined;try{if(data.visualInput!==undefined)visualInput=parseVisualInputManifest(data.visualInput);}catch{return reply({error:'invalid_request'},400);}
   if(visualInput!==undefined&&!visualInputMatchesProject(visualInput,data.projectId))return reply({error:'invalid_request'},400);
   if(!deps.allowCreate)return reply({status:'unavailable'},503);
   try{
    const actor=await authorize(data.projectId);if(!actor)return reply({error:'not_found'},404);
    if(visualInput?.version===2&&visualInput.entries.some(entry=>entry.inputOrigin!=='local-upload')&&(!deps.authorizeVisualInput||await deps.authorizeVisualInput({actor,projectId:data.projectId,conversationId:data.conversationId,batchId:data.batchId,intentId:data.intentId,visualInput})!==true))return reply({error:'visual_references_not_authorized',retryAutomatically:false},403);
    const scope={actor,projectId:data.projectId,conversationId:data.conversationId,batchId:data.batchId,intentId:data.intentId,context:validatedContext,...(visualInput===undefined?{}:{visualInput})};
    let intention:ExplorationIntentScope;
    if(data.purpose==='batch')intention={...scope,purpose:'batch'};
    else{if(data.position===undefined||data.previousId===undefined)return reply({error:'invalid_request'},400);intention={...scope,purpose:'replacement',position:data.position,previousId:data.previousId};}
    const {contextDigest,credentialDigest,intentProofDigest}=deriveExplorationIntent(deps.bindings,intention);
    const result=await deps.store.create({actor,projectId:data.projectId,conversationId:data.conversationId,batchId:data.batchId,intentId:data.intentId,purpose:data.purpose,position:data.position??null,previousId:data.previousId??null,expectedEpoch:data.expectedEpoch,contextDigest,credentialDigest,intentProofDigest});
    return reply(result,result.status==='not_found'?404:result.status==='conflict'||result.status==='busy'||result.status==='revoked'?409:200);
   }catch{return reply({status:'unknown',retryAutomatically:false},503);}
  },
  async revoke(request:Request){
   let value;try{value=revokeSchema.parse(await parse(request,4096));}catch{return reply({error:'invalid_request'},400);}
   try{const actor=await authorize(value.projectId);if(!actor)return reply({error:'not_found'},404);const result=await deps.store.revoke({actor,...value});return reply(result,result.status==='not_found'?404:result.status==='conflict'?409:200);}catch{return reply({status:'unknown',retryAutomatically:false},503);}
  },
  async state(request:Request){
   let value;try{value=stateSchema.parse(await parse(request,4096));}catch{return reply({error:'invalid_request'},400);}
   try{const actor=await authorize(value.projectId);if(!actor)return reply({error:'not_found'},404);const state=await deps.store.state({actor,...value});return state?reply(state,200):reply({error:'not_found'},404);}catch{return reply({status:'unavailable'},503);}
  },
  async epoch(request:Request){
   let value;try{value=projectSchema.parse(await parse(request,4096));}catch{return reply({error:'invalid_request'},400);}
   try{const actor=await authorize(value.projectId);if(!actor)return reply({error:'not_found'},404);return reply(await deps.store.epoch({actor,...value}),200);}catch{return reply({status:'unavailable'},503);}
  },
 };
}
