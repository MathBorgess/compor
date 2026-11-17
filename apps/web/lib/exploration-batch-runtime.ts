import {createImageHandler} from '@compor/images-api';
import {createExplorationPlannerBindings,validateExplorationContext,verifyExplorationPlan} from '@compor/agents-api/exploration-planner';
import {agentSigningKey} from './agent-config.ts';
import {authClient,authConfig} from './supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from './agent-auth.ts';
import {createExplorationBatchRoute} from './exploration-batch-route.ts';
import {createExplorationBatchStore} from './exploration-batch-store.ts';
import {decodeExplorationImage} from './exploration-image-runtime.ts';
import type {PreparedOpenAiRequest} from './openai-credential.ts';

/** Remains disabled until the complete flow and migration have been verified. */
export function explorationBatchRuntime(prepared:PreparedOpenAiRequest) {
 const config=authConfig(),secret=agentSigningKey();
 if(process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED!=='true'||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true'||!config||!secret||!prepared.apiKey)return null;
 const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey});
 return createExplorationBatchRoute({
  appOrigin:config.app,
  resolveActor:async()=>prepared.actor??resolveSupabaseActor(await authClient(config)),
  ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
  verifyPlan:async({actor,apiKey,projectId,conversationId,batchId,requestId,context,plan,token})=>{
   if(apiKey!==prepared.apiKey||!validateExplorationContext(context))return false;
   return verifyExplorationPlan({bindings,input:{actor,projectId,conversationId,batchId,requestId,context},plan,token});
  },
  store:createExplorationBatchStore(config),
  generate:async(actor,key,prompt)=>{
   const handler=createImageHandler({authenticate:async()=>actor});
   const response=await handler(new Request(`${config.app}/internal-image`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key,prompt,authorizeGeneration:true})}));
   return decodeExplorationImage(response);
  },
 });
}
