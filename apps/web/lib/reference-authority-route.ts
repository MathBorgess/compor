import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {parseVisualInputManifest,visualInputMatchesProject} from '@compor/agents-api/visual-input-contract';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import type {Actor} from './agent-auth.ts';
import type {ReferenceAuthorityStore} from './reference-authority-store.ts';
const id=z.string().uuid().transform(value=>value.toLowerCase()),revision=z.number().int().nonnegative().safe();
const originUrl=z.string().regex(/^https:\/\/www\.pinterest\.com\/pin\/[A-Za-z0-9_-]{1,160}\/$/).refine(value=>!/sk-/i.test(value));
const board=z.string().max(200).regex(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/).refine(value=>!/sk-/i.test(value));
const reference=z.discriminatedUnion('inputOrigin',[
 z.strictObject({id,inputOrigin:z.literal('local-upload'),source:z.null()}),
 z.strictObject({id,inputOrigin:z.literal('external'),source:z.strictObject({originUrl,board})}),
 z.strictObject({id,inputOrigin:z.literal('generated'),source:z.strictObject({projectId:id,imageId:id})}),
]);
const ids=z.array(id).max(20).refine(value=>new Set(value).size===value.length);
const state=z.strictObject({version:z.literal(1),references:z.array(reference).max(500),projectReferenceIds:ids,posts:z.array(z.strictObject({pieceId:id,referenceIds:ids,excludedReferenceIds:ids})).max(500)}).refine(value=>new Set(value.references.map(x=>x.id)).size===value.references.length&&new Set(value.posts.map(x=>x.pieceId)).size===value.posts.length);
const selection=z.discriminatedUnion('op',[z.strictObject({op:z.literal('read'),projectId:id}),z.strictObject({op:z.literal('receipt'),projectId:id,commandId:id}),z.strictObject({op:z.literal('fence'),projectId:id,commandId:id}),z.strictObject({op:z.literal('write'),projectId:id,commandId:id,expectedRevision:revision.refine(value=>value<Number.MAX_SAFE_INTEGER),state})]);
const consent=z.strictObject({op:z.enum(['grant','state','revoke']),consentId:id});
const snapshot=z.discriminatedUnion('op',[z.strictObject({op:z.literal('read'),projectId:id,requestId:id}),z.strictObject({op:z.literal('create'),projectId:id,conversationId:z.union([z.literal('references'),id]),requestId:id,batchId:id.nullable(),purpose:z.enum(['parallel','replacement','artwork']),selectionRevision:revision,visualInput:z.unknown(),consentId:id.optional()}).refine(value=>(value.purpose==='artwork')===(value.batchId===null))]);
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const statusCode=(status:string)=>status==='not_found'?404:status==='invalid'?400:status==='conflict'||status==='revoked'||status==='fenced'?409:status==='unauthorized'?403:status==='unavailable'?503:200;
/** A browser capability is never an OpenAI credential and never enters creative context. */
export function referenceConsentSecret(value:string|null):string|null{
 if(value===null)return null;if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('invalid capability');
 const bytes=Buffer.from(value,'base64url');if(bytes.length!==32||bytes.toString('base64url')!==value)throw Error('invalid capability');return bytes.toString('hex');
}
type Dependencies={appOrigin:string;enabled:boolean;resolveActor:()=>Promise<Actor|null>;ownsProject:(actor:Actor,projectId:string)=>Promise<boolean>;store:ReferenceAuthorityStore};
export function createReferenceAuthorityRoute(deps:Dependencies){
 async function read(request:Request){
  if(request.method!=='POST'||request.headers.get('origin')!==deps.appOrigin||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??'')||!request.body)throw Error('invalid request');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>512*1024)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}finally{await reader.cancel().catch(()=>{});}
 }
 return async(path:'selection'|'consent'|'snapshot',request:Request)=>{
  let raw:unknown;try{raw=await read(request);}catch{return reply({error:'invalid_request'},400);}
  const parsed=path==='selection'?selection.safeParse(raw):path==='consent'?consent.safeParse(raw):snapshot.safeParse(raw);
  if(!parsed.success)return reply({error:'invalid_request'},400);
  let actor:Actor|null;try{actor=await deps.resolveActor();}catch{return reply({status:'unavailable'},503);}
  if(!actor||!id.safeParse(actor.userId).success||!actor.token)return reply({error:'unauthorized'},401);
  const input=parsed.data;
  try{
   if('projectId'in input&&!await deps.ownsProject(actor,input.projectId))return reply({error:'not_found'},404);
   if(['write','grant','create'].includes(input.op)&&!deps.enabled)return reply({status:'unavailable'},503);
   if(path==='selection'){
    const data=selection.parse(input);
    if(data.op==='read'){const value=await deps.store.read(actor,data.projectId);return value?reply(value):reply({error:'not_found'},404);}
    if(data.op==='receipt'){const value=await deps.store.receipt(actor,data.projectId,data.commandId);if(value&&value.commandId!==data.commandId)throw Error('wrong receipt');return reply(value??{status:'absent'});}
    if(data.op==='fence'){const value=await deps.store.fence(actor,data.projectId,data.commandId);if('commandId'in value&&value.commandId!==data.commandId)throw Error('wrong fence');return reply(value,value.status==='fenced'||value.status==='applied'?200:statusCode(value.status));}
    const result=await deps.store.write(actor,data);if('commandId'in result&&result.commandId!==data.commandId)throw Error('wrong receipt');return reply(result,statusCode(result.status));
   }
   if(path==='consent'){
    const data=consent.parse(input);
    if(data.op==='state'){const result=await deps.store.consentState(actor,data.consentId);if(result.consentId!==data.consentId)throw Error('wrong consent');return reply(result);}
    const bytes=data.op==='grant'?randomBytes(32):null;
    const result=bytes?await deps.store.grant(actor,data.consentId,createHash('sha256').update(bytes).digest('hex')):await deps.store.revoke(actor,data.consentId);
    if(result.status!=='unavailable'&&result.consentId!==data.consentId)throw Error('wrong consent');
    if(data.op==='revoke'&&!['revoked','unavailable'].includes(result.status))throw Error('wrong consent state');
    return reply({...result,...(bytes&&result.status==='granted'?{capability:bytes.toString('base64url')}:{})},data.op==='revoke'&&result.status==='revoked'?200:statusCode(result.status));
   }
   const data=snapshot.parse(input);
   if(data.op==='read'){const value=await deps.store.readSnapshot(actor,data.projectId,data.requestId);if(value&&(value.requestId!==data.requestId||value.projectId!==data.projectId))throw Error('wrong snapshot');return reply(value?{status:'found',snapshot:value}:{status:'absent'});}
   let manifest,secret:string|null;try{manifest=parseVisualInputManifest(data.visualInput);secret=referenceConsentSecret(request.headers.get('x-compor-reference-consent'));if(!visualInputMatchesProject(manifest,data.projectId))throw Error('scope');}catch{return reply({error:'invalid_request'},400);}
   const result=await deps.store.snapshot(actor,{projectId:data.projectId,conversationId:data.conversationId,requestId:data.requestId,batchId:data.batchId,purpose:data.purpose,selectionRevision:data.selectionRevision,manifestJson:JSON.stringify(manifest),consentId:data.consentId??null,consentSecret:secret});
   if('snapshot'in result){const s=result.snapshot;if(s.requestId!==data.requestId||s.projectId!==data.projectId||s.conversationId!==data.conversationId||s.batchId!==data.batchId||s.purpose!==data.purpose||s.selectionRevision!==data.selectionRevision||s.consentId!==(data.consentId??null)||s.manifestDigest!==visualInputDigest(manifest))throw Error('wrong snapshot');}
   return reply(result,statusCode(result.status));
  }catch{return reply({status:'unknown',retryAutomatically:false},503);}
 };
}
