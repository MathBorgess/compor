import {createHash,randomBytes} from 'node:crypto';
import {isAgentCallId} from './agent-call-id.mjs';
import { parseArtworkInput, artworkInputDigest, imageProposalDigest, validateArtworkForProposal, compileArtworkPrompt } from './artwork-input.mjs';
import {isImageQualityReason} from './image-tool-reservation.mjs';
import { formatImageSize } from './creative-skills/formats.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const unknown = () => ({ status: 'unknown', retryAutomatically: false });
function closurePair(reason, outcome) {
  if (reason === 'provider_rejected_400' && outcome === 'failure') return { closureReason: reason, providerOutcome: outcome };
  if (reason === 'provider_rejected_429' && outcome === 'retryable') return { closureReason: reason, providerOutcome: outcome };
  if (reason === 'result_unknown' && (outcome === 'retryable' || outcome === 'unconfirmed')) return { closureReason: reason, providerOutcome: outcome };
  return null;
}
function providerClosure(status, body) {
  const pair = closurePair(body?.closureReason, body?.providerOutcome);
  if (!pair || pair.providerOutcome === 'unconfirmed' || body.error !== 'generation_not_produced' || body.retryAutomatically !== false) return null;
  if (pair.closureReason === 'provider_rejected_400' && status !== 400) return null;
  if (pair.closureReason === 'provider_rejected_429' && status !== 429) return null;
  if (pair.closureReason === 'result_unknown' && status !== 503) return null;
  return pair;
}
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
  return async ({actor, projectId, pieceId, version, attemptId, actionBinding, explicitApproval, artworkInput} = {}) => {
    if (!uuid(actor?.userId) || typeof actor?.token !== 'string' || !/^[^\s]{1,8192}$/.test(actor.token) || ![projectId,pieceId,attemptId].every(uuid) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647 || explicitApproval !== true) return null;
    try {
      const input = parseArtworkInput(artworkInput);
      if (await ownsVersion({actor,projectId,pieceId,version}) !== true) return null;
      if (input.source && (input.source.pieceId !== pieceId || input.source.version >= version || await ownsVersion({actor,projectId,pieceId,version:input.source.version}) !== true)) return null;
      return bindings.issueApprovedAction({actionBinding,userId:actor.userId,projectId,attemptId,pieceId,version,artworkInput:input});
    } catch { return null; }
  };
}
export function createImageToolExecution({ bindings, ownsVersion, reservations, imageHandler, imageStorageHandler, usage, appOrigin, checkVisualAuthority, qualityHoldEnabled=false, fetch: fetchApi = globalThis.fetch } = {}) {
  if (typeof bindings?.verifyApprovedAction !== 'function' || typeof ownsVersion !== 'function' || !['reserve','declareConsent','claimExecution','completeExecution','markExecutionUnknown'].every(k => typeof reservations?.[k] === 'function') || typeof imageHandler !== 'function' || typeof imageStorageHandler !== 'function' || typeof appOrigin !== 'string' || typeof fetchApi !== 'function') throw new TypeError('invalid dependencies');
  if (usage && (typeof usage.start !== 'function' || typeof usage.finish !== 'function')) throw new TypeError('invalid usage store');
  if(qualityHoldEnabled&&typeof reservations.holdExecution!=='function')throw new TypeError('invalid quality hold store');
  return async ({ actor, projectId, pieceId, version, attemptId, actionBinding, apiKey, explicitApproval, artworkInput, visualAuthority, signal } = {}) => {
    if (!uuid(actor?.userId) || typeof actor?.token !== 'string' || !/^[^\s]{1,8192}$/.test(actor.token) || ![projectId,pieceId,attemptId].every(uuid) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647 || !/^sk-[^\s]{20,300}$/.test(apiKey ?? '') || explicitApproval !== true) return { status: 'rejected' };
    let action;
    try { action = bindings.verifyApprovedAction({token: actionBinding, userId: actor.userId, projectId, attemptId, pieceId, version}); } catch { return {status:'rejected'}; }
    if (!action || action.userId !== actor.userId || action.projectId !== projectId || action.attemptId !== attemptId || action.pieceId !== pieceId || action.version !== version || !/^sess_[A-Za-z0-9_-]{1,128}$/.test(action.sessionId ?? '') || !/^turn_[A-Za-z0-9_-]{1,128}$/.test(action.turnId ?? '') || !isAgentCallId(action.callId) || !/^[0-9a-f]{64}$/.test(action.proposalDigest ?? '') || !/^[0-9a-f]{64}$/.test(action.artworkDigest ?? '')) return {status:'rejected'};
    try { if (await ownsVersion({actor,projectId,pieceId,version}) !== true) return {status:'rejected'}; } catch { return unknown(); }
    let prompt, input, requiredText = [];
    try {
      input = parseArtworkInput(artworkInput);
      if (artworkInputDigest(input) !== action.artworkDigest) return {status:'rejected'};
      if (input.visualInput && (!visualAuthority || typeof checkVisualAuthority!=='function' || !uuid(visualAuthority.requestId) || visualAuthority.manifestDigest!==action.visualInputDigest || (visualAuthority.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(visualAuthority.consentSecret)))) return {status:'rejected'};
      if (!input.visualInput && visualAuthority) return {status:'rejected'};
      if (input.source && (input.source.pieceId !== pieceId || input.source.version >= version || await ownsVersion({actor,projectId,pieceId,version:input.source.version}) !== true)) return {status:'rejected'};
      if(qualityHoldEnabled){
        const {headline,price,date,fields=[]}=input.literalText;
        requiredText=[headline,price,date,...fields.map(field=>field.value)].filter(value=>value.trim().length>0);
        if(requiredText.some(value=>!value.isWellFormed()))return {status:'invalid_prompt'};
      }
    } catch { return {status:'rejected'}; }
    try {
      const response = await fetchApi(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(action.sessionId)}`, {headers:{Authorization:`Bearer ${apiKey}`,'OpenAI-Beta':'agents=v1'},redirect:'error',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return unknown();
      const text = await boundedText(response.body, 256 * 1024);
      const session = JSON.parse(text), calls = session?.required_actions;
      if (session.id !== action.sessionId || session.status !== 'requires_action' || !Array.isArray(calls) || calls.length !== 1) return {status:'rejected'};
      const call = calls[0]; let args = call?.arguments;
      if (typeof args === 'string') { if (args.length > 8192) return {status:'rejected'}; args = JSON.parse(args); }
      if (call?.type !== 'function_call' || call.name !== 'generate_image' || call.turn_id !== action.turnId || call.call_id !== action.callId) return {status:'rejected'};
      let proposal;
      try {
        ({proposal} = validateArtworkForProposal(args, input));
        if (imageProposalDigest(proposal) !== action.proposalDigest || proposal.prompt.includes(apiKey)) return {status:'rejected'};
      } catch { return {status:'rejected'}; }
      prompt = compileArtworkPrompt(proposal, input);
      // Match the image handler UTF-16 budget before creating a durable claim.
      if (prompt.length > 8000) return {status:'invalid_prompt'};
    } catch { return unknown(); }
    let execution;
    const executionProof = randomBytes(32);
    const executionSecret = executionProof.toString('hex');
    try {
      const reservation = await reservations.reserve({actor,projectId,pieceId,version,attemptId,sessionId:action.sessionId,turnId:action.turnId,callId:action.callId});
      if (!uuid(reservation?.id) || reservation.state !== 'reserved') return unknown();
      await reservations.declareConsent({actor,reservationId:reservation.id,confirmed:true});
      execution = await reservations.claimExecution({actor,reservationId:reservation.id,qualityDigest:createHash('sha256').update(executionProof).digest('hex'),...(visualAuthority?{visualAuthority}:{})});
      if (execution?.state === 'busy' || execution?.state === 'blocked') return {status:execution.state};
      if (execution?.state === 'failed' && uuid(execution.id)) {
        const stored = typeof reservations.readExecutionClosure === 'function' ? await reservations.readExecutionClosure({actor, executionId: execution.id}) : {closureReason:'result_unknown', providerOutcome:'unconfirmed'};
        const pair = closurePair(stored?.closureReason, stored?.providerOutcome);
        return pair ? {status:'failed', ...pair, retryAutomatically:false} : unknown();
      }
      if (!uuid(execution?.id) || !uuid(execution?.assetId) || execution.state !== 'running' || execution.isNew !== true) return unknown();
    } catch { return unknown(); }
    let measurementStarted=false, measurementFinished=false, usageRecorded=false;
    const measurement={actor,projectId,attemptId,part:'image',partId:execution.id};
    let storedAssetId;
    try {
      if (usage) {if (await usage.start(measurement) !== true) throw Error('usage unavailable'); measurementStarted=true;}
      if (visualAuthority && (signal?.aborted || await checkVisualAuthority({actor,projectId,pieceId,visualAuthority}) !== true || signal?.aborted)) throw Error('visual authority unavailable');
      const imageSize = input.format ? formatImageSize(input.format) : undefined;
      const imageRequest=new Request(`${appOrigin}/internal-image`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${actor.token}`},body:JSON.stringify({apiKey,prompt,...(imageSize?{size:imageSize}:{}),images:input.images.map(({mime,data})=>({mime,data})),authorizeGeneration:true}),signal:qualityHoldEnabled?signal:undefined});
      async function authorizeReview(){
        if(signal?.aborted)return false;
        try{
          const owned=visualAuthority
            ?await checkVisualAuthority({actor,projectId,pieceId,visualAuthority})
            :await ownsVersion({actor,projectId,pieceId,version});
          return owned===true&&!signal?.aborted;
        }
        catch{return false;}
      }
      const review=qualityHoldEnabled?{authorizeReview,...(requiredText.length?{requiredText}:{})}:undefined;
      const image=await imageHandler(imageRequest,review);
      let result = null;
      if (!image.ok) {
        let payload = null;
        try { payload = JSON.parse(await boundedText(image.body, 64 * 1024)); } catch { payload = null; }
        const refused = providerClosure(image.status, payload);
        if (refused) {
          if (usage && measurementStarted && !measurementFinished) {
            measurementFinished = true;
            try { await usage.finish({...measurement, state:'unknown', usage:null}); } catch { /* measurement remains uncertain */ }
          }
          if (typeof reservations.failExecution !== 'function') throw Error('generation uncertain');
          await reservations.failExecution({actor, executionId: execution.id, executionSecret, closureReason: refused.closureReason, providerOutcome: refused.providerOutcome});
          return {status:'failed', ...refused, retryAutomatically:false, ...(usage ? {usageRecorded:false} : {})};
        }
        if (!qualityHoldEnabled || ![422, 503].includes(image.status)) throw Error('generation uncertain');
        result = payload;
      } else result = await image.json();
      let qualityReason=image.ok?null:result?.error;
      if(!image.ok&&(!isImageQualityReason(qualityReason)||result.retryAutomatically!==false||
        image.status!==(qualityReason==='image_quality_rejected'?422:503)))throw Error('generation uncertain');
      if (usage) {measurementFinished=true; try {await usage.finish({...measurement,state:'completed',usage:result?.usage});usageRecorded=true;} catch { /* preserve image; measurement remains uncertain */ }}
      if(image.ok&&qualityHoldEnabled&&!(await authorizeReview()))qualityReason='image_quality_inconclusive';
      if(qualityReason){
        await reservations.holdExecution({actor,executionId:execution.id,qualitySecret:executionSecret,qualityReason});
        return {status:'quality_held',qualityReason,retryAutomatically:false,...(usage?{usageRecorded}:{})};
      }
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
      try { await reservations.markExecutionUnknown({actor,executionId:execution.id,executionSecret}); } catch { /* running/completed also prevent another claim */ }
      return {...unknown(),...(storedAssetId ? {assetId:storedAssetId} : {}),...(usage?{usageRecorded}:{})};
    }
  };
}
