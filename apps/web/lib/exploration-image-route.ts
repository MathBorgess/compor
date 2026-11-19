import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import { explorationPlanSchema,type ExplorationPlan } from './generated-feedback-contract.ts';
import { ExplorationQualityHeld, explorationImageOutcomes, explorationQualityReasons, type ExplorationImageOutcome, type ExplorationQualityReason, type ExplorationReviewOptions } from './exploration-image-outcome.ts';

const id = z.string().uuid();
const batchSchema=z.strictObject({id,position:z.number().int().min(1).max(3)});
export type ExplorationBatch=z.infer<typeof batchSchema>;
export const explorationImageRecordSchema=z.strictObject({id,project_id:id,state:z.enum(explorationImageOutcomes),created_at:z.string(),ordinal:z.number().int().positive(),batch_id:id.nullable(),batch_position:z.number().int().min(1).max(3).nullable(),quality_reason:z.enum(explorationQualityReasons).nullable().optional()});
export type ExplorationImageRecord=z.infer<typeof explorationImageRecordSchema>;
const input = z.object({projectId:id,requestId:id,prompt:z.string().trim().min(1).max(8000),plan:z.optional(explorationPlanSchema),batch:batchSchema.optional()}).strict();
const reply = (body:unknown,status:number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
type Reservation = {state:ExplorationImageOutcome|'busy'|'blocked'|'awaiting_feedback';isNew:boolean};
// Only the image provider's explicit credential rejection may create this
// error. The handler must never infer it from a generic HTTP status.
export class ExplorationCredentialsRejected extends Error {}
export type ExplorationStore = {
  reserve: (actor:Actor, projectId:string, requestId:string, digest:string, rejectionDigest:string, batch?:ExplorationBatch)=>Promise<Reservation>;
  finish: (actor:Actor, projectId:string, requestId:string, state:'unknown'|'completed', secret:string)=>Promise<void>;
  reject: (actor:Actor, projectId:string, requestId:string, secret:string)=>Promise<void>;
  hold: (actor:Actor, projectId:string, requestId:string, secret:string, reason:ExplorationQualityReason)=>Promise<void>;
  put: (actor:Actor, projectId:string, requestId:string, bytes:Uint8Array)=>Promise<void>;
  list: (actor:Actor, projectId:string, beforeOrdinal?:number)=>Promise<ExplorationImageRecord[]>;
  read: (actor:Actor, projectId:string, requestId:string)=>Promise<Response>;
  resume?: (actor:Actor, projectId:string)=>Promise<'resumed'|'not_paused'|'blocked'>;
  status?: (actor:Actor, projectId:string)=>Promise<'active'|'awaiting_feedback'>;
  plan?: (actor:Actor,projectId:string,requestId:string,plan:ExplorationPlan)=>Promise<void>;
};
type Dependencies = {
  appOrigin:string;
  generationAvailable?:boolean;
  resolveActor:()=>Promise<Actor|null>;
  ownsProject:(actor:Actor, projectId:string)=>Promise<boolean>;
  store:ExplorationStore;
  generate:(actor:Actor, key:string, prompt:string, review:ExplorationReviewOptions)=>Promise<Uint8Array>;
};

const GENERATION_BODY_LIMIT=65536;
class BodyTooLarge extends Error {}
async function parseBody(request:Request,limit=16384):Promise<unknown> {
  if (!request.body) throw Error('missing');
  const reader=request.body.getReader(), chunks:Uint8Array[]=[]; let length=0;
  try {
    for (;;) { const {value,done}=await reader.read(); if(done)break; length+=value.byteLength; if(length>limit)throw new BodyTooLarge(); chunks.push(value); }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } finally { await reader.cancel().catch(()=>{}); }
}

export function createExplorationImageRoute(deps:Dependencies) {
  async function actorFor(projectId:string) {
    const actor=await deps.resolveActor();
    if(!actor)return null;
    return await deps.ownsProject(actor,projectId) ? actor : null;
  }
  return {
    async post(request:Request) {
      // This correlation is used only before attempting a reservation. A
      // timeout or any failure once reserve is called remains unknown.
      const correlation=id.safeParse(request.headers.get('x-compor-exploration-request-id'));
      const notStarted=(error:string,status:number)=>correlation.success
        ? reply({status:'not_started',requestId:correlation.data,retryAutomatically:false},status)
        : reply({error},status);
      if(request.headers.get('origin')!==deps.appOrigin)return notStarted('invalid_origin',403);
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return notStarted('invalid_request',400);
      if(deps.generationAvailable===false || request.signal.aborted)return notStarted('unavailable',503);
      const key=request.headers.get('x-compor-openai-key')??'';
      if(!/^sk-[^\s]{20,300}$/.test(key))return notStarted('invalid_request',400);
      let data:z.infer<typeof input>;
      try {
        data=input.parse(await parseBody(request,GENERATION_BODY_LIMIT));
        if((correlation.success && correlation.data!==data.requestId) || data.prompt.includes(key) || !data.prompt.isWellFormed() || (data.plan && (!data.plan.composition.isWellFormed() || !data.plan.contrast.isWellFormed())))throw Error('invalid request');
      }
      catch(error) { return notStarted('invalid_request',error instanceof BodyTooLarge?413:400); }
      let actor:Actor|null;
      try { actor=await actorFor(data.projectId); } catch { return notStarted('unavailable',503); }
      if(!actor)return notStarted('not_found',404);
      const digest=createHash('sha256').update(data.prompt).update(data.plan?JSON.stringify(data.plan):'').update(data.batch?JSON.stringify(data.batch):'').digest('hex');
      const rejectionSecret=randomBytes(32);
      const rejectionDigest=createHash('sha256').update(rejectionSecret).digest('hex');
      let reserved:Reservation;
      try { reserved=await deps.store.reserve(actor,data.projectId,data.requestId,digest,rejectionDigest,data.batch); }
      catch { return reply({status:'unknown',requestId:data.requestId,retryAutomatically:false},503); }
      if(!reserved.isNew) return reserved.state==='completed'
        ? reply({status:'completed',requestId:data.requestId,imageId:data.requestId},200)
        : reply({status:reserved.state,requestId:data.requestId,retryAutomatically:false},409);
      const authorizeReview=async()=>!request.signal.aborted&&await deps.ownsProject(actor,data.projectId)&&!request.signal.aborted;
      try {
        if(data.plan) { if(!deps.store.plan)throw Error('plan unavailable'); await deps.store.plan(actor,data.projectId,data.requestId,data.plan); }
        let bytes:Uint8Array;
        try { bytes=await deps.generate(actor,key,data.prompt,{signal:request.signal,authorizeReview}); }
        catch(error) {
          if(error instanceof ExplorationQualityHeld) {
            await deps.store.hold(actor,data.projectId,data.requestId,rejectionSecret.toString('hex'),error.reason);
            return reply({status:'quality_held',requestId:data.requestId,qualityReason:error.reason,retryAutomatically:false},200);
          }
          if(error instanceof ExplorationCredentialsRejected) {
            // A missing or ambiguous persistence response stays unknown; it
            // must not authorize a subsequent paid attempt automatically.
            await deps.store.reject(actor,data.projectId,data.requestId,rejectionSecret.toString('hex'));
            return reply({status:'rejected',requestId:data.requestId,retryAutomatically:false},401);
          }
          throw error;
        }
        await deps.store.put(actor,data.projectId,data.requestId,bytes);
        await deps.store.finish(actor,data.projectId,data.requestId,'completed',rejectionSecret.toString('hex'));
        return reply({status:'completed',requestId:data.requestId,imageId:data.requestId},200);
      } catch {
        await deps.store.finish(actor,data.projectId,data.requestId,'unknown',rejectionSecret.toString('hex')).catch(()=>{});
        return reply({status:'unknown',requestId:data.requestId,retryAutomatically:false},502);
      }
    },
    async get(request:Request) {
      const params=new URL(request.url).searchParams, project=id.safeParse(params.get('projectId'));
      const rawCursor=params.get('beforeOrdinal');
      if(!project.success || params.getAll('beforeOrdinal').length>1 || (rawCursor!==null && (!/^[1-9][0-9]{0,9}$/.test(rawCursor)||Number(rawCursor)>2147483647)))return reply({error:'invalid_request'},400);
      try {
        const actor=await actorFor(project.data); if(!actor)return reply({error:'not_found'},404);
        const rows=z.array(explorationImageRecordSchema).max(101).parse(await deps.store.list(actor,project.data,rawCursor===null?undefined:Number(rawCursor)));
        if(rows.some((row,index)=>row.project_id!==project.data || (row.state==='quality_held')!==Boolean(row.quality_reason) || (rawCursor!==null && row.ordinal>=Number(rawCursor)) || (index>0 && rows[index-1].ordinal<=row.ordinal)))throw Error('invalid page');
        const images=rows.slice(0,100);
        return reply({images,nextBeforeOrdinal:rows.length>100?images[images.length-1].ordinal:null},200);
      }
      catch { return reply({error:'unavailable'},503); }
    },
    async resume(request:Request) {
      if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
      let projectId:string;
      try { projectId=z.strictObject({projectId:id}).parse(await parseBody(request)).projectId; }
      catch { return reply({error:'invalid_request'},400); }
      try {
        const actor=await actorFor(projectId);if(!actor)return reply({error:'not_found'},404);
        if(!deps.store.resume)throw Error('unavailable');
        return reply({status:await deps.store.resume(actor,projectId)},200);
      } catch {return reply({error:'unavailable'},503);}
    },
    async status(request:Request) {
      if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
      let projectId:string;
      try { projectId=z.strictObject({projectId:id}).parse(await parseBody(request)).projectId; }
      catch { return reply({error:'invalid_request'},400); }
      try {
        const actor=await actorFor(projectId);if(!actor)return reply({error:'not_found'},404);
        if(!deps.store.status)throw Error('unavailable');
        return reply({status:await deps.store.status(actor,projectId)},200);
      } catch {return reply({error:'unavailable'},503);}
    },
    async image(request:Request) {
      const params=new URL(request.url).searchParams, project=id.safeParse(params.get('projectId')), imageId=id.safeParse(params.get('imageId'));
      if(!project.success || !imageId.success)return reply({error:'invalid_request'},400);
      try { const actor=await actorFor(project.data); if(!actor)return reply({error:'not_found'},404); return await deps.store.read(actor,project.data,imageId.data); }
      catch { return reply({error:'unavailable'},503); }
    },
  };
}
