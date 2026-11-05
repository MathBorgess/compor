import { createProjectAgentHandler } from '@compor/agents-api/project-route';
import { createSupabaseAttemptStore } from '@compor/agents-api/attempt-store';
import { createSessionBindings } from '@compor/agents-api/session-binding';
import { withAgentMcpTool } from '@compor/remote-mcp/agent-scope';
import { createUsageStore } from '@compor/agents-api/usage-store';
import { recordAgentEvent } from '@compor/agents-api/telemetry';
import { authClient, authConfig } from '../../../lib/supabase';
import { resolveSupabaseActor, ownsSupabaseProject } from '../../../lib/agent-auth.mjs';
import { agentSigningKey } from '../../../lib/agent-config.mjs';
import { createConfiguredAgentMcpScope } from '../../../lib/agent-mcp-scope.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request) {
  const config = authConfig();
  const signingKey = agentSigningKey();
  if (!config || !signingKey) { recordAgentEvent('configuration_unavailable'); return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  const scope = createConfiguredAgentMcpScope(config);
  if (process.env.COMPOR_AGENT_MCP_ENABLED === 'true' && !scope) { recordAgentEvent('mcp_configuration_unavailable'); return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  return createProjectAgentHandler({
    appOrigin: config.app,
    resolveActor: async () => resolveSupabaseActor(await authClient(config)),
    ownsProject: args => ownsSupabaseProject({ ...args, config }),
    attempts: createSupabaseAttemptStore({url:config.service,anonKey:config.key}),
    usage: createUsageStore({url:config.service,anonKey:config.key}),
    enableRecovery: process.env.COMPOR_AGENT_RECOVERY_ENABLED === 'true',
    bindings: createSessionBindings({secret:signingKey}),
    ...(scope ? {withMcp: ({actor,projectId},submit) => withAgentMcpTool({appOrigin:config.app,scope,token:actor.token,projectId},submit)} : {}),
  })(request);
}
