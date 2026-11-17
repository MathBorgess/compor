import {createExplorationPlanner,createExplorationPlannerBindings} from '@compor/agents-api/exploration-planner';
import {createManagedExplorationPlanProvider} from '@compor/agents-api/exploration-plan-provider';
import {createExplorationPlannerStore} from '../../../../../lib/exploration-planner-store.ts';
import {guardExplorationPlannerProvider} from '../../../../../lib/exploration-intent.ts';
import {createExplorationPlannerRoute} from '../../../../../lib/exploration-planner-route.ts';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {agentSigningKey} from '../../../../../lib/agent-config.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {withWebOpenAiCredential} from '../../../../../lib/web-openai-credential.ts';
import {parallelExplorationAvailable} from '../../../../../lib/parallel-exploration-availability.ts';
import {selectedVisualsAvailable} from '../../../../../lib/selected-visual-availability.ts';
import {MAX_VISUAL_REQUEST_BYTES} from '@compor/agents-api/visual-input-contract';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const unavailable=()=>Response.json({status:'unavailable',retryAutomatically:false},{status:503,headers:{'Cache-Control':'no-store'}});
/** Experimental, opt-in only: local reference/question gates are not yet
 * independently verifiable here. Never activate before the full integration. */
export async function POST(request:Request){
 const config=authConfig(),secret=agentSigningKey();
 if(!config||!secret)return unavailable();
 return withWebOpenAiCredential(request,config,{bodyLimit:MAX_VISUAL_REQUEST_BYTES,bodyTooLargeStatus:413},async prepared=>{
  if(!prepared.apiKey)return Response.json({error:'invalid_request'},{status:400,headers:{'Cache-Control':'no-store'}});
  let actor;try{actor=prepared.actor??await resolveSupabaseActor(await authClient(config));}catch{return unavailable();}
  const ownsProject=(candidate:NonNullable<typeof actor>,projectId:string)=>ownsSupabaseProject({actor:candidate,projectId,config});
  const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey});
  const plannerFor=(intent?:{intentId:string;intentSecret:string})=>createExplorationPlanner({store:createExplorationPlannerStore(config,fetch,intent),bindings,provider:guardExplorationPlannerProvider(createManagedExplorationPlanProvider({apiKey:prepared.apiKey??''}),prepared.request.signal),authorize:async input=>ownsProject(input.actor,input.projectId)});
  const visualRequired=process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true',visualAvailable=selectedVisualsAvailable(Boolean(config));
  return createExplorationPlannerRoute({appOrigin:config.app,apiKey:prepared.apiKey,allowSubmit:parallelExplorationAvailable(Boolean(config))&&(!visualRequired||visualAvailable),visualMode:visualRequired?'required':'disabled',resolveActor:async()=>actor,ownsProject,bindings,plannerFor})(prepared.request);
 });
}
