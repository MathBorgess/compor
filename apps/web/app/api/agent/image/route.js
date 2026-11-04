import { createSessionBindings } from '@compor/agents-api/session-binding';
import { createImageToolReservationStore } from '@compor/agents-api/image-tool-reservation';
import { createImageToolApproval, createImageToolExecution } from '@compor/agents-api/image-tool-execution';
import { createImageToolResultSender } from '@compor/agents-api/image-tool-result';
import { createUsageStore } from '@compor/agents-api/usage-store';
import { createImageHandler } from '@compor/images-api';
import { createPrivateImageHandler } from '@compor/private-images';
import { authClient, authConfig } from '../../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseVersion } from '../../../../lib/agent-auth.mjs';
import { agentSigningKey } from '../../../../lib/agent-config.mjs';
import { createAgentImageRoute } from '../../../../lib/agent-image-route.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request) {
 const config=authConfig(),signingKey=agentSigningKey();
 if(!config || !signingKey)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 const bindings=createSessionBindings({secret:signingKey});
 const reservations=createImageToolReservationStore({url:config.service,anonKey:config.key});
 const ownsVersion=args=>ownsSupabaseVersion({...args,config});
 let actor;
 const resolveActor=async()=>{actor=await resolveSupabaseActor(await authClient(config));return actor;};
 const authenticate=async()=>actor;
 const approve=createImageToolApproval({bindings,ownsVersion});
 const execute=createImageToolExecution({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key}),appOrigin:config.app,imageHandler:createImageHandler({authenticate}),imageStorageHandler:createPrivateImageHandler({appOrigin:config.app,supabaseUrl:config.service,publishableKey:config.key,authenticate})});
 const send=createImageToolResultSender({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key})});
 return createAgentImageRoute({appOrigin:config.app,resolveActor,approve,execute,send})(request);
}
