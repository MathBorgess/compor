import {studioImagePipeline} from './studio-image-pipeline.ts';
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
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createReferenceAuthorityStore} from './reference-authority-store.ts';
import {referenceConsentSecret} from './reference-authority-route.ts';

/** Remains disabled until the complete flow and migration have been verified. */
export function explorationBatchRuntime(prepared:PreparedOpenAiRequest) {
 const config=authConfig(),secret=agentSigningKey();
 if(process.env.COMPOR_PARALLEL_EXPLORATION_ENABLED!=='true'||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true'||!config||!secret||!prepared.apiKey)return null;
 const bindings=createExplorationPlannerBindings({secret,source:prepared.source,apiKey:prepared.apiKey});
 const referenceAuthority=createReferenceAuthorityStore(config);
 const imagePipeline=studioImagePipeline(process.env,'reference');
 return createExplorationBatchRoute({
  generationAvailable:imagePipeline!==null,
  appOrigin:config.app,
  visualEnabled:selectedVisualsAvailable(Boolean(config)),
  visualRequired:process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true',
  prepareVisualAuthority:async input=>{
   if(process.env.COMPOR_REFERENCE_AUTHORITY_ENABLED!=='true')return null;
   const value={requestId:input.requestId,manifestDigest:visualInputDigest(input.visualInput),consentSecret:referenceConsentSecret(input.consentHeader)};
   return await referenceAuthority.check(input.actor,{projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,purpose:input.purpose,manifestDigest:value.manifestDigest,consentSecret:value.consentSecret})?value:null;
  },
  checkVisualDispatch:async input=>referenceAuthority.checkDispatch(input.actor,{projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,purpose:input.purpose,manifestDigest:input.authority.manifestDigest,consentSecret:input.authority.consentSecret,intentId:input.intentId,intentEpoch:input.intentEpoch,intentState:'consumed'}),
  resolveActor:async()=>prepared.actor??resolveSupabaseActor(await authClient(config)),
  ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
  verifyPlan:async({actor,apiKey,projectId,conversationId,batchId,requestId,context,plan,token,visualInput})=>{
   if(apiKey!==prepared.apiKey||!validateExplorationContext(context))return false;
   return verifyExplorationPlan({bindings,input:{actor,projectId,conversationId,batchId,requestId,context,...(visualInput?{visualInput}:{})},plan,token});
  },
  intentSecret:input=>{if(!validateExplorationContext(input.context))throw Error('invalid context');const scope={actor:input.actor,projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,intentId:input.intentId,context:input.context,...(input.visualInput?{visualInput:input.visualInput}:{})};if(input.purpose==='batch')return deriveExplorationIntent(bindings,{...scope,purpose:'batch'}).intentSecret;if(input.position===undefined||input.previousId===undefined)throw Error('invalid intent');return deriveExplorationIntent(bindings,{...scope,purpose:'replacement',position:input.position,previousId:input.previousId}).intentSecret;},
  store:createExplorationBatchStore(config),
  intentState:createExplorationIntentStore(config).state,
  generate:async(actor,key,prompt,images,review,size)=>{
   if(!imagePipeline)throw Error('image generation unavailable');
   const handler=imagePipeline.createHandler(async()=>actor);
   const response=await handler(new Request(`${config.app}/internal-image`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key,prompt,...(size?{size}:{}),authorizeGeneration:true,images:images.map(({mime,data})=>({mime,data}))}),signal:review?.signal}),{authorizeReview:review?.authorizeReview});
   return decodeExplorationImage(response);
  },
 });
}
