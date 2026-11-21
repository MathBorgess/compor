import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {parseVisualInput,parseSelectedVisualInput,visualInputDigest} from '@compor/agents-api/visual-input';
import {MAX_VISUAL_REQUEST_BYTES,parseVisualInputManifest,visualInputMatchesProject} from '@compor/agents-api/visual-input-contract';
import type {VisualInputManifest,VisualReferenceImage} from '@compor/agents-api/visual-input-contract';
import type {Actor} from './agent-auth.ts';
import type {IntentStore} from './exploration-intent-route.ts';
import {ExplorationCredentialsRejected} from './exploration-image-route.ts';
import {ExplorationProviderClosed,ExplorationQualityHeld,explorationImageOutcomes,isReplaceableExplorationOutcome,type ExplorationClosureReason,type ExplorationProviderOutcome,type ExplorationQualityReason,type ExplorationReviewOptions} from './exploration-image-outcome.ts';
import {dispatchReservedExplorationBatch,ExplorationBatchRejected} from './exploration-batch-coordinator.ts';

const id=z.string().uuid();
const item=z.strictObject({position:z.number().int().min(1).max(3),creativePrompt:z.string().min(1).max(4000),composition:z.string().min(1).max(300),contrast:z.string().min(1).max(300),differenceFromOthers:z.string().min(1).max(500),prompt:z.string().min(1).max(8000)});
const planSchema=z.discriminatedUnion('version',[z.strictObject({version:z.literal(1),items:z.array(item).length(3)}),z.strictObject({version:z.literal(2),items:z.array(item).length(3),referenceIds:z.array(id).max(20)})]).refine(value=>value.items.every((entry,index)=>entry.position===index+1));
const inputSchema=z.strictObject({projectId:id,conversationId:z.union([z.literal('references'),id]),batchId:id,intentId:id,planRequestId:id,context:z.record(z.string(),z.unknown()),plan:planSchema,planBinding:z.string().min(1).max(8192),visualInput:z.unknown().optional(),referenceImages:z.unknown().optional(),imageIds:z.array(id).length(3).refine(ids=>new Set(ids).size===3)});
const replacementSchema=inputSchema.omit({imageIds:true}).extend({position:z.number().int().min(1).max(3),previousId:id,requestId:id}).refine(value=>value.previousId!==value.requestId);
type BatchInput=z.infer<typeof inputSchema>;
type VisualAuthority={requestId:string;manifestDigest:string;consentSecret:string|null};
type VisualScope={actor:Actor;projectId:string;conversationId:string;batchId:string;requestId:string;purpose:'parallel'|'replacement';visualInput:VisualInputManifest;consentHeader:string|null};
const reservationSchema=z.strictObject({state:z.enum([...explorationImageOutcomes,'busy','blocked','awaiting_feedback','cooldown','partial','conflict','revoked']),isNew:z.boolean()});
const intentEpoch=z.number().int().nonnegative().safe();
const intentStateSchema=z.strictObject({state:z.enum(['active','consumed','revoked','absent']),epoch:intentEpoch,revocationEpoch:intentEpoch.nullable()}).refine(value=>value.revocationEpoch===null||(value.state==='revoked'&&value.revocationEpoch<=value.epoch));
type BatchReservation=z.infer<typeof reservationSchema>;
type BatchStore={
 reserveBatch:(actor:Actor,input:{projectId:string;batchId:string;pieceId:string|null;planDigest:string;intentId:string;intentSecret:string;imageIds:string[];promptDigests:string[];rejectionDigests:string[];visualAuthority?:VisualAuthority})=>Promise<BatchReservation>;
 replaceRejected?:(actor:Actor,input:{projectId:string;batchId:string;position:number;previousId:string;requestId:string;intentId:string;intentSecret:string;promptDigest:string;rejectionDigest:string;visualAuthority?:VisualAuthority})=>Promise<BatchReservation>;
 plan:(actor:Actor,projectId:string,requestId:string,value:{composition:string;contrast:string})=>Promise<void>;
 put:(actor:Actor,projectId:string,requestId:string,bytes:Uint8Array)=>Promise<void>;
 finish:(actor:Actor,projectId:string,requestId:string,state:'completed'|'unknown',secret:string)=>Promise<void>;
 reject:(actor:Actor,projectId:string,requestId:string,secret:string)=>Promise<void>;
 hold:(actor:Actor,projectId:string,requestId:string,secret:string,reason:ExplorationQualityReason)=>Promise<void>;
 fail?:(actor:Actor,projectId:string,requestId:string,secret:string,closureReason:ExplorationClosureReason,providerOutcome:ExplorationProviderOutcome)=>Promise<void>;
};
type Dependencies={appOrigin:string;generationAvailable?:boolean;visualEnabled?:boolean;visualRequired?:boolean;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;prepareVisualAuthority?:(input:VisualScope)=>Promise<VisualAuthority|null>;checkVisualDispatch?:(input:VisualScope & {authority:VisualAuthority;intentId:string;intentEpoch:number})=>Promise<boolean>;verifyPlan:(input:{actor:Actor;apiKey:string;projectId:string;conversationId:string;batchId:string;requestId:string;context:BatchInput['context'];plan:BatchInput['plan'];token:string;visualInput?:VisualInputManifest})=>Promise<boolean>;intentSecret:(input:{actor:Actor;projectId:string;conversationId:string;batchId:string;intentId:string;context:BatchInput['context'];purpose:'batch'|'replacement';position?:number;previousId?:string;visualInput?:VisualInputManifest})=>string;intentState:IntentStore['state'];store:BatchStore;generate:(actor:Actor,key:string,prompt:string,images:readonly VisualReferenceImage[],review:ExplorationReviewOptions)=>Promise<Uint8Array>};
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function readBody(request:Request){
 if(!request.body)throw Error('missing');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_VISUAL_REQUEST_BYTES)throw Error('too large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}finally{await reader.cancel().catch(()=>{});}
}
function parseManifest(input:{visualInput?:unknown;referenceImages?:unknown;projectId:string;plan:BatchInput['plan']}){
 if(input.visualInput===undefined&&input.referenceImages===undefined)return null;
 if(input.visualInput===undefined||input.referenceImages===undefined)throw Error('missing visual input');
 const visualInput=parseVisualInputManifest(input.visualInput);
 if(!visualInputMatchesProject(visualInput,input.projectId)||visualInput.version!==input.plan.version)throw Error('invalid visual scope');
 return visualInput;
}
function planDigest(plan:BatchInput['plan'],visualInput?:VisualInputManifest){return hash(JSON.stringify(visualInput===undefined?plan:{type:'parallel-visual-plan-v1',plan,visualInputDigest:visualInputDigest(visualInput)}));}
function promptDigest(entry:BatchInput['plan']['items'][number],batchId:string,visualInput?:VisualInputManifest,referenceIds?:string[]){
 const value={prompt:entry.prompt,plan:{composition:entry.composition,contrast:entry.contrast},batch:{id:batchId,position:entry.position}};
 return hash(JSON.stringify(visualInput===undefined?value:{type:'parallel-visual-prompt-v1',...value,visualInputDigest:visualInputDigest(visualInput),...(referenceIds?{referenceIds}: {})}));
}

/** HTTP adapter: plan proof and durable reservation precede any image call. */
export function createExplorationBatchRoute(deps:Dependencies){
 async function beforeDispatch(actor:Actor,projectId:string,intentId:string,initial:z.infer<typeof intentStateSchema>,signal:AbortSignal,visualScope?:VisualScope,authority?:VisualAuthority){
  if(signal.aborted||initial.state!=='active')throw Error('intent unavailable');
  if(visualScope||authority){
   if(!visualScope||!authority||!deps.checkVisualDispatch||!await deps.checkVisualDispatch({...visualScope,authority,intentId,intentEpoch:initial.epoch})||signal.aborted)throw Error('visual authority unavailable');
   return;
  }
  const current=intentStateSchema.parse(await deps.intentState({actor,projectId,intentId}));
  if(signal.aborted||current.state!=='consumed'||current.epoch!==initial.epoch)throw Error('intent unavailable');
 }
 return {
  async post(request:Request){
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
   if(deps.generationAvailable===false)return reply({error:'unavailable'},503);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
   const key=request.headers.get('x-compor-openai-key')??'';if(!/^sk-[^\s]{20,300}$/.test(key))return reply({error:'invalid_request'},400);
   let input:BatchInput;try{input=inputSchema.parse(await readBody(request));}catch{return reply({error:'invalid_request'},400);}
   if(JSON.stringify(input).includes(key))return reply({error:'invalid_request'},400);
   let actor:Actor|null;try{actor=await deps.resolveActor();if(!actor||!id.safeParse(actor.userId).success||!actor.token)return reply({error:'unauthorized'},401);if(!await deps.ownsProject(actor,input.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
   let manifest:VisualInputManifest|null;try{manifest=parseManifest(input);if(!manifest&&input.plan.version!==1)throw Error('missing manifest');}catch{return reply({error:'invalid_visual_input'},400);}
   if((manifest&&!deps.visualEnabled)||(!manifest&&deps.visualRequired))return reply({error:'visual_unavailable'},503);
   let visualAuthority:VisualAuthority|undefined,visualCheck:VisualScope|undefined;
   if(manifest){
    if(!deps.prepareVisualAuthority||!deps.checkVisualDispatch)return reply({error:'visual_authorization_unavailable'},503);
    visualCheck={actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.planRequestId,purpose:'parallel',visualInput:manifest,consentHeader:request.headers.get('x-compor-reference-consent')};
    try{const authority=await deps.prepareVisualAuthority(visualCheck);if(!authority||authority.requestId!==visualCheck.requestId||authority.manifestDigest!==visualInputDigest(manifest)||(authority.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(authority.consentSecret)))return reply({error:'visual_authorization_unavailable'},403);visualAuthority=authority;}catch{return reply({error:'visual_authorization_unavailable'},503);}
   }
   const visualScope=manifest?{visualInput:manifest}:{};
   try{if(!await deps.verifyPlan({actor,apiKey:key,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.planRequestId,context:input.context,plan:input.plan,token:input.planBinding,...visualScope}))return reply({error:'invalid_plan'},403);}catch{return reply({error:'invalid_plan'},403);}
   let visual:ReturnType<typeof parseVisualInput>|null;try{visual=manifest?(input.plan.version===2?parseSelectedVisualInput(manifest,input.referenceImages,input.plan.referenceIds):parseVisualInput(manifest,input.referenceImages)):null;}catch{return reply({error:'invalid_visual_input'},400);}
   if(request.signal.aborted)return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},409);
   let intentSecret:string;try{intentSecret=deps.intentSecret({actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,context:input.context,purpose:'batch',...visualScope});}catch{return reply({error:'invalid_intent'},403);}
   let intent:z.infer<typeof intentStateSchema>;try{intent=intentStateSchema.parse(await deps.intentState({actor,projectId:input.projectId,intentId:input.intentId}));}catch{return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},503);}
   const proofs=input.imageIds.map(()=>randomBytes(32).toString('hex'));
   const children=input.plan.items.map((entry,index)=>({requestId:input.imageIds[index],prompt:entry.prompt,proof:proofs[index]}));
   let reservation:BatchReservation;
   try{reservation=reservationSchema.parse(await deps.store.reserveBatch(actor,{projectId:input.projectId,batchId:input.batchId,pieceId:input.conversationId==='references'?null:input.conversationId,intentId:input.intentId,intentSecret,planDigest:planDigest(input.plan,visual?.visualInput),imageIds:input.imageIds,promptDigests:input.plan.items.map(entry=>promptDigest(entry,input.batchId,visual?.visualInput,input.plan.version===2?input.plan.referenceIds:undefined)),rejectionDigests:proofs.map(proof=>hash(Buffer.from(proof,'hex'))),...(visualAuthority?{visualAuthority}:{})}));}catch{return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},503);}
   if(!reservation.isNew)return reply({status:reservation.state,batchId:input.batchId,retryAutomatically:false},409);
   if(reservation.state!=='running')return reply({status:'unknown',batchId:input.batchId,retryAutomatically:false},503);
   const authorizeReview=async()=>{await beforeDispatch(actor,input.projectId,input.intentId,intent,request.signal,visualCheck,visualAuthority);return true;};
   const results=await dispatchReservedExplorationBatch(children,{
    generate:async child=>{
     const entry=input.plan.items[input.imageIds.indexOf(child.requestId)];
     if(request.signal.aborted)throw Error('aborted before dispatch');
     await deps.store.plan(actor,input.projectId,child.requestId,{composition:entry.composition,contrast:entry.contrast});
     // For visual requests, this single SQL observation checks both revocable
     // authorities; the subsequent network dispatch is not atomic with SQL.
     await authorizeReview();
     try{return await deps.generate(actor,key,child.prompt,visual?.referenceImages??[],{signal:request.signal,authorizeReview});}catch(error){if(error instanceof ExplorationCredentialsRejected)throw new ExplorationBatchRejected();throw error;}
    },
    put:(child,bytes)=>deps.store.put(actor,input.projectId,child.requestId,bytes),
    finish:(child,state)=>deps.store.finish(actor,input.projectId,child.requestId,state,child.proof),
    reject:child=>deps.store.reject(actor,input.projectId,child.requestId,child.proof),
    hold:(child,reason)=>deps.store.hold(actor,input.projectId,child.requestId,child.proof,reason),
    ...(deps.store.fail?{fail:(child,reason,outcome)=>deps.store.fail?.(actor,input.projectId,child.requestId,child.proof,reason,outcome)??Promise.resolve()}:{}),
   });
   return reply({status:results.some(x=>x.status==='unknown')?'unknown':results.some(x=>isReplaceableExplorationOutcome(x.status))?'partial':'completed',batchId:input.batchId,images:results,retryAutomatically:false},200);
  },
  async replace(request:Request){
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
   if(deps.generationAvailable===false)return reply({error:'unavailable'},503);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
   const key=request.headers.get('x-compor-openai-key')??'';if(!/^sk-[^\s]{20,300}$/.test(key))return reply({error:'invalid_request'},400);
   let input:z.infer<typeof replacementSchema>;try{input=replacementSchema.parse(await readBody(request));}catch{return reply({error:'invalid_request'},400);}
   if(JSON.stringify(input).includes(key)||!deps.store.replaceRejected)return reply({error:'invalid_request'},400);
   let actor:Actor|null;try{actor=await deps.resolveActor();if(!actor||!id.safeParse(actor.userId).success||!actor.token)return reply({error:'unauthorized'},401);if(!await deps.ownsProject(actor,input.projectId))return reply({error:'not_found'},404);}catch{return reply({error:'unavailable'},503);}
   let manifest:VisualInputManifest|null;try{manifest=parseManifest(input);if(!manifest&&input.plan.version!==1)throw Error('missing manifest');}catch{return reply({error:'invalid_visual_input'},400);}
   if((manifest&&!deps.visualEnabled)||(!manifest&&deps.visualRequired))return reply({error:'visual_unavailable'},503);
   let visualAuthority:VisualAuthority|undefined,visualCheck:VisualScope|undefined;
   if(manifest){
    if(!deps.prepareVisualAuthority||!deps.checkVisualDispatch)return reply({error:'visual_authorization_unavailable'},503);
    visualCheck={actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,purpose:'replacement',visualInput:manifest,consentHeader:request.headers.get('x-compor-reference-consent')};
    try{const authority=await deps.prepareVisualAuthority(visualCheck);if(!authority||authority.requestId!==visualCheck.requestId||authority.manifestDigest!==visualInputDigest(manifest)||(authority.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(authority.consentSecret)))return reply({error:'visual_authorization_unavailable'},403);visualAuthority=authority;}catch{return reply({error:'visual_authorization_unavailable'},503);}
   }
   const visualScope=manifest?{visualInput:manifest}:{};
   try{if(!await deps.verifyPlan({actor,apiKey:key,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.planRequestId,context:input.context,plan:input.plan,token:input.planBinding,...visualScope}))return reply({error:'invalid_plan'},403);}catch{return reply({error:'invalid_plan'},403);}
   let visual:ReturnType<typeof parseVisualInput>|null;try{visual=manifest?(input.plan.version===2?parseSelectedVisualInput(manifest,input.referenceImages,input.plan.referenceIds):parseVisualInput(manifest,input.referenceImages)):null;}catch{return reply({error:'invalid_visual_input'},400);}
   if(request.signal.aborted)return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},409);
   let intentSecret:string;try{intentSecret=deps.intentSecret({actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,context:input.context,purpose:'replacement',position:input.position,previousId:input.previousId,...visualScope});}catch{return reply({error:'invalid_intent'},403);}
   let intent:z.infer<typeof intentStateSchema>;try{intent=intentStateSchema.parse(await deps.intentState({actor,projectId:input.projectId,intentId:input.intentId}));}catch{return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},503);}
   const entry=input.plan.items[input.position-1],proof=randomBytes(32).toString('hex');
   let reservation:BatchReservation;
   try{reservation=reservationSchema.parse(await deps.store.replaceRejected(actor,{projectId:input.projectId,batchId:input.batchId,position:input.position,previousId:input.previousId,requestId:input.requestId,intentId:input.intentId,intentSecret,promptDigest:promptDigest(entry,input.batchId,visual?.visualInput,input.plan.version===2?input.plan.referenceIds:undefined),rejectionDigest:hash(Buffer.from(proof,'hex')),...(visualAuthority?{visualAuthority}:{})}));}catch{return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},503);}
   if(!reservation.isNew)return reply({status:reservation.state,batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},409);
   if(reservation.state!=='running')return reply({status:'unknown',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},503);
   const authorizeReview=async()=>{await beforeDispatch(actor,input.projectId,input.intentId,intent,request.signal,visualCheck,visualAuthority);return true;};
   try{
    if(request.signal.aborted)throw Error('aborted before dispatch');
    await deps.store.plan(actor,input.projectId,input.requestId,{composition:entry.composition,contrast:entry.contrast});
    await authorizeReview();
    let bytes:Uint8Array;
    try{bytes=await deps.generate(actor,key,entry.prompt,visual?.referenceImages??[],{signal:request.signal,authorizeReview});}
    catch(error){
     if(error instanceof ExplorationQualityHeld){await deps.store.hold(actor,input.projectId,input.requestId,proof,error.reason);return reply({status:'quality_held',batchId:input.batchId,requestId:input.requestId,qualityReason:error.reason,retryAutomatically:false},200);}
     if(error instanceof ExplorationCredentialsRejected){await deps.store.reject(actor,input.projectId,input.requestId,proof);return reply({status:'rejected',batchId:input.batchId,requestId:input.requestId,retryAutomatically:false},200);}
     if(error instanceof ExplorationProviderClosed && deps.store.fail){await deps.store.fail(actor,input.projectId,input.requestId,proof,error.closureReason,error.providerOutcome);return reply({status:'failed',batchId:input.batchId,requestId:input.requestId,closureReason:error.closureReason,providerOutcome:error.providerOutcome,retryAutomatically:false},200);}
     throw error;
    }
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
