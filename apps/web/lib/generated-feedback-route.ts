import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import { generatedSignalInputSchema,generatedSignalsSchema,type GeneratedSignal } from './generated-feedback-contract.ts';

type Input=z.infer<typeof generatedSignalInputSchema>;
type Store={list:(projectId?:string)=>Promise<GeneratedSignal[]>;insert:(input:Input)=>Promise<unknown>};
type Deps={appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;store:(actor:Actor)=>Store};
const query=z.strictObject({projectId:z.uuid(),scope:z.enum(['project','account'])});
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function read(request:Request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('invalid');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('large');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;
}
export function createGeneratedFeedbackRoute(deps:Deps) {
  return async(request:Request)=>{
    if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'forbidden'},403);
    let raw:unknown;try{raw=await read(request);}catch{return reply({error:'invalid_request'},400);}
    const selection=query.safeParse(raw),signal=generatedSignalInputSchema.safeParse(raw);
    if(!selection.success&&!signal.success)return reply({error:'invalid_request'},400);
    try {
      const projectId=selection.success?selection.data.projectId:signal.success?signal.data.projectId:'';
      const actor=await deps.resolveActor();if(!actor||!await deps.ownsProject(actor,projectId))return reply({error:'not_found'},404);
      const store=deps.store(actor);
      if(selection.success)return reply(generatedSignalsSchema.parse({signals:await store.list(selection.data.scope==='project'?projectId:undefined)}));
      if(!signal.success)return reply({error:'invalid_request'},400);
      if(signal.data.supersedes){const previous=(await store.list(projectId)).find(value=>value.id===signal.data.supersedes);if(!previous||previous.imageId!==signal.data.imageId||(previous.action==='comment')!==(signal.data.action==='comment'))return reply({error:'invalid_correction'},409);}
      await store.insert(signal.data);return reply({status:'recorded',id:signal.data.id},201);
    } catch{return reply({error:'unavailable'},503);}
  };
}
