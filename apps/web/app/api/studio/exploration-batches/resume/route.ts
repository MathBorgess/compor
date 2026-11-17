import {createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {agentSigningKey} from '../../../../../lib/agent-config.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {withWebOpenAiCredential} from '../../../../../lib/web-openai-credential.ts';
import {createExplorationParallelResumeRoute} from '../../../../../lib/exploration-parallel-resume-route.ts';
import {createExplorationParallelResumeStore} from '../../../../../lib/exploration-parallel-resume-store.ts';
import {createVisualAuthority} from '../../../../../lib/visual-authority.ts';
import {selectedVisualsAvailable} from '../../../../../lib/selected-visual-availability.ts';

export const runtime='nodejs';export const dynamic='force-dynamic';
const unavailable=()=>Response.json({status:'unavailable',retryAutomatically:false},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const config=authConfig(),secret=agentSigningKey();if(!config||!secret||process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED!=='true')return unavailable();
 return withWebOpenAiCredential(request,config,{bodyLimit:65536,bodyTooLargeStatus:413},async prepared=>{
  if(!prepared.apiKey)return Response.json({error:'invalid_request'},{status:400,headers:{'Cache-Control':'no-store'}});
  const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey});
  return createExplorationParallelResumeRoute({appOrigin:config.app,apiKey:prepared.apiKey,bindings,allowResume:()=>process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED==='true',resolveActor:async()=>prepared.actor??resolveSupabaseActor(await authClient(config)),ownsProject:async(actor,projectId)=>ownsSupabaseProject({actor,projectId,config}),store:createExplorationParallelResumeStore(config),authorizeVisualInput:async()=>true,prepareVisualAuthority:createVisualAuthority(config,process.env.COMPOR_REFERENCE_AUTHORITY_ENABLED==='true'&&selectedVisualsAvailable(true))}).resume(prepared.request);
 });
}
