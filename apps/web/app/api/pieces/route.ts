import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../lib/agent-auth.ts';
import { createProjectPieceStore } from '../../../lib/piece-store.ts';
import { createPieceRoutes } from '../../../lib/piece-route.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(method:'GET'|'POST'|'PATCH', request:Request) {
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    return await createPieceRoutes({ appOrigin: config.app, resolveActor: async () => resolveSupabaseActor(await authClient(config)), ownsProject: (actor, projectId) => ownsSupabaseProject({ config, actor, projectId }), pieceStore: createProjectPieceStore({ url: config.service, anonKey: config.key }) })[method](request);
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
export const GET = (request:Request) => handle('GET', request);
export const POST = (request:Request) => handle('POST', request);
export const PATCH = (request:Request) => handle('PATCH', request);
