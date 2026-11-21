import * as z from './schema.ts';
import type {Actor} from './agent-auth.ts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestSchema = z.object({
  projectId: z.string(),
  pieceId: z.string(),
  version: z.number(),
  assetId: z.string(),
});
const bindResultSchema = z.object({
  status: z.enum(['bound', 'conflict', 'not_found']),
  assetId: z.optional(z.string()),
});
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const isUuid = (value: string) => uuidPattern.test(value);

function publicKey(value: string) {
  if (/\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

async function readJson(request: Request) {
  if (!request.body) throw Error('missing');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw Error('large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)) as unknown;
}

type Dependencies = {
  appOrigin: string;
  supabaseUrl: string;
  publishableKey: string;
  authenticate: (request: Request) => Promise<Actor | null>;
  fetch?: typeof fetch;
};

export function createPieceVersionImageRoute({appOrigin, supabaseUrl, publishableKey, authenticate, fetch: fetchApi = fetch}: Dependencies) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || !publicKey(publishableKey) || typeof authenticate !== 'function' || typeof appOrigin !== 'string') throw Error('invalid configuration');
  const headersFor = (actor: Actor) => ({apikey: publishableKey, authorization: `Bearer ${actor.token}`});

  async function actorOf(request: Request) {
    const actor = await authenticate(request);
    if (!actor || !isUuid(actor.userId) || !/^[^\s]{1,8192}$/.test(actor.token)) return null;
    return actor;
  }

  return {
    async GET(request: Request) {
      const query = new URL(request.url).searchParams;
      const projectId = query.get('projectId') ?? '';
      const pieceId = query.get('pieceId') ?? '';
      const version = query.get('version') ?? '';
      if (query.getAll('projectId').length !== 1 || query.getAll('pieceId').length !== 1 || query.getAll('version').length !== 1 || !isUuid(projectId) || !isUuid(pieceId) || !/^[1-9][0-9]{0,9}$/.test(version) || Number(version) > 2147483647) return reply({error: 'invalid_request'}, 400);
      let actor: Actor | null;
      try { actor = await actorOf(request); }
      catch { return reply({error: 'unavailable'}, 503); }
      if (!actor) return reply({error: 'unauthorized'}, 401);
      try {
        const endpoint = new URL('/rest/v1/piece_version_images', origin);
        endpoint.searchParams.set('select', 'asset_id');
        endpoint.searchParams.set('project_id', `eq.${projectId.toLowerCase()}`);
        endpoint.searchParams.set('piece_id', `eq.${pieceId.toLowerCase()}`);
        endpoint.searchParams.set('version', `eq.${version}`);
        endpoint.searchParams.set('limit', '1');
        const result = await fetchApi(endpoint, {headers: headersFor(actor), redirect: 'error', signal: AbortSignal.timeout(5000)});
        if (!result.ok) return reply({error: 'unavailable'}, 503);
        const rows: unknown = await result.json();
        if (!Array.isArray(rows) || rows.length > 1) return reply({error: 'unavailable'}, 503);
        if (!rows.length) return reply({assetId: null});
        const parsed = z.object({asset_id: z.string()}).safeParse(rows[0]);
        if (!parsed.success || !isUuid(parsed.data.asset_id)) return reply({error: 'unavailable'}, 503);
        return reply({assetId: parsed.data.asset_id.toLowerCase()});
      } catch { return reply({error: 'unavailable'}, 503); }
    },
    async POST(request: Request) {
      if (request.headers.get('origin') !== appOrigin) return reply({error: 'invalid_origin'}, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({error: 'invalid_request'}, 400);
      let data: z.infer<typeof requestSchema>;
      try { data = requestSchema.parse(await readJson(request)); }
      catch { return reply({error: 'invalid_request'}, 400); }
      if (!isUuid(data.projectId) || !isUuid(data.pieceId) || !isUuid(data.assetId) || !Number.isSafeInteger(data.version) || data.version < 1 || data.version > 2147483647) return reply({error: 'invalid_request'}, 400);
      let actor: Actor | null;
      try { actor = await actorOf(request); }
      catch { return reply({error: 'unavailable'}, 503); }
      if (!actor) return reply({error: 'unauthorized'}, 401);
      try {
        const endpoint = new URL('/rest/v1/rpc/bind_piece_version_image', origin);
        const result = await fetchApi(endpoint, {
          method: 'POST',
          headers: {...headersFor(actor), 'content-type': 'application/json'},
          body: JSON.stringify({
            p_project_id: data.projectId.toLowerCase(),
            p_piece_id: data.pieceId.toLowerCase(),
            p_version: data.version,
            p_asset_id: data.assetId.toLowerCase(),
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        if (!result.ok) return reply({error: 'unavailable'}, 503);
        const parsed = bindResultSchema.safeParse(await result.json());
        if (!parsed.success) return reply({error: 'unavailable'}, 503);
        if (parsed.data.status === 'not_found') return reply({status: 'not_found'}, 404);
        if (parsed.data.status === 'conflict') {
          if (!parsed.data.assetId || !isUuid(parsed.data.assetId)) return reply({error: 'unavailable'}, 503);
          return reply({status: 'conflict', assetId: parsed.data.assetId.toLowerCase()});
        }
        if (!parsed.data.assetId || parsed.data.assetId.toLowerCase() !== data.assetId.toLowerCase()) return reply({error: 'unavailable'}, 503);
        return reply({status: 'bound', assetId: parsed.data.assetId.toLowerCase()});
      } catch { return reply({error: 'unavailable'}, 503); }
    },
  };
}
