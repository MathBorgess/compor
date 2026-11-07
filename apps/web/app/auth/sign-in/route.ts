import { authClient, authConfig } from '../../../lib/supabase';
import { validAuthorizationId } from '../../../lib/oauth';
import { cookies } from 'next/headers';
import { localDevelopmentAuth } from '../../../lib/local-auth.ts';

const noStore = { 'Cache-Control': 'no-store' };
export async function POST(request:Request) {
  const config = authConfig();
  if (!config) return new Response('Login temporariamente indisponível.', { status: 503, headers: noStore });
  if (request.headers.get('origin') !== config.app) return new Response('Origem inválida.', { status: 403, headers: noStore });
  try {
    const form = request.headers.get('content-type') ? await request.formData() : new FormData();
    const id = form.get('authorization_id');
    const jar = await cookies();
    if (id !== null) {
      if (process.env.MCP_OAUTH_ENABLED !== 'true' || !validAuthorizationId(id)) return new Response('Solicitação inválida.', { status: 400, headers: noStore });
      jar.set('compor-oauth-pending', id, { httpOnly: true, secure: config.app.startsWith('https://'), sameSite: 'lax', path: '/', maxAge: 600 });
    } else jar.delete('compor-oauth-pending');
    const client = await authClient(config);
    if (id === null && localDevelopmentAuth(config)) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw new Error('Login local indisponível');
      return new Response(null, { status: 303, headers: { ...noStore, Location: '/' } });
    }
    const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${config.app}/auth/callback`, skipBrowserRedirect: true } });
    if (error || new URL(data.url).origin !== config.service) throw new Error('Login indisponível');
    return new Response(null, { status: 303, headers: { ...noStore, Location: data.url } });
  } catch {
    return new Response('Login temporariamente indisponível.', { status: 503, headers: noStore });
  }
}
