import { createProjectAgentHandler } from '@compor/agents-api/project-route';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../lib/agent-auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const config = authConfig();
  if (!config) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return createProjectAgentHandler({
    appOrigin: config.app,
    resolveActor: async () => resolveSupabaseActor(await authClient(config)),
    ownsProject: args => ownsSupabaseProject({ ...args, config }),
    // Deliberately absent: no paid calls until a durable, authorized attempt store exists.
    attempts: undefined,
  })(request);
}
