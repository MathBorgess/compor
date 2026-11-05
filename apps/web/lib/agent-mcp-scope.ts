import type {AuthConfig} from './supabase.ts';
import { createAgentScope } from '@compor/remote-mcp/agent-scope';
import { createSupabaseAuthenticator, createSupabasePieceStore } from '@compor/remote-mcp';
import { ownsSupabaseProject } from './agent-auth.ts';

// Environment and config are server-owned; never accept either from a request.
export function createConfiguredAgentMcpScope(config:AuthConfig|null, env = process.env, fetchImpl = globalThis.fetch) {
 try {
  if (!config || env.COMPOR_AGENT_MCP_ENABLED !== 'true' || typeof env.COMPOR_AGENT_MCP_KEY !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(env.COMPOR_AGENT_MCP_KEY) || env.COMPOR_AGENT_MCP_KEY === env.COMPOR_AGENT_HMAC_SECRET) return null;
  const secret=Buffer.from(env.COMPOR_AGENT_MCP_KEY,'base64url');
  if(secret.length!==32 || secret.toString('base64url')!==env.COMPOR_AGENT_MCP_KEY) return null;
  return createAgentScope({secret,
   authenticate:createSupabaseAuthenticator({url:config.service,anonKey:config.key,fetchImpl}),
   ownsProject:(actor,projectId,token)=>ownsSupabaseProject({config,actor:{...actor,token},projectId,fetch:fetchImpl}),
   pieceStore:createSupabasePieceStore({url:config.service,anonKey:config.key,fetchImpl}),
  });
 } catch {return null;}
}
