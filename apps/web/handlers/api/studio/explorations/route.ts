import {withWebOpenAiCredential} from '../../../../lib/web-openai-credential.ts';
import {authConfig} from '../../../../lib/supabase.ts';
import { explorationRuntime } from '../../../../lib/exploration-image-runtime.ts';
import { z } from 'zod';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const unavailable=()=>Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  const service=explorationRuntime();
  const config=authConfig();
  if(service&&config)return withWebOpenAiCredential(request,config,{bodyLimit:65536,bodyTooLargeStatus:413,keyLocation:'header',failure:(error,status)=>{
    const correlation=z.string().uuid().safeParse(request.headers.get('x-compor-exploration-request-id'));
    return correlation.success?Response.json({status:'not_started',requestId:correlation.data,retryAutomatically:false},{status,headers:{'Cache-Control':'no-store'}}):Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  }},prepared=>{const ready=explorationRuntime(prepared.actor);return ready?ready.post(prepared.request):Promise.resolve(unavailable());});
  const requestId=z.string().uuid().safeParse(request.headers.get('x-compor-exploration-request-id'));
  return requestId.success ? Response.json({status:'not_started',requestId:requestId.data,retryAutomatically:false},{status:503,headers:{'Cache-Control':'no-store'}}) : unavailable();
}
export async function GET(request:Request) { return explorationRuntime()?.get(request) ?? unavailable(); }
