import {isAgentCallId} from './agent-call-id.mjs';
import { createHash } from 'node:crypto';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const unknown = () => ({ status: 'unknown', retryAutomatically: false });
async function boundedText(stream, limit) {
  if (!stream) throw new Error('missing body');
  const reader = stream.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('body too large'); chunks.push(value); }
    return new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks));
  } finally { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} try { reader.releaseLock(); } catch {} }
}

// Internal only: actor must be authenticated by the caller; all adapters must be trusted.
// This does not submit tool_result or expose an HTTP route.
export function createImageToolApproval({ bindings, ownsVersion } = {}) {
  if (typeof bindings?.issueApprovedAction !== 'function' || typeof ownsVersion !== 'function') throw new TypeError('invalid dependencies');
  return async ({actor, projectId, pieceId, version, attemptId, actionBinding, explicitApproval} = {}) => {
    if (!uuid(actor?.userId) || typeof actor?.token !== 'string' || !/^[^\s]{1,8192}$/.test(actor.token) || ![projectId,pieceId,attemptId].every(uuid) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647 || explicitApproval !== true) return null;
    try {
      if (await ownsVersion({actor,projectId,pieceId,version}) !== true) return null;
      return bindings.issueApprovedAction({actionBinding,userId:actor.userId,projectId,attemptId,pieceId,version});
    } catch { return null; }
  };
}
export function createImageToolExecution({ bindings, ownsVersion, reservations, imageHandler, imageStorageHandler, usage, appOrigin, fetch: fetchApi = globalThis.fetch } = {}) {
  if (typeof bindings?.verifyApprovedAction !== 'function' || typeof ownsVersion !== 'function' || !['reserve','declareConsent','claimExecution','completeExecution','markExecutionUnknown'].every(k => typeof reservations?.[k] === 'function') || typeof imageHandler !== 'function' || typeof imageStorageHandler !== 'function' || typeof appOrigin !== 'string' || typeof fetchApi !== 'function') throw new TypeError('invalid dependencies');
  if (usage && (typeof usage.start !== 'function' || typeof usage.finish !== 'function')) throw new TypeError('invalid usage store');
  return async ({ actor, projectId, pieceId, version, attemptId, actionBinding, apiKey, explicitApproval } = {}) => {
    if (!uuid(actor?.userId) || typeof actor?.token !== 'string' || !/^[^\s]{1,8192}$/.test(actor.token) || ![projectId,pieceId,attemptId].every(uuid) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647 || !/^sk-[^\s]{20,300}$/.test(apiKey ?? '') || explicitApproval !== true) return { status: 'rejected' };
    let action;
    try { action = bindings.verifyApprovedAction({token: actionBinding, userId: actor.userId, projectId, attemptId, pieceId, version}); } catch { return {status:'rejected'}; }
    if (!action || action.userId !== actor.userId || action.projectId !== projectId || action.attemptId !== attemptId || action.pieceId !== pieceId || action.version !== version || !/^sess_[A-Za-z0-9_-]{1,128}$/.test(action.sessionId ?? '') || !/^turn_[A-Za-z0-9_-]{1,128}$/.test(action.turnId ?? '') || !isAgentCallId(action.callId) || !/^[0-9a-f]{64}$/.test(action.promptDigest ?? '')) return {status:'rejected'};
    try { if (await ownsVersion({actor,projectId,pieceId,version}) !== true) return {status:'rejected'}; } catch { return unknown(); }
    let prompt;
    try {
      const response = await fetchApi(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(action.sessionId)}`, {headers:{Authorization:`Bearer ${apiKey}`,'OpenAI-Beta':'agents=v1'},redirect:'error',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return unknown();
      const text = await boundedText(response.body, 256 * 1024);
      const session = JSON.parse(text), calls = session?.required_actions;
      if (session.id !== action.sessionId || session.status !== 'requires_action' || !Array.isArray(calls) || calls.length !== 1) return {status:'rejected'};
      const call = calls[0]; let args = call?.arguments;
      if (typeof args === 'string') { if (args.length > 8192) return {status:'rejected'}; args = JSON.parse(args); }
      if (call?.type !== 'function_call' || call.name !== 'generate_image' || call.turn_id !== action.turnId || call.call_id !== action.callId || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 || typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 4000 || /sk-[^\s]+/i.test(args.prompt) || args.prompt.includes(apiKey) || createHash('sha256').update(args.prompt).digest('hex') !== action.promptDigest) return {status:'rejected'};
      prompt = args.prompt;
    } catch { return unknown(); }
    let execution;
    try {
      const reservation = await reservations.reserve({actor,projectId,pieceId,version,attemptId,sessionId:action.sessionId,turnId:action.turnId,callId:action.callId});
      if (!uuid(reservation?.id) || reservation.state !== 'reserved') return unknown();
      await reservations.declareConsent({actor,reservationId:reservation.id,confirmed:true});
      execution = await reservations.claimExecution({actor,reservationId:reservation.id});
      if (!uuid(execution?.id) || !uuid(execution?.assetId) || execution.state !== 'running' || execution.isNew !== true) return unknown();
    } catch { return unknown(); }
    let measurementStarted=false, measurementFinished=false, usageRecorded=false;
    const measurement={actor,projectId,attemptId,part:'image',partId:execution.id};
    let storedAssetId;
    try {
      if (usage) {if (await usage.start(measurement) !== true) throw Error('usage unavailable'); measurementStarted=true;}
      const image = await imageHandler(new Request(`${appOrigin}/internal-image`, {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${actor.token}`},body:JSON.stringify({apiKey,prompt,authorizeGeneration:true})}));
      if (!image.ok) throw new Error('generation uncertain');
      const result = await image.json();
      if (usage) {measurementFinished=true; try {await usage.finish({...measurement,state:'completed',usage:result?.usage});usageRecorded=true;} catch { /* preserve image; measurement remains uncertain */ }}
      if (typeof result?.imageBase64 !== 'string' || result.imageBase64.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.imageBase64)) throw new Error('invalid image');
      const url = new URL('/internal-storage',appOrigin);
      for (const [k,v] of Object.entries({projectId,pieceId,version:String(version),assetId:execution.assetId})) url.searchParams.set(k,v);
      const stored = await imageStorageHandler(new Request(url, {method:'POST',headers:{origin:appOrigin,'content-type':'image/png',authorization:`Bearer ${actor.token}`},body:Buffer.from(result.imageBase64,'base64')}));
      if (!stored.ok) throw new Error('storage uncertain');
      const confirmation = await stored.json();
      if (confirmation?.status !== 'stored' || confirmation.assetId !== execution.assetId) throw new Error('storage uncertain');
      storedAssetId = execution.assetId;
      await reservations.completeExecution({actor,executionId:execution.id});
      return {status:'completed',executionId:execution.id,...(usage?{usageRecorded}:{}),toolResult:{type:'agent.session.input.tool_result',turn_id:action.turnId,call_id:action.callId,success:true,output:JSON.stringify({assetId:execution.assetId})}};
    } catch {
      if (usage && measurementStarted && !measurementFinished) {try {await usage.finish({...measurement,state:'unknown',usage:null});} catch { /* started remains uncertain */ }}
      try { await reservations.markExecutionUnknown({actor,executionId:execution.id}); } catch { /* running/completed also prevent another claim */ }
      return {...unknown(),...(storedAssetId ? {assetId:storedAssetId} : {}),...(usage?{usageRecorded}:{})};
    }
  };
}
