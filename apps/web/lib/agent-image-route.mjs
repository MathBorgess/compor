const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body,status) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function readJson(request) {
  if (!request.body) throw Error('missing');
  const reader=request.body.getReader(),chunks=[];let n=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>16384)throw Error('large');chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  finally {try {Promise.resolve(reader.cancel()).catch(()=>{});} catch {} try {reader.releaseLock();} catch {}}
}
export function createAgentImageRoute({appOrigin,resolveActor,approve,execute,send}={}) {
 return async request => {
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(!appOrigin || ![resolveActor,approve,execute,send].every(f=>typeof f==='function'))return reply({error:'unavailable'},503);
  if(request.headers.get('origin')!==appOrigin)return reply({error:'invalid_origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return reply({error:'invalid_request'},400);
  let data,actor;
  try {data=await readJson(request);} catch{return reply({error:'invalid_request'},400);}
  if(![data?.projectId,data?.pieceId,data?.attemptId].every(uuid) || !Number.isSafeInteger(data.version) || data.version<1 || data.version>2147483647 || data.explicitApproval!==true || typeof data.actionBinding!=='string' || data.actionBinding.length>2048 || !/^sk-[^\s]{20,300}$/.test(data.apiKey??''))return reply({error:'invalid_request'},400);
  try {actor=await resolveActor();} catch{return reply({error:'unavailable'},503);}
  if(!uuid(actor?.userId) || typeof actor?.token!=='string' || !/^[^\s]{1,8192}$/.test(actor.token))return reply({error:'unauthorized'},401);
  const context={actor,projectId:data.projectId,pieceId:data.pieceId,version:data.version,attemptId:data.attemptId};
  let proof;
  try {proof=await approve({...context,actionBinding:data.actionBinding,explicitApproval:true});} catch{return reply({error:'unavailable'},503);}
  if(!proof)return reply({error:'forbidden'},403);
  let storedAssetId, usageRecorded;
  try {
   const execution=await execute({...context,actionBinding:proof,apiKey:data.apiKey,explicitApproval:true});
   if(typeof execution?.usageRecorded==='boolean')usageRecorded=execution.usageRecorded;
   if(execution?.status!=='completed' || !uuid(execution.executionId))return reply({error:'result_unknown',retryAutomatically:false},502);
   const output=JSON.parse(execution.toolResult?.output ?? 'null');
   if(!uuid(output?.assetId))return reply({error:'result_unknown',retryAutomatically:false},502);
   storedAssetId=output.assetId;
   const result=await send({...context,actionBinding:proof,executionId:execution.executionId,apiKey:data.apiKey});
   if(result?.status!=='accepted')return reply({error:'result_unknown',retryAutomatically:false,assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},502);
   return reply({status:'accepted',assetId:output.assetId,...(usageRecorded===undefined?{}:{usageRecorded})},202);
  } catch{return reply({error:'result_unknown',retryAutomatically:false,...(storedAssetId ? {assetId:storedAssetId} : {}),...(usageRecorded===undefined?{}:{usageRecorded})},502);}
 };
}
