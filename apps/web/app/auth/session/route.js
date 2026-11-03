import { authClient, authConfig } from '../../../lib/supabase';

export async function GET() {
  const config = authConfig();
  if (!config) return Response.json({ state: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const client = await authClient(config);
    const { data, error } = await client.auth.getUser();
    if (error && error.status !== 401 && error.name !== 'AuthSessionMissingError') throw error;
    if (data.user && (typeof data.user.id !== 'string' || !data.user.id)) throw new Error('Identidade inválida');
    return Response.json(data.user ? { state: 'connected', userId: data.user.id } : { state: 'signed-out' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ state: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
