import { authClient, authConfig } from '../../../lib/supabase';
import { validAuthorizationId } from '../../../lib/oauth';
import { cookies } from '../../../lib/pages-request-cookies.ts';

export async function GET(request:Request) {
  const config = authConfig();
  const code = new URL(request.url).searchParams.get('code');
  if (config && code) {
    try {
      const client = await authClient(config);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const jar = await cookies();
        const id = jar.get('compor-oauth-pending')?.value;
        jar.delete('compor-oauth-pending');
        const location = process.env.MCP_OAUTH_ENABLED === 'true' && validAuthorizationId(id) ? `/oauth/consent?authorization_id=${encodeURIComponent(id)}` : '/';
        return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      }
    } catch { /* Do not disclose provider errors or authorization codes. */ }
  }
  return new Response(null, { status: 303, headers: { Location: '/?login=erro', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
