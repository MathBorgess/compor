import {z} from 'zod';
import type {Actor} from './agent-auth.ts';
import type {createImageToolApproval,createImageToolExecution} from '@compor/agents-api/image-tool-execution';
import type {createImageToolResultSender} from '@compor/agents-api/image-tool-result';
const inputSchema=z.object({projectId:z.string(),pieceId:z.string(),attemptId:z.string(),requestId:z.string().optional(),dispatchId:z.string().optional(),version:z.number(),explicitApproval:z.literal(true),actionBinding:z.string(),apiKey:z.string(),artworkInput:z.unknown().optional()});
import { parseArtworkInput, MAX_ARTWORK_REQUEST_BYTES } from '@compor/agents-api/artwork-input';
const uuid = (value:unknown):value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body:unknown,status:number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function readJson(request:Request):Promise<unknown> {
  if (!request.body) throw Error('missing');
  const reader=request.body.getReader(),chunks=[];let n=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX_ARTWORK_REQUEST_BYTES)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  finally {try {Promise.resolve(reader.cancel()).catch(()=>{});} catch {} try {reader.releaseLock();} catch {}}
}
type ReceiptContext={actor:Actor;projectId:string;requestId:string;attemptId:string};
type ReceiptIssue=ReceiptContext&{pieceId:string;version:number;executionId:string;assetId:string;contentSha256:string};
type ReceiptDependencies={preflight:(context:ReceiptContext)=>Promise<boolean>;store:(context:ReceiptIssue)=>Promise<void>};
type TurnIdentity={userId:string;projectId:string;requestId:string;attemptId:string;state:string};
export function createImageReceiptPreflight(deps:{getTurn:(context:{actor:Actor;projectId:string;requestId:string})=>Promise<TurnIdentity|null>;lookup:(context:{actor:Actor;projectId:string;requestId:string})=>Promise<{status:string}>}) {
 return async ({actor,projectId,requestId,attemptId}:ReceiptContext)=>{
  const turn=await deps.getTurn({actor,projectId,requestId});
  if(!turn || turn.userId!==actor.userId || turn.projectId!==projectId || turn.requestId!==requestId || turn.attemptId!==attemptId || turn.state!=='action_required')return false;
  // Calling lookup also verifies that the receipt migration exists. A stored
  // candidate for this request must never authorize a further dispatch.
  return (await deps.lookup({actor,projectId,requestId})).status==='unverified';
 };
}
export function createAgentImageRoute({appOrigin,resolveActor,approve,execute,send,receipt}: {appOrigin?:string;resolveActor?:()=>Promise<Actor|null>;approve?:ReturnType<typeof createImageToolApproval>;execute?:ReturnType<typeof createImageToolExecution>;send?:ReturnType<typeof createImageToolResultSender>;receipt?:ReceiptDependencies}={}) {
 return async (request:Request) => {
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!appOrigin || typeof resolveActor!=='function'||typeof approve!=='function'||typeof execute!=='function'||typeof send!=='function')return reply({error:'unavailable'},503);
  if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
  let data,actor,artworkInput;
  try {data=inputSchema.parse(await readJson(request));artworkInput=parseArtworkInput(data.artworkInput);} catch{return reply({error:'invalid_request'},400);}
  if(![data?.projectId,data?.pieceId,data?.attemptId].every(uuid) || (data.requestId!==undefined&&!uuid(data.requestId)) || (data.dispatchId!==undefined&&!uuid(data.dispatchId)) || !Number.isSafeInteger(data.version) || data.version<1 || data.version>2147483647 || data.explicitApproval!==true || typeof data.actionBinding!=='string' || data.actionBinding.length>2048 || !/^sk-[^\s]{20,300}$/.test(data.apiKey??''))return reply({error:'invalid_request'},400);
  try {actor=await resolveActor();} catch{return reply({error:'unavailable'},503);}
  if(!actor||!uuid(actor.userId) || typeof actor?.token!=='string' || !/^[^\s]{1,8192}$/.test(actor.token))return reply({error:'unauthorized'},401);
  if(data.requestId!==undefined) {
   const preflightUnavailable=()=>data.dispatchId===undefined?reply({error:'unavailable'},503):reply({error:'image_preflight_unavailable',requestId:data.requestId,attemptId:data.attemptId,dispatchId:data.dispatchId},503);
   // Check both the immutable turn/attempt association and availability of
   // the receipt store before starting any provider operation.
   try {if(!receipt || !await receipt.preflight({actor,projectId:data.projectId,requestId:data.requestId,attemptId:data.attemptId}))return preflightUnavailable();}
   catch {return preflightUnavailable();}
  }
  const context={actor,projectId:data.projectId,pieceId:data.pieceId,version:data.version,attemptId:data.attemptId};
  let proof;
  try {proof=await approve({...context,actionBinding:data.actionBinding,artworkInput,explicitApproval:true});} catch{return reply({error:'unavailable'},503);}
  if(!proof)return reply({error:'forbidden'},403);
  let storedAssetId, usageRecorded;
  try {
   const execution=await execute({...context,actionBinding:proof,apiKey:data.apiKey,artworkInput,explicitApproval:true});
   if (execution?.status === 'busy' || execution?.status === 'blocked') return reply({status:execution.status},200);
   if('usageRecorded' in execution && typeof execution.usageRecorded==='boolean')usageRecorded=execution.usageRecorded;
   if(execution?.status==='unknown' && uuid(execution.assetId))return reply({error:'result_unknown',retryAutomatically:false,assetId:execution.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},502);
   if(execution?.status!=='completed' || !uuid(execution.executionId))return reply({error:'result_unknown',retryAutomatically:false},502);
   const output=z.object({assetId:z.string()}).parse(JSON.parse(execution.toolResult.output));
   if(!uuid(output?.assetId))return reply({error:'result_unknown',retryAutomatically:false},502);
   storedAssetId=output.assetId;
   const result=await send({...context,actionBinding:proof,executionId:execution.executionId,apiKey:data.apiKey});
   if(result?.status!=='accepted')return reply({error:'result_unknown',retryAutomatically:false,assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},502);
   if(data.requestId!==undefined) {
    if(!receipt || typeof execution.contentSha256!=='string' || !/^[0-9a-f]{64}$/.test(execution.contentSha256))throw Error('receipt unavailable');
    await receipt.store({actor,projectId:data.projectId,requestId:data.requestId,attemptId:data.attemptId,pieceId:data.pieceId,version:data.version,executionId:execution.executionId,assetId:output.assetId,contentSha256:execution.contentSha256});
   }
   return reply({status:'accepted',assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},202);
  } catch{return reply({error:'result_unknown',retryAutomatically:false,...(storedAssetId ? {assetId:storedAssetId} : {}),...(usageRecorded===undefined?{}:{usageRecorded})},502);}
 };
}
