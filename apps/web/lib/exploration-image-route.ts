import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import { explorationPlanSchema,type ExplorationPlan } from './generated-feedback-contract.ts';

const id = z.string().uuid();
const batchSchema=z.strictObject({id,position:z.number().int().min(1).max(3)});
export type ExplorationBatch=z.infer<typeof batchSchema>;
export const explorationImageRecordSchema=z.strictObject({id,project_id:id,state:z.enum(['running','unknown','completed']),created_at:z.string(),ordinal:z.number().int().positive(),batch_id:id.nullable(),batch_position:z.number().int().min(1).max(3).nullable()});
export type ExplorationImageRecord=z.infer<typeof explorationImageRecordSchema>;
const input = z.object({projectId:id,requestId:id,prompt:z.string().trim().min(1).max(8000),plan:explorationPlanSchema.optional(),batch:batchSchema.optional()}).strict();
const reply = (body:unknown,status:number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
type Reservation = {state:'running'|'unknown'|'completed'|'busy'|'blocked'|'awaiting_feedback';isNew:boolean};
export type ExplorationStore = {
  reserve: (actor:Actor, projectId:string, requestId:string, digest:string, batch?:ExplorationBatch)=>Promise<Reservation>;
  finish: (actor:Actor, projectId:string, requestId:string, state:'unknown'|'completed')=>Promise<void>;
  put: (actor:Actor, projectId:string, requestId:string, bytes:Uint8Array)=>Promise<void>;
  list: (actor:Actor, projectId:string, beforeOrdinal?:number)=>Promise<ExplorationImageRecord[]>;
  read: (actor:Actor, projectId:string, requestId:string)=>Promise<Response>;
  resume?: (actor:Actor, projectId:string)=>Promise<'resumed'|'not_paused'|'blocked'>;
  status?: (actor:Actor, projectId:string)=>Promise<'active'|'awaiting_feedback'>;
  plan?: (actor:Actor,projectId:string,requestId:string,plan:ExplorationPlan)=>Promise<void>;
};
type Dependencies = {
  appOrigin:string;
  resolveActor:()=>Promise<Actor|null>;
  ownsProject:(actor:Actor, projectId:string)=>Promise<boolean>;
  store:ExplorationStore;
  generate:(actor:Actor, key:string, prompt:string)=>Promise<Uint8Array>;
};

async function parseBody(request:Request):Promise<unknown> {
  if (!request.body) throw Error('missing');
  const reader=request.body.getReader(), chunks:Uint8Array[]=[]; let length=0;
  try {
    for (;;) { const {value,done}=await reader.read(); if(done)break; length+=value.byteLength; if(length>16384)throw Error('large'); chunks.push(value); }
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
      if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
      const key=request.headers.get('x-compor-openai-key')??'';
      if(!/^sk-[^\s]{20,300}$/.test(key))return reply({error:'invalid_request'},400);
      let data:z.infer<typeof input>;
      try { data=input.parse(await parseBody(request)); if(data.prompt.includes(key))throw Error('key in prompt'); }
      catch { return reply({error:'invalid_request'},400); }
      let actor:Actor|null;
      try { actor=await actorFor(data.projectId); } catch { return reply({error:'unavailable'},503); }
      if(!actor)return reply({error:'not_found'},404);
      const digest=createHash('sha256').update(data.prompt).update(data.plan?JSON.stringify(data.plan):'').update(data.batch?JSON.stringify(data.batch):'').digest('hex');
      let reserved:Reservation;
      try { reserved=await deps.store.reserve(actor,data.projectId,data.requestId,digest,data.batch); }
      catch { return reply({status:'unknown',requestId:data.requestId,retryAutomatically:false},503); }
      if(!reserved.isNew) return reserved.state==='completed'
        ? reply({status:'completed',requestId:data.requestId,imageId:data.requestId},200)
        : reply({status:reserved.state,requestId:data.requestId,retryAutomatically:false},409);
      try {
        if(data.plan) { if(!deps.store.plan)throw Error('plan unavailable'); await deps.store.plan(actor,data.projectId,data.requestId,data.plan); }
        const bytes=await deps.generate(actor,key,data.prompt);
        await deps.store.put(actor,data.projectId,data.requestId,bytes);
        await deps.store.finish(actor,data.projectId,data.requestId,'completed');
        return reply({status:'completed',requestId:data.requestId,imageId:data.requestId},200);
      } catch {
        await deps.store.finish(actor,data.projectId,data.requestId,'unknown').catch(()=>{});
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
        if(rows.some((row,index)=>row.project_id!==project.data || (rawCursor!==null && row.ordinal>=Number(rawCursor)) || (index>0 && rows[index-1].ordinal<=row.ordinal)))throw Error('invalid page');
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
