import {createImageToolReservationStore} from '@compor/agents-api/image-tool-reservation';
import {createAgentImageWaitStatus} from '../../../../../lib/agent-image-reconcile.ts';
import {agentSigningKey} from '../../../../../lib/agent-config.ts';
import {resolveSupabaseActor,ownsSupabaseVersion} from '../../../../../lib/agent-auth.ts';
import {createCredentialReconciliationBindings} from '../../../../../lib/openai-credential-bindings.ts';
import {authClient,authConfig} from '../../../../../lib/supabase.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request) {
  const config=authConfig(),secret=agentSigningKey();
  if(!config||!secret||process.env.COMPOR_PRIVATE_IMAGES_ENABLED!=='true')return Response.json({status:'unverified'},{status:503,headers:{'Cache-Control':'no-store'}});
  const store=createImageToolReservationStore({url:config.service,anonKey:config.key});
  return createAgentImageWaitStatus({
    appOrigin:config.app,
    resolveActor:async()=>resolveSupabaseActor(await authClient(config)),
    ownsVersion:async args=>ownsSupabaseVersion({...args,config}),
    bindings:createCredentialReconciliationBindings({secret}),
    getWaitStatus:store.getWaitStatus,
  })(request);
}
