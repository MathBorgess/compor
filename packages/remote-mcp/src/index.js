import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

const unauthorized = () => new Response('Autenticação necessária.', { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } });
const unavailable = () => new Response('Serviço indisponível.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
const tooLarge = () => new Response('Requisição muito grande.', { status: 413, headers: { 'Cache-Control': 'no-store' } });
const MAX_BODY_BYTES = 64 * 1024;

async function boundedRequest(request) {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: request.method, headers: request.headers, body, signal: request.signal, duplex: 'half' });
}

/** Verify a user's token with the configured Supabase Auth service, not local JWT decoding. */
export function createSupabaseAuthenticator({ url, anonKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !anonKey?.trim()) {
    throw new Error('Configuração de autenticação inválida.');
  }
  const endpoint = new URL('/auth/v1/user', base);
  return async token => {
    const response = await fetchImpl(endpoint, {
      method: 'GET', headers: { apikey: anonKey, authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error('Serviço de identidade indisponível.');
    const user = await response.json();
    return typeof user?.id === 'string' && user.id.trim() ? { userId: user.id } : null;
  };
}

/** Access PostgREST as the authenticated user; database RLS remains mandatory. */
export function createSupabaseProjectStore({ url, anonKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !anonKey?.trim()) {
    throw new Error('Configuração de armazenamento inválida.');
  }
  async function request({ actor, token, title }) {
    const endpoint = new URL('/rest/v1/projects', base);
    endpoint.searchParams.set('select', 'id,owner_id,title,created_at');
    if (title === undefined) endpoint.searchParams.set('owner_id', `eq.${actor.userId}`);
    const response = await fetchImpl(endpoint, {
      method: title === undefined ? 'GET' : 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
      ...(title === undefined ? {} : { body: JSON.stringify({ title }) }),
      redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Serviço de projetos indisponível.');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => row.owner_id !== actor.userId || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string')) {
      throw new Error('Resposta inválida do serviço de projetos.');
    }
    return rows.map(({ id, title, created_at }) => ({ id, title, created_at }));
  }
  return {
    async create(context, title) {
      const rows = await request({ ...context, title });
      if (rows.length !== 1) throw new Error('Resposta inválida do serviço de projetos.');
      return rows[0];
    },
    list: context => request(context),
  };
}

/** Stateless HTTP boundary. `authenticate` is a trusted server-side adapter, never tool input. */
export function createRemoteMcpHandler({ authenticate, projectStore } = {}) {
  return async function handle(request) {
    const header = request.headers.get('authorization') ?? '';
    const match = /^Bearer ([^\s]{1,8192})$/i.exec(header);
    if (!match) return unauthorized();
    if (typeof authenticate !== 'function') return unavailable();
    let actor;
    try { actor = await authenticate(match[1]); } catch { return unavailable(); }
    if (!actor || typeof actor.userId !== 'string' || !actor.userId.trim()) return unauthorized();

    let bounded;
    try { bounded = await boundedRequest(request); } catch { return new Response('Requisição inválida.', { status: 400 }); }
    if (!bounded) return tooLarge();
    const server = new McpServer({ name: 'compor-remote', version: '0.1.0' });
    server.registerTool('prepare_brief', {
      description: 'Organiza fatos fornecidos e aponta campos ausentes. Não inventa, persiste ou confirma dados.',
      inputSchema: {
        objective: z.string().trim().min(1).max(500),
        audience: z.string().trim().min(1).max(500).optional(),
        offer: z.string().trim().min(1).max(500).optional(),
        format: z.string().trim().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async ({ objective, audience, offer, format }) => {
      const missing = [['audience', audience], ['offer', offer], ['format', format]].filter(([, value]) => value === undefined).map(([key]) => key);
      const result = { objective, audience: audience ?? null, offer: offer ?? null, format: format ?? null, missing, persists_data: false };
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    });

    if (projectStore) {
      const context = { actor, token: match[1] };
      const error = () => ({ isError: true, content: [{ type: 'text', text: 'Não foi possível acessar os projetos. Tente novamente mais tarde.' }] });
      server.registerTool('create_project', {
        description: 'Cria um projeto privado para a conta autenticada.',
        inputSchema: { title: z.string().trim().min(1).max(200) },
        annotations: { destructiveHint: false, openWorldHint: false },
      }, async ({ title }) => {
        try {
          const result = { project: await projectStore.create(context, title) };
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        } catch { return error(); }
      });
      server.registerTool('list_projects', {
        description: 'Lista projetos privados da conta autenticada.', inputSchema: {},
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      }, async () => {
        try {
          const result = { projects: await projectStore.list(context) };
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        } catch { return error(); }
      });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(bounded);
      const body = response.body ? await response.text() : null;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(body, { status: response.status, headers });
    } finally {
      await server.close();
    }
  };
}
