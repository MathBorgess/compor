import { authClient, authConfig } from '../../../lib/supabase';

const noStore = { 'Cache-Control': 'no-store' };
export async function POST(request) {
  const config = authConfig();
  if (!config) return new Response('Login temporariamente indisponível.', { status: 503, headers: noStore });
  if (request.headers.get('origin') !== config.app) return new Response('Origem inválida.', { status: 403, headers: noStore });
  try {
    const client = await authClient(config);
    const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${config.app}/auth/callback`, skipBrowserRedirect: true } });
    if (error || new URL(data.url).origin !== config.service) throw new Error('Login indisponível');
    return new Response(null, { status: 303, headers: { ...noStore, Location: data.url } });
  } catch {
    return new Response('Login temporariamente indisponível.', { status: 503, headers: noStore });
  }
}
