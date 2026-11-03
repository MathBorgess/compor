import { authClient, authConfig } from '../../../lib/supabase';

export async function GET(request) {
  const config = authConfig();
  const code = new URL(request.url).searchParams.get('code');
  if (config && code) {
    try {
      const client = await authClient(config);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    } catch { /* Do not disclose provider errors or authorization codes. */ }
  }
  return new Response(null, { status: 303, headers: { Location: '/?login=erro', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
