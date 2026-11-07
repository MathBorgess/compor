import { authClient,authConfig } from '../../../../../lib/supabase.ts';
import { resolveSupabaseActor,ownsSupabaseProject } from '../../../../../lib/agent-auth.ts';
import { createGeneratedFeedbackRoute } from '../../../../../lib/generated-feedback-route.ts';
import { createGeneratedFeedbackStore } from '../../../../../lib/generated-feedback-store.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const config=authConfig();if(!config)return Response.json({error:'unavailable'},{status:503});
  return createGeneratedFeedbackRoute({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),store:actor=>createGeneratedFeedbackStore({config,actor})})(request);
}
