import {authClient,authConfig} from '../../../../../../lib/supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../../lib/agent-auth.ts';
import {createExplorationIntentRoute} from '../../../../../../lib/exploration-intent-route.ts';
import {createExplorationIntentStore} from '../../../../../../lib/exploration-intent-store.ts';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const config=authConfig();if(!config)return Response.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return createExplorationIntentRoute({appOrigin:config.app,allowCreate:false,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:async(actor,projectId)=>ownsSupabaseProject({actor,projectId,config}),store:createExplorationIntentStore(config)}).revoke(request);
}
