import {withWebOpenAiCredential} from '../../../lib/web-openai-credential.ts';
import {createCredentialSessionBindings} from '../../../lib/openai-credential-bindings.ts';
import type {PreparedOpenAiRequest} from '../../../lib/openai-credential.ts';
import { createProjectAgentHandler } from '@compor/agents-api/project-route';
import { createSupabaseAttemptStore } from '@compor/agents-api/attempt-store';
import { withAgentMcpTool } from '@compor/remote-mcp/agent-scope';
import { createUsageStore } from '@compor/agents-api/usage-store';
import { recordAgentEvent } from '@compor/agents-api/telemetry';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../lib/agent-auth.ts';
import { agentSigningKey } from '../../../lib/agent-config.ts';
import { createConfiguredAgentMcpScope } from '../../../lib/agent-mcp-scope.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(request:Request,credential?:Pick<PreparedOpenAiRequest,'source'|'actor'|'apiKey'>) {
  const config = authConfig();
  const signingKey = agentSigningKey();
  if (!config || !signingKey) { recordAgentEvent('configuration_unavailable'); return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const scope = createConfiguredAgentMcpScope(config);
  if (process.env.COMPOR_AGENT_MCP_ENABLED === 'true' && !scope) { recordAgentEvent('mcp_configuration_unavailable'); return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  return createProjectAgentHandler({
    appOrigin: config.app,
    resolveActor: async () => credential?.actor??resolveSupabaseActor(await authClient(config)),
    ownsProject: args => ownsSupabaseProject({ ...args, config }),
    attempts: createSupabaseAttemptStore({url:config.service,anonKey:config.key}),
    usage: createUsageStore({url:config.service,anonKey:config.key}),
    enableRecovery: process.env.COMPOR_AGENT_RECOVERY_ENABLED === 'true',
    bindings: createCredentialSessionBindings({secret:signingKey,source:credential?.source??'byok',apiKey:credential?.apiKey}),
    ...(scope ? {withMcp: ({actor,projectId},submit) => withAgentMcpTool({appOrigin:config.app,scope,token:actor.token,projectId},submit)} : {}),
  })(request);
}

export async function POST(request:Request) {
 const config=authConfig();
 if(!config||!agentSigningKey())return handle(request);
 return withWebOpenAiCredential(request,config,{bodyLimit:16384,projectLocation:'header'},prepared=>handle(prepared.request,prepared));
}
