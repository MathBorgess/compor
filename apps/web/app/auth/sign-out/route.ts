import { authClient,authConfig } from '../../../lib/supabase.ts';
import { createSignOutRoute } from '../../../lib/sign-out-route.ts';

export async function POST(request:Request) {
  const config=authConfig();
  if(!config)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  return createSignOutRoute({appOrigin:config.app,signOut:async()=>{
    const client=await authClient(config);
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)throw Error('sign_out_unavailable');
  }})(request);
}
