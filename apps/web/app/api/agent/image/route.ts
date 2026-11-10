import {withWebOpenAiCredential} from '../../../../lib/web-openai-credential.ts';
import {createCredentialSessionBindings} from '../../../../lib/openai-credential-bindings.ts';
import type {PreparedOpenAiRequest} from '../../../../lib/openai-credential.ts';
import { createImageToolReservationStore } from '@compor/agents-api/image-tool-reservation';
import { createImageToolApproval, createImageToolExecution } from '@compor/agents-api/image-tool-execution';
import { createImageToolResultSender } from '@compor/agents-api/image-tool-result';
import { createUsageStore } from '@compor/agents-api/usage-store';
import { createImageHandler } from '@compor/images-api';
import { createPrivateImageHandler } from '@compor/private-images';
import { authClient, authConfig } from '../../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseVersion } from '../../../../lib/agent-auth.ts';
import { agentSigningKey } from '../../../../lib/agent-config.ts';
import { createAgentImageRoute } from '../../../../lib/agent-image-route.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
async function handle(request:Request,credential?:Pick<PreparedOpenAiRequest,'source'|'actor'|'apiKey'>) {
 const config=authConfig(),signingKey=agentSigningKey();
 if(!config || !signingKey || process.env.COMPOR_PRIVATE_IMAGES_ENABLED !== 'true')return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 const bindings=createCredentialSessionBindings({secret:signingKey,source:credential?.source??'byok',apiKey:credential?.apiKey});
 const reservations=createImageToolReservationStore({url:config.service,anonKey:config.key});
 const ownsVersion=(args:Omit<Parameters<typeof ownsSupabaseVersion>[0],'config'>)=>ownsSupabaseVersion({...args,config});
 let actor:Awaited<ReturnType<typeof resolveSupabaseActor>>=null;
 const resolveActor=async()=>{actor=credential?.actor??await resolveSupabaseActor(await authClient(config));return actor;};
 const authenticate=async()=>actor;
 const approve=createImageToolApproval({bindings,ownsVersion});
 const execute=createImageToolExecution({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key}),appOrigin:config.app,imageHandler:createImageHandler({authenticate}),imageStorageHandler:createPrivateImageHandler({appOrigin:config.app,supabaseUrl:config.service,publishableKey:config.key,authenticate})});
 const send=createImageToolResultSender({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key})});
 return createAgentImageRoute({appOrigin:config.app,resolveActor,approve,execute,send})(request);
}

export async function POST(request:Request) {
 const config=authConfig();
 if(!config||!agentSigningKey()||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return handle(request);
 return withWebOpenAiCredential(request,config,{bodyLimit:3*1024*1024,versionScope:true},prepared=>handle(prepared.request,prepared));
}
