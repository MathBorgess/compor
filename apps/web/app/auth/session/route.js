import { authClient, authConfig } from '../../../lib/supabase';

export async function GET() {
  const config = authConfig();
  if (!config) return Response.json({ state: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const client = await authClient(config);
    const { data, error } = await client.auth.getUser();
    if (error && error.status !== 401 && error.name !== 'AuthSessionMissingError') throw error;
    return Response.json({ state: data.user ? 'connected' : 'signed-out' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ state: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
