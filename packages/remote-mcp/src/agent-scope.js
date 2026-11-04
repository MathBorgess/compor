import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { createRemoteMcpHandler } from './index.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const tokenOK = value => typeof value === 'string' && /^[^\s]{1,8192}$/.test(value);
const denied = () => new Response('Autenticação necessária.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
const unavailable = () => new Response('Serviço indisponível.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
const aad = Buffer.from('compor-agent-mcp-delegation-v1');

// Internal boundary: all dependencies and the dedicated 256-bit key are server-owned.
export function createAgentScope({ secret, authenticate, ownsProject, pieceStore, now = Date.now } = {}) {
  if (!Buffer.isBuffer(secret) || secret.length !== 32 || typeof authenticate !== 'function' || typeof ownsProject !== 'function' || typeof pieceStore?.list !== 'function' || typeof pieceStore?.save !== 'function' || typeof now !== 'function') throw Error('invalid configuration');
  const key = Buffer.from(secret);
  async function issue({ token, projectId } = {}) {
    if (!tokenOK(token) || !uuid(projectId)) return null;
    try {
      const actor = await authenticate(token);
      if (!uuid(actor?.userId) || !await ownsProject(actor, projectId.toLowerCase(), token)) return null;
      const payload = Buffer.from(JSON.stringify({ sub: actor.userId.toLowerCase(), project: projectId.toLowerCase(), token, exp: Math.floor(now() / 1000) + 300 }));
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
      return Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64url');
    } catch { return null; }
  }
  async function handle(request) {
    const grant = /^Bearer ([A-Za-z0-9_-]{1,16384})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!grant) return denied();
    let claims;
    try {
      const raw = Buffer.from(grant, 'base64url');
      if (raw.length < 29 || raw.toString('base64url') !== grant) return denied();
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAAD(aad);
      decipher.setAuthTag(raw.subarray(-16));
      claims = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]).toString('utf8'));
    } catch { return denied(); }
    const current = Math.floor(now() / 1000);
    if (!uuid(claims?.sub) || !uuid(claims?.project) || !tokenOK(claims?.token) || !Number.isSafeInteger(claims?.exp) || claims.exp <= current || claims.exp > current + 300) return denied();
    try {
      const actor = await authenticate(claims.token);
      if (!uuid(actor?.userId) || actor.userId.toLowerCase() !== claims.sub) return denied();
      const scoped = {};
      for (const method of ['list', 'save']) scoped[method] = async (context, args) => {
        if (args.projectId.toLowerCase() !== claims.project || Math.floor(now() / 1000) >= claims.exp || !await ownsProject(actor, claims.project, claims.token)) throw Error('denied');
        return pieceStore[method](context, args);
      };
      const headers = new Headers(request.headers);
      headers.set('authorization', `Bearer ${claims.token}`);
      const internal = new Request(request, { headers });
      return await createRemoteMcpHandler({ authenticate: async value => value === claims.token ? actor : null, pieceStore: scoped })(internal);
    } catch { return unavailable(); }
  }
  return { issue, handle };
}

// appOrigin and scope are trusted deployment configuration, not request input.
export async function withAgentMcpTool({ appOrigin, scope, token, projectId } = {}, submit) {
  let origin;
  try {
    const parsed = new URL(appOrigin);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.origin !== parsed.href.slice(0, -1) || parsed.username || parsed.password || parsed.port || isIP(host) || host.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /\.(?:localhost|local|internal|invalid|test|example)$/.test(host)) return { status: 'unavailable' };
    origin = parsed.origin;
  } catch { return { status: 'unavailable' }; }
  if (!tokenOK(token) || !uuid(projectId) || typeof scope?.issue !== 'function' || typeof submit !== 'function') return { status: 'unavailable' };
  let grant;
  try { grant = await scope.issue({ token, projectId }); } catch { return { status: 'unavailable' }; }
  if (typeof grant !== 'string' || !grant) return { status: 'unavailable' };
  try {
    await submit({ type: 'mcp', server_label: 'compor', connection_origin: 'service', required: true,
      allowed_tools: ['prepare_brief', 'list_piece_versions', 'save_piece_version'],
      transport: { type: 'http', server_url: `${origin}/api/agent-mcp`, authorization: `Bearer ${grant}` } });
    return { status: 'invoked' };
  } catch { return { status: 'result_unknown', retryAutomatically: false }; }
}
