import {createImageToolReservationStore} from '@compor/agents-api/image-tool-reservation';
import {createSessionBindings} from '@compor/agents-api/session-binding';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {agentSigningKey} from '../../../../../lib/agent-config.ts';
import {createClosedImageReconciliation} from '../../../../../lib/agent-image-reconcile-closed.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const config=authConfig();
 if(!config||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return Response.json({status:'unverified'},{status:503,headers:{'Cache-Control':'no-store'}});
 const store=createImageToolReservationStore({url:config.service,anonKey:config.key});
 const secret=agentSigningKey(),bindings=secret?createSessionBindings({secret}):null;
 return createClosedImageReconciliation({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),confirm:store.confirmClosedAttempt,
  ...(bindings?{candidate:store.getImageReceiptCandidate,verify:({proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})=>bindings.verifyImageReceipt({token:proof,userId,projectId,requestId,attemptId,pieceId,version,executionId,assetId})}:{})})(request);
}
