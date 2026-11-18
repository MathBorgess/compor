import {authClient,authConfig} from '../../../../../../lib/supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../../lib/agent-auth.ts';
import {createExplorationParallelResumeRoute} from '../../../../../../lib/exploration-parallel-resume-route.ts';
import {createExplorationParallelResumeStore} from '../../../../../../lib/exploration-parallel-resume-store.ts';

export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const config=authConfig();if(!config)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return createExplorationParallelResumeRoute({appOrigin:config.app,allowResume:()=>false,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:async(actor,projectId)=>ownsSupabaseProject({actor,projectId,config}),store:createExplorationParallelResumeStore(config)}).status(request);
}
