import {createImageToolReservationStore} from '@compor/agents-api/image-tool-reservation';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {resolveSupabaseActor} from '../../../../../lib/agent-auth.ts';
import {createClosedImageReconciliation} from '../../../../../lib/agent-image-reconcile-closed.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const config=authConfig();
 if(!config||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return Response.json({status:'unverified'},{status:503,headers:{'Cache-Control':'no-store'}});
 const store=createImageToolReservationStore({url:config.service,anonKey:config.key});
 return createClosedImageReconciliation({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),confirm:store.confirmClosedAttempt})(request);
}
