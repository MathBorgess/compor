import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {ImageReservationStore} from '@compor/agents-api/image-tool-reservation';

const input=z.strictObject({projectId:z.string().uuid(),requestId:z.string().uuid()});
const candidate=z.strictObject({status:z.literal('candidate'),requestId:z.string().uuid(),attemptId:z.string().uuid(),pieceId:z.string().uuid(),version:z.number().int().positive().max(2147483647),executionId:z.string().uuid(),assetId:z.string().uuid(),proof:z.string().max(2048)});
type Candidate=z.infer<typeof candidate>;
type VerifyReceipt=(value:Candidate&{userId:string;projectId:string})=>{contentSha256:string}|null;
const reply=(value:unknown,status:number)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export function createClosedImageReconciliation(deps:{appOrigin:string;resolveActor:()=>Promise<Actor|null>;confirm:ImageReservationStore['confirmClosedAttempt'];candidate?:(input:{actor:Actor;projectId:string;requestId:string})=>Promise<unknown>;verify?:VerifyReceipt}) {
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
   const noImage=await deps.confirm({actor,...value});
   if(noImage.status==='confirmed')return reply(noImage,200);
   if(!deps.candidate||!deps.verify)return reply({status:'unverified'},200);
   const parsed=candidate.safeParse(await deps.candidate({actor,...value}));
   if(!parsed.success || parsed.data.requestId!==value.requestId)return reply({status:'unverified'},200);
   const claim=deps.verify({...parsed.data,userId:actor.userId,projectId:value.projectId});
   if(!claim||!/^[0-9a-f]{64}$/.test(claim.contentSha256))return reply({status:'unverified'},200);
   const {requestId,pieceId,version,assetId}=parsed.data;
   return reply({status:'image_completed',requestId,pieceId,version,assetId,contentSha256:claim.contentSha256},200);
  } catch{return reply({status:'unverified'},503);}
 };
}
