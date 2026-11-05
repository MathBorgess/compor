import {createStudioChatHandlers} from '@compor/agents-api/studio-chat';
import {createStudioStore} from '@compor/agents-api/studio-chat-store';
import {createStudioBindings} from '@compor/agents-api/studio-chat-bindings';
import {recordStudioEvent} from '@compor/agents-api/studio-telemetry';
import {createSupabaseAttemptStore} from '@compor/agents-api/attempt-store';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createUsageStore} from '@compor/agents-api/usage-store';
import {authClient,authConfig} from './supabase';
import {agentSigningKey} from './agent-config.mjs';
import {resolveSupabaseActor,ownsSupabaseProject,ownsSupabaseVersion} from './agent-auth.mjs';

export function configuredStudioChat(env=process.env){
 const config=authConfig(),secret=agentSigningKey();
 if(env.COMPOR_STUDIO_CHAT_ENABLED!=='true'||!config||!secret)return null;
 const credentials={url:config.service,anonKey:config.key};
 return createStudioChatHandlers({appOrigin:config.app,onEvent:recordStudioEvent,
  resolveActor:async()=>resolveSupabaseActor(await authClient(config)),
  ownsProject:args=>ownsSupabaseProject({...args,config}),ownsVersion:args=>ownsSupabaseVersion({...args,config}),
  verifyDurableResult:async({actor,projectId,name,args,result})=>{
   const endpoint=new URL(name==='compor_renomear_projeto'?'/rest/v1/projects':'/rest/v1/piece_version_metadata',config.service);
   if(name==='compor_renomear_projeto'){
    if(result.title!==args.title)return false;
    for(const[k,v]of Object.entries({select:'id,owner_id,title',id:`eq.${projectId}`,owner_id:`eq.${actor.userId}`,limit:'1'}))endpoint.searchParams.set(k,v);
   }else{
    if(result.pieceId!==args.pieceId||result.version!==args.expectedLatestVersion+1)return false;
    if(!await ownsSupabaseVersion({config,actor,projectId,pieceId:result.pieceId,version:result.version}))return false;
    for(const[k,v]of Object.entries({select:'project_id,piece_id,version,base_version',project_id:`eq.${projectId}`,piece_id:`eq.${result.pieceId}`,version:`eq.${result.version}`,limit:'1'}))endpoint.searchParams.set(k,v);
   }
   const response=await fetch(endpoint,{headers:{apikey:config.key,authorization:`Bearer ${actor.token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;const rows=await response.json();if(!Array.isArray(rows)||rows.length!==1)return false;
   return name==='compor_renomear_projeto'?rows[0].id===projectId&&rows[0].owner_id===actor.userId&&rows[0].title===args.title:rows[0].project_id===projectId&&rows[0].piece_id===args.pieceId&&rows[0].version===result.version&&rows[0].base_version===(args.baseVersion===0?null:args.baseVersion);
  },
  store:createStudioStore(credentials),attempts:createSupabaseAttemptStore(credentials),usage:createUsageStore(credentials),
  bindings:createSessionBindings({secret}),studioBindings:createStudioBindings({secret}),
 });
}
