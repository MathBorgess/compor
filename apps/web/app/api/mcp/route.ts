import { createRemoteMcpHandler, createSupabaseAuthenticator, createSupabaseProjectStore, createSupabasePieceStore } from '@compor/remote-mcp';
import { authConfig } from '../../../lib/supabase';

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
      const response = await createRemoteMcpHandler({
        authenticate: createSupabaseAuthenticator({ url, anonKey }),
        projectStore: createSupabaseProjectStore({ url, anonKey }),
        pieceStore: createSupabasePieceStore({ url, anonKey }),
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
