import { z } from 'zod';
import { POST_FORMATS } from '@compor/agents-api/creative-skills';
import type { Actor } from './agent-auth.ts';
import { referenceHistoryResponseSchema, referenceSignalInputSchema, referenceSignalSchema, type ReferenceSignal, type ReferenceHistoryEntry } from './reference-exploration-contract.ts';
import { searchReferences } from './reference-exploration.ts';

const searchInput=z.strictObject({projectId:z.uuid(),query:z.string().trim().min(1).max(1000),consentExternalSearch:z.literal(true),discoveryOnly:z.boolean().optional(),postFormat:z.enum(POST_FORMATS).optional()});
const signalInput=referenceSignalInputSchema;
type Store={list:(projectId?:string,pieceId?:string)=>Promise<ReferenceSignal[]>;insert:(signal:z.infer<typeof signalInput>)=>Promise<ReferenceSignal>;history?:(projectId:string)=>Promise<ReferenceHistoryEntry[]>};
type Dependencies={appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;store:(actor:Actor)=>Store;search?:typeof searchReferences};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function json(request:Request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('invalid');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try { for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('too large');chunks.push(value);} }
  finally {await reader.cancel().catch(()=>{});}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;
}
async function authorize(request:Request,deps:Dependencies,projectId:string) {
  if(request.headers.get('origin')!==deps.appOrigin)return null;
  const actor=await deps.resolveActor();
  if(!actor?.userId||!actor.token||!await deps.ownsProject(actor,projectId))return null;
  return actor;
}
export function createReferenceSearchRoute(deps:Dependencies) {
  return async(request:Request)=>{
    let input:z.infer<typeof searchInput>;try{input=searchInput.parse(await json(request));}catch{return reply({error:'invalid_request'},400);}
    try {
      const actor=await authorize(request,deps,input.projectId);if(!actor)return reply({error:'not_found'},404);
      const store=deps.store(actor);
      const readHistory=async()=>{
        try{return store.history?await store.history(input.projectId):[];}
        catch{return [];}
      };
      const [signals,history]=await Promise.all([store.list(input.projectId),readHistory()]);
      const result=await (deps.search??searchReferences)({projectId:input.projectId,query:input.query,signals,history,discoveryOnly:input.discoveryOnly,...(input.postFormat?{postFormat:input.postFormat}:{})});
      return reply(result);
    } catch {return reply({status:'unavailable',references:[]},503);}
  };
}
export function createReferenceHistoryRoute(deps:Dependencies) {
  return async(request:Request)=>{
    let input:{projectId:string};try{input=z.strictObject({projectId:z.uuid()}).parse(await json(request));}catch{return reply({error:'invalid_request'},400);}
    try {
      const actor=await authorize(request,deps,input.projectId);if(!actor)return reply({error:'not_found'},404);
      const store=deps.store(actor);if(!store.history)throw Error('history unavailable');
      return reply(referenceHistoryResponseSchema.parse({references:await store.history(input.projectId)}));
    }catch{return reply({error:'unavailable'},503);}
  };
}
export function createReferenceSignalsRoute(deps:Dependencies) {
  return async(request:Request)=>{
    let raw:unknown;try{raw=await json(request);}catch{return reply({error:'invalid_request'},400);}
    const read=z.strictObject({projectId:z.uuid(),pieceId:z.uuid().optional(),scope:z.enum(['project','account']).optional()}).safeParse(raw);
    const input=signalInput.safeParse(raw);
    if(!read.success&&!input.success)return reply({error:'invalid_request'},400);
    try {
      const projectId=read.success?read.data.projectId:input.success?input.data.projectId:'';
      const actor=await authorize(request,deps,projectId);if(!actor)return reply({error:'not_found'},404);
      const store=deps.store(actor);
      if(read.success)return reply({signals:(await store.list(read.data.scope==='account'?undefined:projectId,read.data.scope==='account'?undefined:read.data.pieceId)).map(value=>referenceSignalSchema.parse(value)).filter(value=>value.pieceId===(read.data.scope==='account'?undefined:read.data.pieceId))});
      if(!input.success)return reply({error:'invalid_request'},400);
      if(input.data.supersedes){const previous=(await store.list(projectId,input.data.pieceId)).find(item=>item.id===input.data.supersedes);if(!previous||previous.pieceId!==input.data.pieceId||previous.originUrl!==input.data.originUrl||previous.board!==input.data.board||(previous.action==='comment')!==(input.data.action==='comment'))return reply({error:'invalid_correction'},409);}
      return reply({signal:referenceSignalSchema.parse(await store.insert(input.data))},201);
    } catch {return reply({error:'unavailable'},503);}
  };
}
