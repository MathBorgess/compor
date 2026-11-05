import {configuredStudioChat} from '../../../../lib/studio-chat-config.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function POST(request){
 const handler=configuredStudioChat();
 if(!handler)return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 return handler.action(request);
}
