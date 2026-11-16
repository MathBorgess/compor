import {authClient,authConfig} from '../../../lib/supabase';
import {resolveSupabaseActor} from '../../../lib/agent-auth.ts';
import {createProfileRoute} from '../../../lib/profile-route.ts';
import {createProfileStore} from '../../../lib/profile-store.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const config=authConfig();
  if(!config)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  return createProfileRoute({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),read:(actor,offset)=>createProfileStore({config,actor}).read(offset)})(request);
}
