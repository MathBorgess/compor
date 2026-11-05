const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function bodyText(request) {
  if (!request.body) throw new Error('missing body');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error('body too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export function createProjectRoutes({ appOrigin, resolveActor, projectStore } = {}) {
  async function authorized() {
    if (typeof resolveActor !== 'function' || !projectStore) return null;
    return resolveActor();
  }
  return {
    async GET() {
      try {
        const actor = await authorized();
        if (!actor?.userId || !actor?.token) return reply({ error: 'unauthorized' }, 401);
        const projects = await projectStore.list({ actor: { userId: actor.userId }, token: actor.token });
        return reply({ projects });
      } catch { return reply({ error: 'unavailable' }, 503); }
    },
    async POST(request) {
      if (!appOrigin || request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
      let actor;
      try { actor = await authorized(); }
      catch { return reply({ error: 'unavailable' }, 503); }
      if (!actor?.userId || !actor?.token) return reply({ error: 'unauthorized' }, 401);
      let data;
      try { data = JSON.parse(await bodyText(request)); }
      catch { return reply({ error: 'invalid_request' }, 400); }
      if (typeof data?.title !== 'string' || !data.title.trim() || data.title.trim().length > 200) return reply({ error: 'invalid_request' }, 400);
      try {
        const project = await projectStore.create({ actor: { userId: actor.userId }, token: actor.token }, data.title.trim());
        return reply({ project }, 201);
      } catch { return reply({ error: 'result_unknown', retryAutomatically: false }, 502); }
    },
    async PATCH(request) {
      if (!appOrigin || request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
      let actor;
      try { actor = await authorized(); } catch { return reply({ error: 'unavailable' }, 503); }
      if (!actor?.userId || !actor?.token) return reply({ error: 'unauthorized' }, 401);
      let data;
      try { data = JSON.parse(await bodyText(request)); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!data || Object.keys(data).sort().join(',') !== 'expectedRevision,projectId,title' || !uuid(data.projectId) || typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 200 || !Number.isInteger(data.expectedRevision) || data.expectedRevision < 1 || data.expectedRevision > 2147483646) return reply({ error: 'invalid_request' }, 400);
      try {
        const result = await projectStore.rename({ actor: { userId: actor.userId }, token: actor.token }, { projectId: data.projectId, title: data.title.trim(), expectedRevision: data.expectedRevision });
        return reply(result, result.status === 'conflict' ? 409 : result.status === 'not_found' ? 404 : 200);
      } catch { return reply({ error: 'result_unknown', retryAutomatically: false }, 502); }
    },
  };
}
