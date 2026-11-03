const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function validContent(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 5 &&
    ['headline', 'price', 'date', 'caption'].every(k => typeof value[k] === 'string' && value[k].length <= (k === 'caption' ? 4000 : k === 'headline' ? 500 : 100)) &&
    ['user', 'agent'].includes(value.captionOrigin);
}
async function parseBody(request) {
  if (!request.body) throw new Error();
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 24 * 1024) throw new Error(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
export function createPieceRoutes({ appOrigin, resolveActor, ownsProject, pieceStore } = {}) {
  async function check(projectId) {
    if (!uuid(projectId)) return { error: 'invalid_request', status: 400 };
    const actor = await resolveActor();
    if (!actor?.userId || !actor.token) return { error: 'unauthorized', status: 401 };
    if (!await ownsProject(actor, projectId)) return { error: 'not_found', status: 404 };
    return { actor };
  }
  return {
    async GET(request) {
      try {
        const projectId = new URL(request.url).searchParams.get('projectId');
        const auth = await check(projectId);
        if (auth.error) return reply({ error: auth.error }, auth.status);
        return reply({ versions: await pieceStore.listProject({ actor: { userId: auth.actor.userId }, token: auth.actor.token }, projectId) });
      } catch { return reply({ error: 'unavailable' }, 503); }
    },
    async POST(request) {
      if (!appOrigin || request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
      let data;
      try { data = await parseBody(request); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!uuid(data?.projectId) || !uuid(data?.pieceId) || !Number.isInteger(data?.expectedVersion) || data.expectedVersion < 0 || data.expectedVersion > 2147483646 || !validContent(data.content)) return reply({ error: 'invalid_request' }, 400);
      let auth;
      try { auth = await check(data.projectId); } catch { return reply({ error: 'unavailable' }, 503); }
      if (auth.error) return reply({ error: auth.error }, auth.status);
      try {
        const result = await pieceStore.save({ actor: { userId: auth.actor.userId }, token: auth.actor.token }, { projectId: data.projectId, pieceId: data.pieceId, expectedVersion: data.expectedVersion, content: data.content });
        return reply(result, result.status === 'conflict' ? 409 : result.status === 'not_found' ? 404 : 200);
      } catch { return reply({ error: 'result_unknown', retryAutomatically: false }, 502); }
    },
  };
}
