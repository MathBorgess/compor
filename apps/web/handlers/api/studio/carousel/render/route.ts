import { resolveSupabaseActor, ownsSupabaseProject } from '../../../../../lib/agent-auth.ts';
import { createCarouselRenderRoute } from '../../../../../lib/carousel-render-route.ts';
import { authClient, authConfig } from '../../../../../lib/supabase.ts';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (process.env.COMPOR_CAROUSEL_RENDER_ENABLED !== 'true') return Response.json({ error: 'not_found' }, { status: 404, headers });
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers });
  return createCarouselRenderRoute({
    appOrigin: config.app,
    resolveActor: async () => resolveSupabaseActor(await authClient(config)),
    ownsProject: (actor, projectId) => ownsSupabaseProject({ config, actor, projectId }),
  })(request);
}
