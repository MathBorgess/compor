import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { registerDeliberationTools } from '@compor/agile-deliberation';

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

const pieceContentSchema = z.strictObject({
  headline: z.string().max(500), price: z.string().max(100), date: z.string().max(100),
  caption: z.string().max(4000), captionOrigin: z.enum(['user', 'agent']),
});
const uuid = z.string().uuid();
const pieceVersionSchema = z.strictObject({
  project_id: uuid, piece_id: uuid, version: z.number().int().positive(),
  content: pieceContentSchema, created_at: z.string(),
});

/** Calls a transactional RPC and reads with both owner filtering and RLS. */
export function createSupabasePieceStore({ url, anonKey, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !anonKey?.trim()) {
    throw new Error('Configuração de armazenamento inválida.');
  }
  async function query(endpoint, context, body) {
    const response = await fetchImpl(endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${context.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Serviço de peças indisponível.');
    return response.json();
  }
  return {
    async listPieces(context, { projectId, after }) {
      const endpoint = new URL('/rest/v1/piece_versions', base);
      endpoint.searchParams.set('select', 'project_id,piece_id,version,content,created_at,projects!inner(owner_id)');
      endpoint.searchParams.set('project_id', `eq.${projectId}`);
      endpoint.searchParams.set('projects.owner_id', `eq.${context.actor.userId}`);
      if (after) endpoint.searchParams.set('piece_id', `gt.${after}`);
      endpoint.searchParams.set('order', 'piece_id.asc,version.desc');
      endpoint.searchParams.set('limit', '101');
      const rows = await query(endpoint, context);
      if (!Array.isArray(rows) || rows.length > 101) throw new Error('Resposta inválida do serviço de peças.');
      const pieces = [];
      let previousId = after ?? '';
      let previousVersion = 0;
      for (const { projects, ...row } of rows) {
        const version = pieceVersionSchema.parse(row);
        if (projects?.owner_id !== context.actor.userId || version.project_id !== projectId ||
            version.piece_id < previousId || (version.piece_id === previousId && (!previousVersion || version.version >= previousVersion))) {
          throw new Error('Resposta inválida do serviço de peças.');
        }
        if (version.piece_id !== previousId) pieces.push({ pieceId: version.piece_id, latestVersion: version.version, headline: version.content.headline, createdAt: version.created_at });
        previousId = version.piece_id;
        previousVersion = version.version;
      }
      const page = pieces.slice(0, 50);
      // The server may enforce a row cap below the requested limit. Continue
      // until an empty page instead of assuming a short response is complete.
      const nextCursor = page.length ? page.at(-1).pieceId : null;
      return { pieces: page, nextCursor };
    },
    async save(context, { projectId, pieceId, expectedVersion, content }) {
      const result = await query(new URL('/rest/v1/rpc/save_piece_version', base), context, {
        p_project_id: projectId, p_piece_id: pieceId, p_expected_version: expectedVersion, p_content: content,
      });
      if (result?.status === 'not_found') return { status: 'not_found' };
      if (result?.status === 'conflict' && Number.isSafeInteger(result.currentVersion) && result.currentVersion >= 0) {
        return { status: 'conflict', currentVersion: result.currentVersion };
      }
      const version = pieceVersionSchema.parse(result?.version);
      if (result.status !== 'saved' || version.project_id !== projectId || version.piece_id !== pieceId || version.version !== expectedVersion + 1) {
        throw new Error('Resposta inválida do serviço de peças.');
      }
      return { status: 'saved', version };
    },
    async list(context, { projectId, pieceId }) {
      const endpoint = new URL('/rest/v1/piece_versions', base);
      endpoint.searchParams.set('select', 'project_id,piece_id,version,content,created_at,projects!inner(owner_id)');
      endpoint.searchParams.set('project_id', `eq.${projectId}`);
      endpoint.searchParams.set('piece_id', `eq.${pieceId}`);
      endpoint.searchParams.set('projects.owner_id', `eq.${context.actor.userId}`);
      endpoint.searchParams.set('order', 'version.asc');
      const rows = await query(endpoint, context);
      if (!Array.isArray(rows)) throw new Error('Resposta inválida do serviço de peças.');
      return rows.map(({ projects, ...row }) => {
        const version = pieceVersionSchema.parse(row);
        if (projects?.owner_id !== context.actor.userId || version.project_id !== projectId || version.piece_id !== pieceId) throw new Error('Resposta inválida do serviço de peças.');
        return version;
      });
    },
  };
}

/** Stateless HTTP boundary. `authenticate` is a trusted server-side adapter, never tool input. */
export function createRemoteMcpHandler({ authenticate, projectStore, pieceStore } = {}) {
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
    registerDeliberationTools(server);
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

    if (pieceStore) {
      const context = { actor, token: match[1] };
      const error = () => ({ isError: true, content: [{ type: 'text', text: 'Não foi possível acessar as versões da peça.' }] });
      if (typeof pieceStore.listPieces === 'function') server.registerTool('list_pieces', {
        description: 'Lista peças de um projeto autorizado com a versão mais recente. Continue usando nextCursor até null; a paginação não é um snapshot.',
        inputSchema: { projectId: uuid, after: uuid.optional() },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      }, async ({ projectId, after }) => {
        try {
          const result = await pieceStore.listPieces(context, { projectId: projectId.toLowerCase(), after: after?.toLowerCase() });
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        } catch { return error(); }
      });
      server.registerTool('save_piece_version', {
        description: 'Salva versão imutável da peça, somente se a versão esperada corresponder à atual.',
        inputSchema: { projectId: uuid, pieceId: uuid, expectedVersion: z.number().int().min(0).max(2147483646), content: pieceContentSchema },
        annotations: { destructiveHint: false, openWorldHint: false },
      }, async args => {
        try {
          const result = await pieceStore.save(context, args);
          return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
        } catch { return error(); }
      });
      server.registerTool('list_piece_versions', {
        description: 'Lista versões de uma peça de um projeto da conta autenticada.',
        inputSchema: { projectId: uuid, pieceId: uuid },
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      }, async args => {
        try {
          const result = { versions: await pieceStore.list(context, args) };
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
