import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import { boardSlugSchema } from './phoenix/catalog.ts';
import { pinOriginSchema, referenceSignalSchema, type ReferenceSignal } from './reference-exploration-contract.ts';
import { searchReferences } from './reference-exploration.ts';

const searchInput=z.strictObject({projectId:z.uuid(),query:z.string().trim().min(1).max(1000),consentExternalSearch:z.literal(true)});
const signalInput=z.strictObject({id:z.uuid(),projectId:z.uuid(),originUrl:pinOriginSchema,board:boardSlugSchema,action:z.enum(['selected','rejected','comment']),comment:z.string().trim().max(1000),supersedes:z.uuid().nullable()}).superRefine((value,ctx)=>{if(value.action==='comment'&&!value.comment)ctx.addIssue({code:'custom',message:'Comentário vazio'});});
type Store={list:(projectId?:string)=>Promise<ReferenceSignal[]>;insert:(signal:z.infer<typeof signalInput>)=>Promise<ReferenceSignal>};
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
      const signals=await deps.store(actor).list();
      const result=await (deps.search??searchReferences)({query:input.query,signals});
      return reply(result);
    } catch {return reply({status:'unavailable',references:[]},503);}
  };
}
export function createReferenceSignalsRoute(deps:Dependencies) {
  return async(request:Request)=>{
    let raw:unknown;try{raw=await json(request);}catch{return reply({error:'invalid_request'},400);}
    const read=z.strictObject({projectId:z.uuid(),scope:z.enum(['project','account']).optional()}).safeParse(raw);
    const input=signalInput.safeParse(raw);
    if(!read.success&&!input.success)return reply({error:'invalid_request'},400);
    try {
      const projectId=read.success?read.data.projectId:input.success?input.data.projectId:'';
      const actor=await authorize(request,deps,projectId);if(!actor)return reply({error:'not_found'},404);
      const store=deps.store(actor);
      if(read.success)return reply({signals:(await store.list(read.data.scope==='account'?undefined:projectId)).map(value=>referenceSignalSchema.parse(value))});
      if(!input.success)return reply({error:'invalid_request'},400);
      if(input.data.supersedes){const previous=(await store.list(projectId)).find(item=>item.id===input.data.supersedes);if(!previous||previous.originUrl!==input.data.originUrl||previous.board!==input.data.board||(previous.action==='comment')!==(input.data.action==='comment'))return reply({error:'invalid_correction'},409);}
      return reply({signal:referenceSignalSchema.parse(await store.insert(input.data))},201);
    } catch {return reply({error:'unavailable'},503);}
  };
}
