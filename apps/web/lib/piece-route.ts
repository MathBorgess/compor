import {savePieceSchema,approvePieceSchema} from './web-contracts.ts';
import type {Actor} from './agent-auth.ts';
import type {PieceContent} from './studio-domain.ts';
import type {createProjectPieceStore} from './piece-store.ts';
const reply = (data:unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const uuid = (value:unknown):value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function validContent(value:PieceContent) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 5 &&
    (['headline', 'price', 'date', 'caption'] as const).every(k => typeof value[k] === 'string' && value[k].length <= (k === 'caption' ? 4000 : k === 'headline' ? 500 : 100)) &&
    ['user', 'agent'].includes(value.captionOrigin);
}
async function parseBody(request:Request):Promise<unknown> {
  if (!request.body) throw new Error();
  const reader = request.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 24 * 1024) throw new Error(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
export function createPieceRoutes({ appOrigin, resolveActor, ownsProject, pieceStore }: {appOrigin?:string;resolveActor?:()=>Promise<Actor|null>;ownsProject?:(actor:Actor,projectId:string)=>Promise<boolean>;pieceStore?:ReturnType<typeof createProjectPieceStore>} = {}) {
  async function check(projectId:unknown) {
    if (!uuid(projectId)) return { error: 'invalid_request', status: 400 };
    if(!resolveActor||!ownsProject||!pieceStore)throw Error('unavailable');
    const actor = await resolveActor();
    if (!actor?.userId || !actor.token) return { error: 'unauthorized', status: 401 };
    if (!await ownsProject(actor, projectId)) return { error: 'not_found', status: 404 };
    return { actor,projectId,pieceStore };
  }
  return {
    async GET(request:Request) {
      try {
        const projectId = new URL(request.url).searchParams.get('projectId');
        const auth = await check(projectId);
        if ('error' in auth) return reply({ error: auth.error }, auth.status);
        return reply({ versions: await auth.pieceStore.listProject({ actor: { userId: auth.actor.userId }, token: auth.actor.token }, auth.projectId) });
      } catch { return reply({ error: 'unavailable' }, 503); }
    },
    async POST(request:Request) {
      if (!appOrigin || request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
      let data;
      try { data = savePieceSchema.parse(await parseBody(request)); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!data || Object.keys(data).some(key => !['projectId','pieceId','expectedVersion','baseVersion','content'].includes(key)) || !uuid(data.projectId) || !uuid(data.pieceId) || !Number.isInteger(data.expectedVersion) || data.expectedVersion < 0 || data.expectedVersion > 2147483646 || !validContent(data.content) ||
        data.baseVersion !== undefined && (!Number.isInteger(data.baseVersion) || data.baseVersion < 0 || data.baseVersion > data.expectedVersion || data.expectedVersion > 0 && data.baseVersion === 0)) return reply({ error: 'invalid_request' }, 400);
      let auth;
      try { auth = await check(data.projectId); } catch { return reply({ error: 'unavailable' }, 503); }
      if ('error' in auth) return reply({ error: auth.error }, auth.status);
      try {
        const result = await auth.pieceStore.save({ actor: { userId: auth.actor.userId }, token: auth.actor.token }, { projectId: data.projectId, pieceId: data.pieceId, expectedVersion: data.expectedVersion, content: data.content, ...(data.baseVersion === undefined ? {} : { baseVersion: data.baseVersion }) });
        return reply(result, result.status === 'conflict' ? 409 : result.status === 'not_found' ? 404 : 200);
      } catch { return reply({ error: 'result_unknown', retryAutomatically: false }, 502); }
    },
    async PATCH(request:Request) {
      if (!appOrigin || request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
      let data;
      try { data = approvePieceSchema.parse(await parseBody(request)); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!data || data.operation !== 'approve' || !uuid(data.projectId) || !uuid(data.pieceId) || !Number.isInteger(data.version) || data.version < 1 || data.version > 2147483647 || !Number.isInteger(data.expectedRevision) || data.expectedRevision < 0 || data.expectedRevision > 2147483646) return reply({ error: 'invalid_request' }, 400);
      let auth;
      try { auth = await check(data.projectId); } catch { return reply({ error: 'unavailable' }, 503); }
      if ('error' in auth) return reply({ error: auth.error }, auth.status);
      try {
        const result = await auth.pieceStore.approve({ actor: { userId: auth.actor.userId }, token: auth.actor.token }, { projectId: data.projectId, pieceId: data.pieceId, version: data.version, expectedRevision: data.expectedRevision, ...(data.references===undefined?{}:{references:data.references}) });
        return reply(result, result.status === 'conflict' ? 409 : result.status === 'not_found' ? 404 : 200);
      } catch { return reply({ error: 'result_unknown', retryAutomatically: false }, 502); }
    },
  };
}
