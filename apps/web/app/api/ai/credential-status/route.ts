import {authClient,authConfig} from '../../../../lib/supabase.ts';
import {resolveSupabaseActor} from '../../../../lib/agent-auth.ts';
import {resolveDefaultOpenAiKey} from '../../../../lib/default-openai-key.ts';
import {createCredentialStatusHandler} from '../../../../lib/openai-credential.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const config=authConfig();
  if(!config)return Response.json({defaultAvailable:false},{status:503,headers:{'Cache-Control':'no-store','Vary':'Cookie'}});
  return createCredentialStatusHandler({appOrigin:config.app,
    resolveActor:async()=>resolveSupabaseActor(await authClient(config)),
    resolveDefault:()=>resolveDefaultOpenAiKey(config),
  })(request);
}
