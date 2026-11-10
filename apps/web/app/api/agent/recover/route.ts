import {withWebOpenAiCredential} from '../../../../lib/web-openai-credential.ts';
import {createCredentialSessionBindings} from '../../../../lib/openai-credential-bindings.ts';
import type {PreparedOpenAiRequest} from '../../../../lib/openai-credential.ts';
import { createAgentRecoveryHandler } from '@compor/agents-api/recovery-route';
import { createSupabaseAttemptStore } from '@compor/agents-api/attempt-store';
import { authClient, authConfig } from '../../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../../lib/agent-auth.ts';
import { agentSigningKey } from '../../../../lib/agent-config.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

async function handle(request:Request,credential?:Pick<PreparedOpenAiRequest,'source'|'actor'|'apiKey'>) {
  const config=authConfig(), secret=agentSigningKey();
  if(process.env.COMPOR_AGENT_RECOVERY_ENABLED!=='true' || !config || !secret) return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  return createAgentRecoveryHandler({appOrigin:config.app,
    resolveActor:async()=>credential?.actor??resolveSupabaseActor(await authClient(config)),
    ownsProject:args=>ownsSupabaseProject({...args,config}),
    attempts:createSupabaseAttemptStore({url:config.service,anonKey:config.key}),
    bindings:createCredentialSessionBindings({secret,source:credential?.source??'byok',apiKey:credential?.apiKey})})(request);
}

export async function POST(request:Request) {
 const config=authConfig();
 if(!config||!agentSigningKey()||process.env.COMPOR_AGENT_RECOVERY_ENABLED!=='true')return handle(request);
 return withWebOpenAiCredential(request,config,{bodyLimit:16*1024},prepared=>handle(prepared.request,prepared));
}
