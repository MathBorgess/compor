import {createSessionBindings} from '@compor/agents-api/session-binding';
import {createImageToolReservationStore} from '@compor/agents-api/image-tool-reservation';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {resolveSupabaseActor,ownsSupabaseVersion} from '../../../../../lib/agent-auth.ts';
import {agentSigningKey} from '../../../../../lib/agent-config.ts';
import {createAgentImageReconcile} from '../../../../../lib/agent-image-reconcile.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const config=authConfig(),secret=agentSigningKey();
  if(!config||!secret||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return Response.json({status:'unverified'},{status:503,headers:{'Cache-Control':'no-store'}});
  const store=createImageToolReservationStore({url:config.service,anonKey:config.key});
  return createAgentImageReconcile({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsVersion:async args=>ownsSupabaseVersion({...args,config}),bindings:createSessionBindings({secret}),fence:store.fenceUnsubmitted})(request);
}
