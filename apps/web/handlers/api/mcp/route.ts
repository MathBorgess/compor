import { createRemoteMcpHandler, createSupabaseAuthenticator, createSupabaseProjectStore, createSupabasePieceStore } from '@compor/remote-mcp';
import { authConfig } from '../../../lib/supabase';
import { explorationRuntime } from '../../../lib/exploration-image-runtime.ts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept a publishable key or a legacy anon JWT, never a secret/service-role key.
function isPublicKey(value:unknown):value is string {
  if (typeof value !== 'string' || !value || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

async function handle(request:Request) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url && isPublicKey(anonKey)) {
    try {
      const config = authConfig();
      const response = await createRemoteMcpHandler({
        authenticate: createSupabaseAuthenticator({ url, anonKey }),
        projectStore: createSupabaseProjectStore({ url, anonKey }),
        pieceStore: createSupabasePieceStore({ url, anonKey }),
        ...(config && process.env.COMPOR_PRIVATE_IMAGES_ENABLED === 'true' ? {exploration: async (context, input, key) => {
          const service=explorationRuntime({userId:context.actor.userId,token:context.token});
          if(!service)return {status:'not_started' as const,requestId:input.requestId,retryAutomatically:false as const};
          const result=await service.post(new Request(new URL('/api/studio/explorations',config.app),{
            method:'POST',headers:{origin:config.app,'content-type':'application/json','x-compor-openai-key':key,'x-compor-exploration-request-id':input.requestId},body:JSON.stringify(input),
          }));
          const parsed=z.discriminatedUnion('status',[
            z.strictObject({status:z.literal('completed'),requestId:z.string().uuid(),imageId:z.string().uuid()}),
            z.strictObject({status:z.enum(['running','unknown','busy','blocked','awaiting_feedback','rejected','not_started']),requestId:z.string().uuid(),retryAutomatically:z.literal(false)}),
          ]).parse(await result.json());
          if(parsed.status==='not_started' && (![400,403,404,413,503].includes(result.status) || parsed.requestId.toLowerCase()!==input.requestId.toLowerCase()))throw Error('unavailable');
          return parsed;
        },explorationResume:async(context,input)=>{
          const service=explorationRuntime({userId:context.actor.userId,token:context.token});
          if(!service)throw Error('unavailable');
          const result=await service.resume(new Request(new URL('/api/studio/explorations/resume',config.app),{method:'POST',headers:{origin:config.app,'content-type':'application/json'},body:JSON.stringify(input)}));
          if(!result.ok)throw Error('unavailable');
          return z.object({status:z.enum(['resumed','not_paused','blocked'])}).parse(await result.json()).status;
        },explorationRead:async(context,input)=>{
          const service=explorationRuntime({userId:context.actor.userId,token:context.token});
          if(!service)throw Error('unavailable');
          const query=new URLSearchParams(input);
          const result=await service.image(new Request(new URL(`/api/studio/explorations/image?${query}`,config.app)));
          if(!result.ok)throw Error('unavailable');
          const length=Number(result.headers.get('content-length'));
          if(Number.isFinite(length)&&length>8*1024*1024)throw Error('too_large');
          const bytes=new Uint8Array(await result.arrayBuffer());
          if(bytes.length>8*1024*1024)throw Error('too_large');
          return bytes;
        }} : {}),
      })(request);
      if (response.status === 401 && process.env.MCP_OAUTH_ENABLED === 'true') {
        const config = authConfig();
        if (config) response.headers.set('WWW-Authenticate', `Bearer resource_metadata="${config.app}/.well-known/oauth-protected-resource/api/mcp"`);
      }
      return response;
    } catch {
      // Do not expose environment values or service errors to clients.
    }
  }
  return createRemoteMcpHandler()(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
