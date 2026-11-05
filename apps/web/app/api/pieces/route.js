import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../lib/agent-auth.mjs';
import { createProjectPieceStore } from '../../../lib/piece-store.mjs';
import { createPieceRoutes } from '../../../lib/piece-route.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(method, request) {
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    return await createPieceRoutes({ appOrigin: config.app, resolveActor: async () => resolveSupabaseActor(await authClient(config)), ownsProject: (actor, projectId) => ownsSupabaseProject({ config, actor, projectId }), pieceStore: createProjectPieceStore({ url: config.service, anonKey: config.key }) })[method](request);
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
export const GET = request => handle('GET', request);
export const POST = request => handle('POST', request);
export const PATCH = request => handle('PATCH', request);
