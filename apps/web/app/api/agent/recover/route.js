import { createAgentRecoveryHandler } from '@compor/agents-api/recovery-route';
import { createSupabaseAttemptStore } from '@compor/agents-api/attempt-store';
import { createSessionBindings } from '@compor/agents-api/session-binding';
import { authClient, authConfig } from '../../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../../lib/agent-auth.mjs';
import { agentSigningKey } from '../../../../lib/agent-config.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request) {
  const config=authConfig(), secret=agentSigningKey();
  if(process.env.COMPOR_AGENT_RECOVERY_ENABLED!=='true' || !config || !secret) return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  return createAgentRecoveryHandler({appOrigin:config.app,
    resolveActor:async()=>resolveSupabaseActor(await authClient(config)),
    ownsProject:args=>ownsSupabaseProject({...args,config}),
    attempts:createSupabaseAttemptStore({url:config.service,anonKey:config.key}),
    bindings:createSessionBindings({secret})})(request);
}
