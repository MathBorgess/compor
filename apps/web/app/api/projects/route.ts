import { createWebProjectStore } from '../../../lib/project-store.ts';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor } from '../../../lib/agent-auth.ts';
import { createProjectRoutes } from '../../../lib/project-route.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(method:'GET'|'POST'|'PATCH', request:Request) {
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const routes = createProjectRoutes({
      appOrigin: config.app,
      resolveActor: async () => resolveSupabaseActor(await authClient(config)),
      projectStore: createWebProjectStore({ url: config.service, anonKey: config.key }),
    });
    return await routes[method](request);
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}

export const GET = (request:Request) => handle('GET', request);
export const POST = (request:Request) => handle('POST', request);
export const PATCH = (request:Request) => handle('PATCH', request);
