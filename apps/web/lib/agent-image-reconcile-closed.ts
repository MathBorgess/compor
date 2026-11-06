import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {ImageReservationStore} from '@compor/agents-api/image-tool-reservation';

const input=z.strictObject({projectId:z.string().uuid(),requestId:z.string().uuid()});
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function createClosedImageReconciliation(deps:{appOrigin:string;resolveActor:()=>Promise<Actor|null>;confirm:ImageReservationStore['confirmClosedAttempt']}) {
 return async(request:Request)=>{
  if(request.method!=='POST')return reply({status:'unverified'},405);
  if(request.headers.get('origin')!==deps.appOrigin)return reply({status:'unverified'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({status:'unverified'},400);
  let value:z.infer<typeof input>;
  try {
   if(!request.body)throw Error('missing');
   const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const {value:chunk,done}=await reader.read();if(done)break;size+=chunk.length;if(size>2048)throw Error('large');chunks.push(chunk);}value=input.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}
   finally {await reader.cancel().catch(()=>{});}
  } catch {return reply({status:'unverified'},400);}
  try {
   const actor=await deps.resolveActor();if(!actor)return reply({status:'unverified'},401);
   return reply(await deps.confirm({actor,...value}),200);
  } catch{return reply({status:'unverified'},503);}
 };
}
