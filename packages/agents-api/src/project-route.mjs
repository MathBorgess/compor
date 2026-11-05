import {AGENT_MODEL} from './agent-model.mjs';
import { createAgentHandler } from './index.mjs';
import { recordAgentEvent } from './telemetry.mjs';

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Server-side seam; do not connect until the attempt store is durable and authorized. */
export function createProjectAgentHandler({ appOrigin, resolveActor, ownsProject, attempts, bindings, usage, withMcp, fetch, enableRecovery = false } = {}) {
  return async request => {
    if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
    if (typeof appOrigin !== 'string' || typeof resolveActor !== 'function' || typeof ownsProject !== 'function' ||
        typeof attempts?.start !== 'function' || typeof attempts?.finish !== 'function' || typeof bindings?.issue !== 'function' || typeof bindings?.issueAction !== 'function') return response({ error: 'unavailable' }, 503);
    if (enableRecovery && (typeof attempts.bindRecovery !== 'function' || typeof bindings.issueRecovery !== 'function')) return response({ error: 'unavailable' }, 503);
    if (request.headers.get('origin') !== appOrigin) { recordAgentEvent('origin_denied'); return response({ error: 'invalid_origin' }, 403); }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) { recordAgentEvent('request_invalid'); return response({ error: 'invalid_request' }, 400); }
    const projectId = request.headers.get('x-compor-project-id');
    const idempotencyKey = request.headers.get('x-compor-attempt-id');
    if (!projectIdPattern.test(projectId ?? '') || !projectIdPattern.test(idempotencyKey ?? '')) { recordAgentEvent('request_invalid'); return response({ error: 'invalid_request' }, 400); }
    let actor;
    try { actor = await resolveActor(); } catch { recordAgentEvent('actor_unavailable'); return response({ error: 'unavailable' }, 503); }
    if (!actor || typeof actor.userId !== 'string' || !actor.userId || typeof actor.token !== 'string' || !actor.token) { recordAgentEvent('actor_unauthorized'); return response({ error: 'unauthorized' }, 401); }
    try { if (!await ownsProject({ actor, projectId })) { recordAgentEvent('ownership_denied'); return response({ error: 'forbidden' }, 403); } }
    catch { recordAgentEvent('ownership_unavailable'); return response({ error: 'unavailable' }, 503); }
    let attempt;
    try {
      attempt = await attempts.start({ actor, projectId, idempotencyKey });
      if (!attempt || typeof attempt.id !== 'string' || !['started', 'completed', 'unknown'].includes(attempt.state) || typeof attempt.isNew !== 'boolean' || (attempt.isNew && attempt.state !== 'started')) throw new Error('invalid attempt');
    }
    catch { recordAgentEvent('attempt_reservation_failed'); return response({ error: 'unavailable' }, 503); }
    if (!attempt.isNew) { recordAgentEvent('attempt_existing'); return response({ error: 'attempt_exists', state: attempt.state, retryAutomatically: false }, 409); }
    recordAgentEvent('attempt_reserved');
    const measurement={actor,projectId,attemptId:attempt.id,part:'agent',partId:attempt.id,model:AGENT_MODEL};
    if (usage) {
      try {if (typeof usage.start!=='function' || typeof usage.finish!=='function' || await usage.start(measurement)!==true) throw Error('usage unavailable');}
      catch {recordAgentEvent('usage_reservation_failed');try {await attempts.finish({actor,projectId,attemptId:attempt.id,state:'unknown'});} catch {} return response({error:'unavailable'},503);}
      recordAgentEvent('usage_reserved');
    }
    let result, invoked = false;
    const run = async mcpTool => {
      if (invoked) throw Error('duplicate invocation');
      invoked = true;
      const onSession = enableRecovery ? async sessionId => {
        const binding = bindings.issueRecovery({ userId: actor.userId, projectId, attemptId: attempt.id, sessionId });
        await attempts.bindRecovery({ actor, projectId, attemptId: attempt.id, binding });
      } : undefined;
      result = await createAgentHandler({ authenticate: async () => ({ userId: actor.userId }), fetch, enableImageTool: true, mcpTool, onSession })(request);
    };
    try {
      if (withMcp === undefined) await run();
      else if (typeof withMcp !== 'function') result = response({error:'unavailable'},503);
      else {
        const state = await withMcp({actor,projectId},run);
        if (state?.status !== 'invoked' || !invoked || !result) { if(!invoked)recordAgentEvent('mcp_scope_failed'); result = invoked ? response({error:'result_unknown',retryAutomatically:false},502) : response({error:'unavailable'},503); }
      }
    } catch { result = invoked ? response({ error: 'result_unknown', retryAutomatically: false }, 502) : response({error:'unavailable'},503); }
    let usageRecorded=false;
    if (usage && result.status !== 202) {
      let counts=null; try {if(result.ok)counts=(await result.clone().json()).usage??null;} catch {}
      try {await usage.finish({...measurement,state:result.ok?'completed':'unknown',usage:counts});usageRecorded=true;} catch { /* started remains uncertain */ }
    }
    if (result.status === 202) {
      try {
        const data = await result.json();
        if (data.status !== 'consent_required') throw new Error('invalid action');
        const actionBinding = bindings.issueAction({ userId: actor.userId, projectId, attemptId: attempt.id, sessionId: data.sessionId, turnId: data.turnId, callId: data.callId, prompt: data.prompt });
        if (typeof actionBinding !== 'string' || !actionBinding) throw new Error('invalid action binding');
        return response({ status: 'consent_required', prompt: data.prompt, attemptId: attempt.id, actionBinding, ...(usage?{usageRecorded}:{}) }, 202);
      } catch { result = response({ error: 'result_unknown', retryAutomatically: false }, 502); }
    }
    if (result.ok) {
      try {
        const data = await result.json();
        const sessionBinding = bindings.issue({ userId: actor.userId, projectId, attemptId: attempt.id, sessionId: data.sessionId });
        if (typeof sessionBinding !== 'string' || !sessionBinding) throw new Error('invalid binding');
        result = response({ sessionId: data.sessionId, text: data.text, usage: data.usage, sessionBinding, ...(usage?{usageRecorded}:{}) }, 200);
      } catch { result = response({ error: 'result_unknown', retryAutomatically: false }, 502); }
    }
    const state = result.ok ? 'completed' : 'unknown';
    try { await attempts.finish({ actor, projectId, attemptId: attempt.id, state }); }
    catch { return response({ error: 'result_unknown', retryAutomatically: false }, 502); }
    if (result.status === 502) return response({ error: 'result_unknown', retryAutomatically: false }, 502);
    return result;
  };
}
