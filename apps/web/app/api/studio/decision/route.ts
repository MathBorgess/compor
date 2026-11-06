import { authClient, authConfig } from "../../../../lib/supabase.ts";
import { resolveSupabaseActor, ownsSupabaseProject } from "../../../../lib/agent-auth.ts";
import { createStudioDecisionRoute } from "../../../../lib/studio-decision-route.ts";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = authConfig();
  if (!config) return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return createStudioDecisionRoute({
    appOrigin: config.app,
    resolveActor: async () => resolveSupabaseActor(await authClient(config)),
    ownsProject: (actor, projectId) => ownsSupabaseProject({ config, actor, projectId }),
  })(request);
}
