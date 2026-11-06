import { createSessionBindings } from '@compor/agents-api/session-binding';
import { createImageToolReservationStore } from '@compor/agents-api/image-tool-reservation';
import { createImageToolApproval, createImageToolExecution } from '@compor/agents-api/image-tool-execution';
import { createImageToolResultSender } from '@compor/agents-api/image-tool-result';
import { createStudioStore } from '@compor/agents-api/studio-chat-store';
import { createUsageStore } from '@compor/agents-api/usage-store';
import { createImageHandler } from '@compor/images-api';
import { createPrivateImageHandler } from '@compor/private-images';
import { authClient, authConfig } from '../../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseVersion } from '../../../../lib/agent-auth.ts';
import type { Actor } from '../../../../lib/agent-auth.ts';
import { agentSigningKey } from '../../../../lib/agent-config.ts';
import { createAgentImageRoute,createImageReceiptPreflight } from '../../../../lib/agent-image-route.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request:Request) {
 const config=authConfig(),signingKey=agentSigningKey();
 if(!config || !signingKey || process.env.COMPOR_PRIVATE_IMAGES_ENABLED !== 'true')return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 const bindings=createSessionBindings({secret:signingKey});
 const reservations=createImageToolReservationStore({url:config.service,anonKey:config.key});
 const studio=createStudioStore({url:config.service,anonKey:config.key});
 const ownsVersion=(args:Omit<Parameters<typeof ownsSupabaseVersion>[0],'config'>)=>ownsSupabaseVersion({...args,config});
 let actor:Awaited<ReturnType<typeof resolveSupabaseActor>>=null;
 const resolveActor=async()=>{actor=await resolveSupabaseActor(await authClient(config));return actor;};
 const authenticate=async()=>actor;
 const approve=createImageToolApproval({bindings,ownsVersion});
 const execute=createImageToolExecution({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key}),appOrigin:config.app,imageHandler:createImageHandler({authenticate}),imageStorageHandler:createPrivateImageHandler({appOrigin:config.app,supabaseUrl:config.service,publishableKey:config.key,authenticate})});
 const send=createImageToolResultSender({bindings,ownsVersion,reservations,usage:createUsageStore({url:config.service,anonKey:config.key})});
 const receipt={
  preflight:createImageReceiptPreflight({getTurn:studio.get,lookup:reservations.getImageReceiptCandidate}),
  async store({actor,projectId,requestId,attemptId,pieceId,version,executionId,assetId,contentSha256}:{actor:Actor;projectId:string;requestId:string;attemptId:string;pieceId:string;version:number;executionId:string;assetId:string;contentSha256:string}) {
   const proof=bindings.issueImageReceipt({userId:actor.userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId,contentSha256});
   await reservations.storeImageReceipt({actor,projectId,requestId,attemptId,executionId,proof});
  },
 };
 return createAgentImageRoute({appOrigin:config.app,resolveActor,approve,execute,send,receipt})(request);
}
