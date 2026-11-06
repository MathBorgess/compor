import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {resolveSupabaseActor,ownsSupabaseProject} from '../../../../../lib/agent-auth.ts';
import {createReferenceSearchRoute} from '../../../../../lib/reference-exploration-route.ts';
import {createReferenceSignalStore} from '../../../../../lib/reference-signal-store.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;
export async function POST(request:Request) {
  const config=authConfig();if(!config)return Response.json({error:'unavailable'},{status:503});
  return createReferenceSearchRoute({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),store:actor=>createReferenceSignalStore({config,actor})})(request);
}
