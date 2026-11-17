import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {createExplorationBatchStore} from '../../../../../lib/exploration-batch-store.ts';
import {createExplorationPlannerStore} from '../../../../../lib/exploration-planner-store.ts';
import {createExplorationRecoveryStatusRoute} from '../../../../../lib/exploration-recovery-status-route.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const config=authConfig();if(!config)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return createExplorationRecoveryStatusRoute({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),getBatch:createExplorationBatchStore(config).getBatch,getPlan:createExplorationPlannerStore(config).get}).batch(request);
}
