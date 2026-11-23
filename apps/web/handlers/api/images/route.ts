import { createPrivateImageHandler } from '@compor/private-images';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor } from '../../../lib/agent-auth.ts';
import { validatePrivateCarouselJpeg } from '../../../lib/private-image-carousel-jpeg.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request:Request) {
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
      validateCarouselJpeg: validatePrivateCarouselJpeg,
      allowCarouselJpegUploads: process.env.COMPOR_CAROUSEL_RENDER_ENABLED === 'true',
    })(request);
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = handle;
export const POST = handle;
