import {createImageHandler} from '@compor/images-api';
import {createExplorationPlannerBindings,validateExplorationContext,verifyExplorationPlan} from '@compor/agents-api/exploration-planner';
import {deriveExplorationIntent} from './exploration-intent.ts';
import {agentSigningKey} from './agent-config.ts';
import {authClient,authConfig} from './supabase.ts';
import {ownsSupabaseProject,resolveSupabaseActor} from './agent-auth.ts';
import {createExplorationBatchRoute} from './exploration-batch-route.ts';
import {createExplorationBatchStore} from './exploration-batch-store.ts';
import {createExplorationIntentStore} from './exploration-intent-store.ts';
import {selectedVisualsAvailable} from './selected-visual-availability.ts';
import {decodeExplorationImage} from './exploration-image-runtime.ts';
import type {PreparedOpenAiRequest} from './openai-credential.ts';

/** Remains disabled until the complete flow and migration have been verified. */
export function explorationBatchRuntime(prepared:PreparedOpenAiRequest) {
 const config=authConfig(),secret=agentSigningKey();
 if(process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED!=='true'||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true'||!config||!secret||!prepared.apiKey)return null;
 const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey});
 return createExplorationBatchRoute({
  appOrigin:config.app,
  visualEnabled:selectedVisualsAvailable(Boolean(config)),
  resolveActor:async()=>prepared.actor??resolveSupabaseActor(await authClient(config)),
  ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
  verifyPlan:async({actor,apiKey,projectId,conversationId,batchId,requestId,context,plan,token,visualInput})=>{
   if(apiKey!==prepared.apiKey||!validateExplorationContext(context))return false;
   return verifyExplorationPlan({bindings,input:{actor,projectId,conversationId,batchId,requestId,context,...(visualInput?{visualInput}:{})},plan,token});
  },
  intentSecret:input=>{if(!validateExplorationContext(input.context))throw Error('invalid context');const scope={actor:input.actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,context:input.context,...(input.visualInput?{visualInput:input.visualInput}:{})};if(input.purpose==='batch')return deriveExplorationIntent(bindings,{...scope,purpose:'batch'}).intentSecret;if(input.position===undefined||input.previousId===undefined)throw Error('invalid intent');return deriveExplorationIntent(bindings,{...scope,purpose:'replacement',position:input.position,previousId:input.previousId}).intentSecret;},
  store:createExplorationBatchStore(config),
  intentState:createExplorationIntentStore(config).state,
  generate:async(actor,key,prompt,images)=>{
   const handler=createImageHandler({authenticate:async()=>actor});
   const response=await handler(new Request(`${config.app}/internal-image`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key,prompt,authorizeGeneration:true,images:images.map(({mime,data})=>({mime,data}))})}));
   return decodeExplorationImage(response);
  },
 });
}
