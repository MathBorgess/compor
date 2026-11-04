import { createHash } from 'node:crypto';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const unknown = () => ({status:'unknown',retryAutomatically:false});
async function readLimited(stream,limit) {
  if (!stream) throw Error('missing'); const reader=stream.getReader(), parts=[]; let n=0;
  try { for (;;) {const {value,done}=await reader.read(); if(done)break; n+=value.byteLength;if(n>limit)throw Error('large');parts.push(value);} return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)); }
  finally { try {Promise.resolve(reader.cancel()).catch(()=>{});} catch {} try {reader.releaseLock();} catch {} }
}
// Internal seam only. Authentication and CSRF protection belong to its caller.
export function createImageToolResultSender({bindings,ownsVersion,reservations,usage,fetch:fetchApi=globalThis.fetch,sendTimeoutMs=15000}={}) {
  if(typeof bindings?.verifyApprovedAction!=='function' || typeof ownsVersion!=='function' || typeof reservations?.claimResultSubmission!=='function' || typeof reservations?.finishResultSubmission!=='function' || typeof fetchApi!=='function' || !Number.isSafeInteger(sendTimeoutMs) || sendTimeoutMs<1 || sendTimeoutMs>15000) throw TypeError('invalid dependencies');
  if(usage && (typeof usage.start!=='function' || typeof usage.finish!=='function')) throw TypeError('invalid usage store');
  return async ({actor,projectId,pieceId,version,attemptId,executionId,actionBinding,apiKey}={}) => {
    if(!uuid(actor?.userId) || typeof actor?.token!=='string' || !/^[^\s]{1,8192}$/.test(actor.token) || ![projectId,pieceId,attemptId,executionId].every(uuid) || !Number.isSafeInteger(version) || version<1 || version>2147483647 || !/^sk-[^\s]{20,300}$/.test(apiKey??'')) return {status:'rejected'};
    let action;
    try {action=bindings.verifyApprovedAction({token:actionBinding,userId:actor.userId,projectId,pieceId,version,attemptId});} catch {return {status:'rejected'};}
    if(!action || action.userId!==actor.userId || action.projectId!==projectId || action.pieceId!==pieceId || action.version!==version || action.attemptId!==attemptId || !/^sess_[A-Za-z0-9_-]{1,128}$/.test(action.sessionId??'') || !/^turn_[A-Za-z0-9_-]{1,128}$/.test(action.turnId??'') || !/^call_[A-Za-z0-9_-]{1,128}$/.test(action.callId??'') || !/^[0-9a-f]{64}$/.test(action.promptDigest??'')) return {status:'rejected'};
    try {if(await ownsVersion({actor,projectId,pieceId,version})!==true)return {status:'rejected'};} catch{return unknown();}
    const base=`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(action.sessionId)}`;
    try {
      const response=await fetchApi(base,{headers:{Authorization:`Bearer ${apiKey}`,'OpenAI-Beta':'agents=v1'},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return unknown();
      const s=JSON.parse(await readLimited(response.body,256*1024)), calls=s?.required_actions;
      if(s.id!==action.sessionId || s.status!=='requires_action' || !Array.isArray(calls) || calls.length!==1)return {status:'rejected'};
      const c=calls[0];let a=c?.arguments;
      if(typeof a==='string'){if(a.length>8192)return {status:'rejected'};a=JSON.parse(a);}
      if(c?.type!=='function_call'||c.name!=='generate_image'||c.turn_id!==action.turnId||c.call_id!==action.callId||!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length!==1||typeof a.prompt!=='string'||!a.prompt.trim()||a.prompt.length>4000||/sk-[^\s]+/i.test(a.prompt)||a.prompt.includes(apiKey)||createHash('sha256').update(a.prompt).digest('hex')!==action.promptDigest)return {status:'rejected'};
    } catch{return unknown();}
    let submission;
    try {submission=await reservations.claimResultSubmission({actor,executionId,projectId,pieceId,version,attemptId,sessionId:action.sessionId,turnId:action.turnId,callId:action.callId});
      if(!uuid(submission?.id)||!uuid(submission?.assetId)||submission.isNew!==true||submission.state!=='sending')return unknown();
    } catch{return unknown();}
    let measurementStarted=false,accepted=false;
    const measurement={actor,projectId,attemptId,part:'agent_resume',partId:submission.id};
    try {
      if(usage){if(await usage.start(measurement)!==true)throw Error('usage unavailable');measurementStarted=true;}
      const event={type:'agent.session.input.tool_result',turn_id:action.turnId,call_id:action.callId,success:true,output:JSON.stringify({assetId:submission.assetId})};
      const controller = new AbortController(); let response;
      try {
        response=await fetchApi(`${base}/events`,{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'OpenAI-Beta':'agents=v1','Content-Type':'application/json'},body:JSON.stringify({events:[event]}),redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(sendTimeoutMs),controller.signal])});
        if(!response.ok)throw Error('uncertain');
        accepted=true;
      } finally {
        // We need only acceptance headers, never an unbounded or indefinitely open body.
        try { if (response?.body) Promise.resolve(response.body.cancel()).catch(()=>{}); } catch {}
        controller.abort();
      }
      await reservations.finishResultSubmission({actor,submissionId:submission.id,state:'sent'});
      return {status:'accepted'};
    } catch {
      if(usage && measurementStarted && !accepted)try {await usage.finish({...measurement,state:'unknown',usage:null});} catch {}
      try {await reservations.finishResultSubmission({actor,submissionId:submission.id,state:'unknown'});} catch { /* sending or sent remain non-repeatable */ }
      return unknown();
    }
  };
}
