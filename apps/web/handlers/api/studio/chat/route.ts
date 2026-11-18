import {configuredStudioChat} from '../../../../lib/studio-chat-config.ts';
import {authConfig} from '../../../../lib/supabase.ts';
import {withWebOpenAiCredential} from '../../../../lib/web-openai-credential.ts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function POST(request:Request){
 const config=authConfig();
 if(!config||!configuredStudioChat())return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return withWebOpenAiCredential(request,config,{bodyLimit:(process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true'?3:2)*1024*1024,freshSubmission:true,keyLocation:'header-or-legacy-body'},async prepared=>{
  const handler=configuredStudioChat(process.env,prepared);
  return handler?handler.chat(prepared.request):Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 });
}
