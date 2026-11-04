import { createAgentHandler } from './index.mjs';

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Server-side seam; do not connect until the attempt store is durable and authorized. */
export function createProjectAgentHandler({ appOrigin, resolveActor, ownsProject, attempts, bindings, fetch } = {}) {
  return async request => {
    if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
    if (typeof appOrigin !== 'string' || typeof resolveActor !== 'function' || typeof ownsProject !== 'function' ||
        typeof attempts?.start !== 'function' || typeof attempts?.finish !== 'function' || typeof bindings?.issue !== 'function') return response({ error: 'unavailable' }, 503);
    if (request.headers.get('origin') !== appOrigin) return response({ error: 'invalid_origin' }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return response({ error: 'invalid_request' }, 400);
    const projectId = request.headers.get('x-compor-project-id');
    const idempotencyKey = request.headers.get('x-compor-attempt-id');
    if (!projectIdPattern.test(projectId ?? '') || !projectIdPattern.test(idempotencyKey ?? '')) return response({ error: 'invalid_request' }, 400);
    let actor;
    try { actor = await resolveActor(); } catch { return response({ error: 'unavailable' }, 503); }
    if (!actor || typeof actor.userId !== 'string' || !actor.userId || typeof actor.token !== 'string' || !actor.token) return response({ error: 'unauthorized' }, 401);
    try { if (!await ownsProject({ actor, projectId })) return response({ error: 'forbidden' }, 403); }
    catch { return response({ error: 'unavailable' }, 503); }
    let attempt;
    try {
      attempt = await attempts.start({ actor, projectId, idempotencyKey });
      if (!attempt || typeof attempt.id !== 'string' || !['started', 'completed', 'unknown'].includes(attempt.state) || typeof attempt.isNew !== 'boolean' || (attempt.isNew && attempt.state !== 'started')) throw new Error('invalid attempt');
    }
    catch { return response({ error: 'unavailable' }, 503); }
    if (!attempt.isNew) return response({ error: 'attempt_exists', state: attempt.state, retryAutomatically: false }, 409);
    let result;
    try { result = await createAgentHandler({ authenticate: async () => ({ userId: actor.userId }), fetch })(request); }
    catch { result = response({ error: 'upstream_error' }, 502); }
    if (result.ok) {
      try {
        const data = await result.json();
        const sessionBinding = bindings.issue({ userId: actor.userId, projectId, attemptId: attempt.id, sessionId: data.sessionId });
        if (typeof sessionBinding !== 'string' || !sessionBinding) throw new Error('invalid binding');
        result = response({ sessionId: data.sessionId, text: data.text, usage: data.usage, sessionBinding }, 200);
      } catch { result = response({ error: 'result_unknown', retryAutomatically: false }, 502); }
    }
    const state = result.ok ? 'completed' : 'unknown';
    try { await attempts.finish({ actor, projectId, attemptId: attempt.id, state }); }
    catch { return response({ error: 'result_unknown', retryAutomatically: false }, 502); }
    if (result.status === 502) return response({ error: 'result_unknown', retryAutomatically: false }, 502);
    return result;
  };
}
