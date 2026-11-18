import { authConfig } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export async function GET() {
  const config = authConfig();
  if (process.env.MCP_OAUTH_ENABLED !== 'true' || !config) return new Response('OAuth indisponível.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ resource: `${config.app}/api/mcp`, authorization_servers: [`${config.service}/auth/v1`], bearer_methods_supported: ['header'] }, { headers: { 'Cache-Control': 'no-store' } });
}
