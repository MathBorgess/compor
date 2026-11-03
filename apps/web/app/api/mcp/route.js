import { createRemoteMcpHandler, createSupabaseAuthenticator, createSupabaseProjectStore } from '@compor/remote-mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accept a publishable key or a legacy anon JWT, never a secret/service-role key.
function isPublicKey(value) {
  if (!value || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

async function handle(request) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (url && isPublicKey(anonKey)) {
    try {
      return await createRemoteMcpHandler({
        authenticate: createSupabaseAuthenticator({ url, anonKey }),
        projectStore: createSupabaseProjectStore({ url, anonKey }),
      })(request);
    } catch {
      // Do not expose environment values or service errors to clients.
    }
  }
  return createRemoteMcpHandler()(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
