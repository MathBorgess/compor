import { z } from 'zod';
import type { Actor } from './agent-auth.ts';
import type { SessionBindings } from '@compor/agents-api/session-binding';
import type { ImageReservationStore } from '@compor/agents-api/image-tool-reservation';

const input=z.strictObject({projectId:z.string().uuid(),pieceId:z.string().uuid(),version:z.number().int().min(1).max(2147483647),attemptId:z.string().uuid(),actionBinding:z.string().min(1).max(2048)});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
type Deps={appOrigin:string;resolveActor:()=>Promise<Actor|null>;ownsVersion:(input:{actor:Actor;projectId:string;pieceId:string;version:number})=>Promise<boolean>;bindings:Pick<SessionBindings,'verifyAction'>;fence:ImageReservationStore['fenceUnsubmitted']};
async function read(request:Request) {
  if(!request.body)throw Error('missing');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}
  finally {await reader.cancel().catch(()=>{});}
}
export function createAgentImageReconcile(deps:Deps) {
  return async(request:Request)=>{
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
    if(request.headers.get('origin')!==deps.appOrigin)return reply({error:'invalid_origin'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
    let value:z.infer<typeof input>;
    try{value=input.parse(await read(request));}catch{return reply({error:'invalid_request'},400);}
    try {
      const actor=await deps.resolveActor();
      if(!actor||!await deps.ownsVersion({actor,projectId:value.projectId,pieceId:value.pieceId,version:value.version}))return reply({error:'not_found'},404);
      const claim=deps.bindings.verifyAction({token:value.actionBinding,userId:actor.userId,projectId:value.projectId,attemptId:value.attemptId});
      if(!claim)return reply({error:'unverified'},403);
      const result=await deps.fence({actor,projectId:value.projectId,pieceId:value.pieceId,version:value.version,attemptId:value.attemptId,sessionId:claim.sessionId,turnId:claim.turnId,callId:claim.callId});
      return reply(result,200);
    } catch{return reply({status:'unverified'},503);}
  };
}
