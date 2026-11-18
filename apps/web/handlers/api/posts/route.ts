import {authClient,authConfig} from '../../../lib/supabase';
import {resolveSupabaseActor,ownsSupabaseProject} from '../../../lib/agent-auth';
import {createPostStore} from '../../../lib/post-store';
import {createPostRoutes} from '../../../lib/post-route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(method:'POST'|'DELETE',request:Request){
  const config=authConfig();if(!config)return Response.json({error:'unavailable'},{status:503});
  try{return await createPostRoutes({appOrigin:config.app,resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),postStore:createPostStore({url:config.service,anonKey:config.key})})[method](request);}
  catch{return Response.json({error:'unavailable'},{status:503});}
}
export const POST=(request:Request)=>handle('POST',request);
export const DELETE=(request:Request)=>handle('DELETE',request);
