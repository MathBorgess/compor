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
import {visualInputDigest} from '@compor/agents-api/visual-input';
import {createReferenceAuthorityStore} from '../../../../../lib/reference-authority-store.ts';
import {referenceConsentSecret} from '../../../../../lib/reference-authority-route.ts';
import {createExplorationIntentStore} from '../../../../../lib/exploration-intent-store.ts';
import type {Actor} from '../../../../../lib/agent-auth.ts';

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
  const authorityStore=createReferenceAuthorityStore(config),intentStore=createExplorationIntentStore(config);
  const plannerFor=(intent?:{intentId:string;intentSecret:string;visualAuthority?:{manifestDigest:string;consentSecret:string|null};scope:{actor:Actor;projectId:string;conversationId:string;batchId:string;requestId:string}})=>{
   const managed=createManagedExplorationPlanProvider({apiKey:prepared.apiKey??''});
   const visual=intent?.visualAuthority;
   const beforeDispatch=intent&&visual?async()=>{
    const scope=intent.scope,current=await intentStore.state({actor:scope.actor,projectId:scope.projectId,intentId:intent.intentId});
    return Boolean(current&&current.state==='active'&&await authorityStore.checkDispatch(scope.actor,{projectId:scope.projectId,conversationId:scope.conversationId,batchId:scope.batchId,requestId:scope.requestId,purpose:'parallel',...visual,intentId:intent.intentId,intentEpoch:current.epoch,intentState:'active'}));
   }:undefined;
   const provider=guardExplorationPlannerProvider(managed,prepared.request.signal,beforeDispatch);
   return createExplorationPlanner({store:createExplorationPlannerStore(config,fetch,intent),bindings,provider,authorize:async input=>ownsProject(input.actor,input.projectId),authorizeVisualInput:async()=>Boolean(intent?.visualAuthority)});
  };
  const prepareVisualAuthority=async(input:{actor:Actor;projectId:string;conversationId:string;batchId:string;requestId:string;visualInput:Parameters<typeof visualInputDigest>[0];consentHeader:string|null})=>{
   if(process.env.COMPOR_REFERENCE_AUTHORITY_ENABLED!=='true')return null;
   const authority={manifestDigest:visualInputDigest(input.visualInput),consentSecret:referenceConsentSecret(input.consentHeader)};
   return await authorityStore.check(input.actor,{projectId:input.projectId,conversationId:input.conversationId,batchId:input.batchId,requestId:input.requestId,purpose:'parallel',...authority})?authority:null;
  };
  const visualRequired=process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true',visualAvailable=selectedVisualsAvailable(Boolean(config));
  return createExplorationPlannerRoute({appOrigin:config.app,apiKey:prepared.apiKey,allowSubmit:parallelExplorationAvailable(Boolean(config))&&(!visualRequired||visualAvailable),visualMode:visualRequired?'required':'disabled',resolveActor:async()=>actor,ownsProject,bindings,plannerFor,prepareVisualAuthority})(prepared.request);
 });
}
