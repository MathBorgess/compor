import { createPrivateImageHandler } from '@compor/private-images';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor } from '../../../lib/agent-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request) {
  const config = authConfig();
  if (process.env.COMPOR_PRIVATE_IMAGES_ENABLED !== 'true' || !config) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    return await createPrivateImageHandler({
      appOrigin: config.app,
      supabaseUrl: config.service,
      publishableKey: config.key,
      authenticate: async () => resolveSupabaseActor(await authClient(config)),
    })(request);
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = handle;
export const POST = handle;
