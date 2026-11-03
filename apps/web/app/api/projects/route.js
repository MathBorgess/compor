import { createSupabaseProjectStore } from '@compor/remote-mcp';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor } from '../../../lib/agent-auth.mjs';
import { createProjectRoutes } from '../../../lib/project-route.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(method, request) {
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const routes = createProjectRoutes({
      appOrigin: config.app,
      resolveActor: async () => resolveSupabaseActor(await authClient(config)),
      projectStore: createSupabaseProjectStore({ url: config.service, anonKey: config.key }),
    });
    return await routes[method](request);
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}

export const GET = request => handle('GET', request);
export const POST = request => handle('POST', request);
