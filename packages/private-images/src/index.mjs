import { createHash } from 'node:crypto';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_HTTP_BYTES = 4 * 1024 * 1024;
const PART_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function publicKey(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { const parts = value.split('.'); return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon'; }
  catch { return false; }
}

async function readBounded(stream) {
  if (!stream) throw new Error('missing body');
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

function validPng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  return w > 0 && h > 0 && w <= MAX_DIMENSION && h <= MAX_DIMENSION;
}

/** Unwired boundary; authenticate must verify the exact user token with the identity provider. */
export function createPrivateImageHandler({ appOrigin, supabaseUrl, publishableKey, authenticate, fetch: fetchApi = globalThis.fetch } = {}) {
  const origin = new URL(supabaseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || !publicKey(publishableKey) || typeof authenticate !== 'function' || typeof appOrigin !== 'string') throw new Error('invalid configuration');
  return async request => {
    const method = request.method;
    if (!['GET', 'POST'].includes(method)) return reply({ error: 'method_not_allowed' }, 405);
    if (method === 'POST' && request.headers.get('origin') !== appOrigin) return reply({ error: 'invalid_origin' }, 403);
    if (method === 'POST' && request.headers.get('content-type') !== 'image/png') return reply({ error: 'invalid_request' }, 400);
    const query = new URL(request.url).searchParams;
    const project = query.get('projectId'), piece = query.get('pieceId'), asset = query.get('assetId'), ver = query.get('version');
    const part = query.get('part');
    if (query.getAll('part').length > 1 || (part !== null && (method !== 'GET' || !/^[0-3]$/.test(part)))) return reply({ error: 'invalid_request' }, 400);
    if (!uuid(project) || !uuid(piece) || !uuid(asset) || !/^[1-9][0-9]{0,9}$/.test(ver ?? '') || Number(ver) > 2147483647) return reply({ error: 'invalid_request' }, 400);
    let actor;
    try { actor = await authenticate(request); } catch { return reply({ error: 'unavailable' }, 503); }
    if (!uuid(actor?.userId) || typeof actor?.token !== 'string' || !/^[^\s]{1,8192}$/.test(actor.token)) return reply({ error: 'unauthorized' }, 401);
    const ids = [actor.userId, project, piece, asset].map(value => value.toLowerCase());
    const headers = { apikey: publishableKey, authorization: `Bearer ${actor.token}` };
    let bytes;
    if (method === 'POST') {
      try { bytes = await readBounded(request.body); } catch { return reply({ error: 'invalid_request' }, 400); }
      if (!validPng(bytes)) return reply({ error: 'invalid_request' }, 400);
    }
    const versionUrl = new URL('/rest/v1/piece_versions', origin);
    versionUrl.searchParams.set('select', 'project_id,piece_id,version,projects!inner(owner_id)');
    versionUrl.searchParams.set('project_id', `eq.${ids[1]}`);
    versionUrl.searchParams.set('piece_id', `eq.${ids[2]}`);
    versionUrl.searchParams.set('version', `eq.${ver}`);
    versionUrl.searchParams.set('projects.owner_id', `eq.${ids[0]}`);
    versionUrl.searchParams.set('limit', '1');
    try {
      const verified = await fetchApi(versionUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!verified.ok) return reply({ error: 'unavailable' }, 503);
      const rows = await verified.json();
      if (!Array.isArray(rows) || rows.length > 1) return reply({ error: 'unavailable' }, 503);
      if (!rows.length || rows[0]?.project_id !== ids[1] || rows[0]?.piece_id !== ids[2] || rows[0]?.version !== Number(ver) || rows[0]?.projects?.owner_id !== ids[0]) return reply({ error: 'not_found' }, 404);
    } catch { return reply({ error: 'unavailable' }, 503); }
    const path = `${ids[0]}/${ids[1]}/${ids[2]}/${ver}/${ids[3]}.png`;
    const endpoint = new URL(`/storage/v1/object/${method === 'GET' ? 'authenticated/' : ''}compor-project-images/${path}`, origin);
    try {
      const result = await fetchApi(endpoint, {
        method, headers: { ...headers, ...(method === 'POST' ? { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-upsert': 'false' } : {}) },
        ...(method === 'POST' ? { body: bytes } : {}), redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      if (method === 'POST') {
        if (result.status === 409) return reply({ error: 'asset_exists', retryAutomatically: false }, 409);
        if (!result.ok) return reply({ error: 'result_unknown', retryAutomatically: false }, 502);
        return reply({ status: 'stored', assetId: ids[3] }, 201);
      }
      if (result.status === 404) return reply({ error: 'not_found' }, 404);
      if (!result.ok || !/^image\/png(?:\s*;|$)/i.test(result.headers.get('content-type') ?? '')) return reply({ error: 'unavailable' }, 503);
      const image = await readBounded(result.body);
      if (!validPng(image)) return reply({ error: 'unavailable' }, 503);
      if (part !== null) {
        const index = Number(part), parts = Math.ceil(image.length / PART_BYTES);
        if (index >= parts) return reply({ error: 'invalid_request' }, 400);
        return new Response(image.subarray(index * PART_BYTES, Math.min((index + 1) * PART_BYTES, image.length)), { status: 200, headers: {
          'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'x-compor-part': String(index), 'x-compor-parts': String(parts), 'x-compor-size': String(image.length), 'x-compor-sha256': createHash('sha256').update(image).digest('hex'),
        } });
      }
      if (image.length > MAX_HTTP_BYTES) return Response.json({ error: 'image_requires_parts' }, { status: 413, headers: { 'cache-control': 'no-store', 'x-compor-chunked': '1' } });
      return new Response(image, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    } catch {
      return method === 'POST' ? reply({ error: 'result_unknown', retryAutomatically: false }, 502) : reply({ error: 'unavailable' }, 503);
    }
  };
}
