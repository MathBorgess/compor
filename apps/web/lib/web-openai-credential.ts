import { authClient } from './supabase.ts';
import type { AuthConfig } from './supabase.ts';
import { ownsSupabaseProject, ownsSupabaseVersion, resolveSupabaseActor } from './agent-auth.ts';
import { resolveDefaultOpenAiKey } from './default-openai-key.ts';
import { prepareOpenAiRequest } from './openai-credential.ts';
import type { CredentialRequestOptions, PreparedOpenAiRequest } from './openai-credential.ts';

/** Server composition only. Administrative credentials are used by the fixed
 * Vault resolver, never by project/version reads or the legacy data adapters. */
export async function withWebOpenAiCredential(request:Request,config:AuthConfig,options:CredentialRequestOptions,run:(prepared:PreparedOpenAiRequest)=>Promise<Response>):Promise<Response> {
  const prepared=await prepareOpenAiRequest(request,{
    appOrigin:config.app,defaultEnabled:process.env.COMPOR_DEFAULT_OPENAI_ENABLED==='true',
    resolveActor:async()=>resolveSupabaseActor(await authClient(config)),
    ownsProject:(actor,projectId)=>ownsSupabaseProject({config,actor,projectId}),
    ownsVersion:(actor,projectId,pieceId,version)=>ownsSupabaseVersion({config,actor,projectId,pieceId,version}),
    resolveDefault:()=>resolveDefaultOpenAiKey(config),
  },options);
  if(prepared instanceof Response)return prepared;
  const response=await run(prepared);
  response.headers.set('x-compor-credential-source',prepared.source);
  return response;
}
