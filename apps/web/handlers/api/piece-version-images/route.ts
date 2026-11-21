import {createPieceVersionImageRoute} from '../../../lib/piece-version-image-route.ts';
import {authClient, authConfig} from '../../../lib/supabase';
import {resolveSupabaseActor} from '../../../lib/agent-auth.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(method: 'GET' | 'POST', request: Request) {
  const config = authConfig();
  if (process.env.COMPOR_PRIVATE_IMAGES_ENABLED !== 'true' || !config) {
    return Response.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
  try {
    return await createPieceVersionImageRoute({
      appOrigin: config.app,
      supabaseUrl: config.service,
      publishableKey: config.key,
      authenticate: async () => resolveSupabaseActor(await authClient(config)),
    })[method](request);
  } catch {
    return Response.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}

export const GET = (request: Request) => handle('GET', request);
export const POST = (request: Request) => handle('POST', request);
