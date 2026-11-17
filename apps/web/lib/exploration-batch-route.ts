import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import {ExplorationCredentialsRejected} from './exploration-image-route.ts';
import {dispatchReservedExplorationBatch,ExplorationBatchRejected} from './exploration-batch-coordinator.ts';

const id=z.string().uuid();
const item=z.strictObject({position:z.number().int().min(1).max(3),creativePrompt:z.string().min(1).max(4000),composition:z.string().min(1).max(300),contrast:z.string().min(1).max(300),differenceFromOthers:z.string().min(1).max(500),prompt:z.string().min(1).max(8000)});
const planSchema=z.strictObject({version:z.literal(1),items:z.array(item).length(3)}).refine(value=>value.items.every((entry,index)=>entry.position===index+1));
const inputSchema=z.strictObject({projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,planRequestId:id,context:z.record(z.string(),z.unknown()),plan:planSchema,planBinding:z.string().min(1).max(8192),imageIds:z.array(id).length(3).refine(ids=>new Set(ids).size===3)});
const replacementSchema=inputSchema.omit({imageIds:true}).extend({position:z.number().int().min(1).max(3),previousId:id,requestId:id}).refine(value=>value.previousId!==value.requestId);
type BatchInput=z.infer<typeof inputSchema>;
const reservationSchema=z.strictObject({state:z.enum(['running','unknown','completed','rejected','busy','blocked','awaiting_feedback','cooldown','partial','conflict']),isNew:z.boolean()});
type BatchReservation=z.infer<typeof reservationSchema>;
type BatchStore={
 reserveBatch:(actor:Actor,input:{projectId:string;batchId:string;pieceId:string|null;planDigest:string;imageIds:string[];promptDigests:string[];rejectionDigests:string[]})=>Promise<BatchReservation>;
 replaceRejected?:(actor:Actor,input:{projectId:string;batchId:string;position:number;previousId:string;requestId:string;promptDigest:string;rejectionDigest:string})=>Promise<BatchReservation>;
 plan:(actor:Actor,projectId:string,requestId:string,value:{composition:string;contrast:string})=>Promise<void>;
 put:(actor:Actor,projectId:string,requestId:string,bytes:Uint8Array)=>Promise<void>;
 finish:(actor:Actor,projectId:string,requestId:string,state:'completed'|'unknown',secret:string)=>Promise<void>;
 reject:(actor:Actor,projectId:string,requestId:string,secret:string)=>Promise<void>;
};
type Dependencies={appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;verifyPlan:(input:{actor:Actor;apiKey:string;projectId:string;conversationId:string;batchId:string;requestId:string;context:BatchInput['context'];plan:BatchInput['plan'];token:string})=>Promise<boolean>;store:BatchStore;generate:(actor:Actor,key:string,prompt:string)=>Promise<Uint8Array>};
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function readBody(request:Request){
 if(!request.body)throw Error('missing');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('too large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}finally{await reader.cancel().catch(()=>{});}
}

/** HTTP adapter: plan proof and durable reservation precede any image call. */
export function createExplorationBatchRoute(deps:Dependencies){
 return {
  async post(request:Request){
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
   const key=request.headers.get('x-compor-openai-key')??'';if(!/^sk-[^\s]{20,300}$/.test(key))return reply({error:'invalid_request'},400);
   let input:BatchInput;try{input=inputSchema.parse(await readBody(request));}catch{return reply({error:'invalid_request'},400);}
   if(JSON.stringify(input).includes(key))return reply({error:'invalid_request'},400);
   let actor:Actor|null;try{actor=await deps.resolveActor();if(!actor||!id.safeParse(actor.userId).success||!actor.token)return reply({error:'unauthorized'},401);if(!await deps.ownsProject(actor,input.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
   try{if(!await deps.verifyPlan({actor,apiKey:key,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.planRequestId,context:input.context,plan:input.plan,token:input.planBinding}))return reply({error:'invalid_plan'},403);}catch{return reply({error:'invalid_plan'},403);}
   if(request.signal.aborted)return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},409);
   const proofs=input.imageIds.map(()=>randomBytes(32).toString('hex'));
   const children=input.plan.items.map((entry,index)=>({requestId:input.imageIds[index],prompt:entry.prompt,proof:proofs[index]}));
   let reservation:BatchReservation;
   try{reservation=reservationSchema.parse(await deps.store.reserveBatch(actor,{projectId:input.projectId,batchId:input.batchId,pieceId:input.conversationId==='references'?null:input.conversationId,planDigest:hash(JSON.stringify(input.plan)),imageIds:input.imageIds,promptDigests:input.plan.items.map(entry=>hash(JSON.stringify({prompt:entry.prompt,plan:{composition:entry.composition,contrast:entry.contrast},batch:{id:input.batchId,position:entry.position}}))),rejectionDigests:proofs.map(proof=>hash(Buffer.from(proof,'hex')))}));}catch{return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},503);}
   if(!reservation.isNew)return reply({status:reservation.state,batchId:input.batchId,retryAutomatically:false},409);
   if(reservation.state!=='running')return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},503);
   const results=await dispatchReservedExplorationBatch(children,{
    generate:async child=>{const entry=input.plan.items[input.imageIds.indexOf(child.requestId)];if(request.signal.aborted)throw Error('aborted before dispatch');await deps.store.plan(actor,input.projectId,child.requestId,{composition:entry.composition,contrast:entry.contrast});if(request.signal.aborted)throw Error('aborted before dispatch');try{return await deps.generate(actor,key,child.prompt);}catch(error){if(error instanceof ExplorationCredentialsRejected)throw new ExplorationBatchRejected();throw error;}},
    put:(child,bytes)=>deps.store.put(actor,input.projectId,child.requestId,bytes),
    finish:(child,state)=>deps.store.finish(actor,input.projectId,child.requestId,state,child.proof),
    reject:child=>deps.store.reject(actor,input.projectId,child.requestId,child.proof),
   });
   return reply({status:results.some(x=>x.status==='unknown')?'unknown':results.some(x=>x.status==='rejected')?'partial':'completed',batchId:input.batchId,images:results,retryAutomatically:false},200);
  },
  async replace(request:Request){
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
   const key=request.headers.get('x-compor-openai-key')??'';if(!/^sk-[^\s]{20,300}$/.test(key))return reply({error:'invalid_request'},400);
   let input:z.infer<typeof replacementSchema>;try{input=replacementSchema.parse(await readBody(request));}catch{return reply({error:'invalid_request'},400);}
   if(JSON.stringify(input).includes(key)||!deps.store.replaceRejected)return reply({error:'invalid_request'},400);
   let actor:Actor|null;try{actor=await deps.resolveActor();if(!actor||!id.safeParse(actor.userId).success||!actor.token)return reply({error:'unauthorized'},401);if(!await deps.ownsProject(actor,input.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
   try{if(!await deps.verifyPlan({actor,apiKey:key,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.planRequestId,context:input.context,plan:input.plan,token:input.planBinding}))return reply({error:'invalid_plan'},403);}catch{return reply({error:'invalid_plan'},403);}
   if(request.signal.aborted)return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},409);
   const entry=input.plan.items[input.position-1],proof=randomBytes(32).toString('hex');
   let reservation:BatchReservation;
   try{reservation=reservationSchema.parse(await deps.store.replaceRejected(actor,{projectId:input.projectId,batchId:input.batchId,position:input.position,previousId:input.previousId,requestId:input.requestId,promptDigest:hash(JSON.stringify({prompt:entry.prompt,plan:{composition:entry.composition,contrast:entry.contrast},batch:{id:input.batchId,position:entry.position}})),rejectionDigest:hash(Buffer.from(proof,'hex'))}));}catch{return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},503);}
   if(!reservation.isNew)return reply({status:reservation.state,batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},409);
   if(reservation.state!=='running')return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},503);
   try{
    if(request.signal.aborted)throw Error('aborted before dispatch');
    await deps.store.plan(actor,input.projectId,input.requestId,{composition:entry.composition,contrast:entry.contrast});
    if(request.signal.aborted)throw Error('aborted before dispatch');
    let bytes:Uint8Array;try{bytes=await deps.generate(actor,key,entry.prompt);}catch(error){if(error instanceof ExplorationCredentialsRejected){await deps.store.reject(actor,input.projectId,input.requestId,proof);return reply({status:'rejected',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},200);}throw error;}
    await deps.store.put(actor,input.projectId,input.requestId,bytes);
    await deps.store.finish(actor,input.projectId,input.requestId,'completed',proof);
    return reply({status:'completed',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},200);
   }catch{
    try{await deps.store.finish(actor,input.projectId,input.requestId,'unknown',proof);}catch{/* A lost or ambiguous receipt remains unknown. */}
    return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},200);
   }
  },
 };
}
