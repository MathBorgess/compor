import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {createImageToolApproval,createImageToolExecution,ImageVisualAuthority} from '@compor/agents-api/image-tool-execution';
import type {VisualInputManifest} from '@compor/agents-api/visual-input-contract';
import {visualInputDigest} from '@compor/agents-api/visual-input';
import type {createImageToolResultSender} from '@compor/agents-api/image-tool-result';
import {isImageQualityReason} from '@compor/agents-api/image-tool-reservation';
const inputSchema=z.object({projectId:z.string(),pieceId:z.string(),attemptId:z.string(),requestId:z.string().optional(),version:z.number(),explicitApproval:z.literal(true),actionBinding:z.string(),apiKey:z.string().optional(),artworkInput:z.unknown().optional()});
import { parseArtworkInput, MAX_ARTWORK_REQUEST_BYTES } from '@compor/agents-api/artwork-input';
const uuid = (value:unknown):value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body:unknown,status:number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function readJson(request:Request):Promise<unknown> {
  if (!request.body) throw Error('missing');
  const reader=request.body.getReader(),chunks=[];let n=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX_ARTWORK_REQUEST_BYTES)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  finally {try {Promise.resolve(reader.cancel()).catch(()=>{});} catch {} try {reader.releaseLock();} catch {}}
}
export function createAgentImageRoute({appOrigin,resolveActor,approve,execute,send,apiKey:resolvedKey,visualEnabled=false,visualRequired=visualEnabled,prepareVisualAuthority}: {appOrigin?:string;resolveActor?:()=>Promise<Actor|null>;approve?:ReturnType<typeof createImageToolApproval>;execute?:ReturnType<typeof createImageToolExecution>;send?:ReturnType<typeof createImageToolResultSender>;apiKey?:string;visualEnabled?:boolean;visualRequired?:boolean;prepareVisualAuthority?:(input:{actor:Actor;projectId:string;pieceId:string;requestId:string;visualInput:VisualInputManifest;consentHeader:string|null})=>Promise<ImageVisualAuthority|null>}={}) {
 return async (request:Request) => {
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!appOrigin || typeof resolveActor!=='function'||typeof approve!=='function'||typeof execute!=='function'||typeof send!=='function')return reply({error:'unavailable'},503);
  if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
  let data,actor,artworkInput;
  try {data=inputSchema.parse(await readJson(request));artworkInput=parseArtworkInput(data.artworkInput);} catch{return reply({error:'invalid_request'},400);}
  const apiKey=resolvedKey??data.apiKey??'';
  if(![data?.projectId,data?.pieceId,data?.attemptId].every(uuid) || !Number.isSafeInteger(data.version) || data.version<1 || data.version>2147483647 || data.explicitApproval!==true || typeof data.actionBinding!=='string' || data.actionBinding.length>2048 || !/^sk-[^\s]{20,300}$/.test(apiKey)||(resolvedKey!==undefined&&data.apiKey!==undefined))return reply({error:'invalid_request'},400);
  if((artworkInput.visualInput&&!visualEnabled)||(visualRequired&&!artworkInput.visualInput))return reply({error:'unavailable'},503);
  try {actor=await resolveActor();} catch{return reply({error:'unavailable'},503);}
  if(!actor||!uuid(actor.userId) || typeof actor?.token!=='string' || !/^[^\s]{1,8192}$/.test(actor.token))return reply({error:'unauthorized'},401);
  let visualAuthority:ImageVisualAuthority|undefined;
  if(artworkInput.visualInput){
   if(!uuid(data.requestId)||typeof prepareVisualAuthority!=='function')return reply({error:'unavailable'},503);
   try{const authority=await prepareVisualAuthority({actor,projectId:data.projectId,pieceId:data.pieceId,requestId:data.requestId,visualInput:artworkInput.visualInput,consentHeader:request.headers.get('x-compor-reference-consent')});if(!authority||authority.requestId!==data.requestId||authority.manifestDigest!==visualInputDigest(artworkInput.visualInput)||(authority.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(authority.consentSecret)))return reply({error:'forbidden'},403);visualAuthority=authority;}catch{return reply({error:'unavailable'},503);}
  }else if(data.requestId!==undefined)return reply({error:'invalid_request'},400);
  const context={actor,projectId:data.projectId,pieceId:data.pieceId,version:data.version,attemptId:data.attemptId};
  let proof;
  try {proof=await approve({...context,actionBinding:data.actionBinding,artworkInput,explicitApproval:true});} catch{return reply({error:'unavailable'},503);}
  if(!proof)return reply({error:'forbidden'},403);
  let storedAssetId, usageRecorded;
  try {
   const execution=await execute({...context,actionBinding:proof,apiKey,artworkInput,explicitApproval:true,signal:request.signal,...(visualAuthority?{visualAuthority}:{})});
   if (execution?.status === 'invalid_prompt') return reply({error:'invalid_request'},400);
   if (execution?.status === 'busy' || execution?.status === 'blocked') return reply({status:execution.status},200);
   if('usageRecorded' in execution && typeof execution.usageRecorded==='boolean')usageRecorded=execution.usageRecorded;
   if(execution.status==='quality_held'&&isImageQualityReason(execution.qualityReason)&&execution.retryAutomatically===false)
     return reply({status:execution.status,qualityReason:execution.qualityReason,retryAutomatically:false,...(usageRecorded===undefined?{}:{usageRecorded})},200);
   if(execution?.status==='unknown' && uuid(execution.assetId))return reply({error:'result_unknown',retryAutomatically:false,assetId:execution.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},502);
   if(execution?.status!=='completed' || !uuid(execution.executionId))return reply({error:'result_unknown',retryAutomatically:false},502);
   const output=z.object({assetId:z.string()}).parse(JSON.parse(execution.toolResult.output));
   if(!uuid(output?.assetId))return reply({error:'result_unknown',retryAutomatically:false},502);
   storedAssetId=output.assetId;
   const result=await send({...context,actionBinding:proof,executionId:execution.executionId,apiKey});
   if(result?.status!=='accepted')return reply({error:'result_unknown',retryAutomatically:false,assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},502);
   return reply({status:'accepted',assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},202);
  } catch{return reply({error:'result_unknown',retryAutomatically:false,...(storedAssetId ? {assetId:storedAssetId} : {}),...(usageRecorded===undefined?{}:{usageRecorded})},502);}
 };
}
