import {authClient,authConfig} from '../../../../../lib/supabase.ts';
import {resolveSupabaseActor,ownsSupabaseProject} from '../../../../../lib/agent-auth.ts';
import {createReferenceAuthorityRoute} from '../../../../../lib/reference-authority-route.ts';
import {createReferenceAuthorityStore} from '../../../../../lib/reference-authority-store.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{operation:string}>}){
 const {operation}=await params;
 if(!['selection','consent','snapshot'].includes(operation))return Response.json({error:'not_found'},{status:404});
 const config=authConfig();if(!config)return Response.json({status:'unavailable'},{status:503});
 const handler=createReferenceAuthorityRoute({appOrigin:config.app,enabled:process.env.COMPOR_REFERENCE_AUTHORITY_ENABLED==='true',resolveActor:async()=>resolveSupabaseActor(await authClient(config)),ownsProject:async(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),store:createReferenceAuthorityStore(config)});
 return handler(operation as 'selection'|'consent'|'snapshot',request);
}
