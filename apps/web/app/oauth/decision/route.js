import { authClient } from '../../../lib/supabase';
import { oauthConfig, sameRedirect, validAuthorizationId } from '../../../lib/oauth';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'text/plain; charset=utf-8' };
export async function POST(request) {
  const config = oauthConfig();
  if (!config) return new Response('Conexão indisponível.', { status: 503, headers });
  if (request.headers.get('origin') !== config.app) return new Response('Origem inválida.', { status: 403, headers });
  try {
    const form = await request.formData();
    const id = form.get('authorization_id'), decision = form.get('decision');
    if (!validAuthorizationId(id) || !['approve', 'deny'].includes(decision)) return new Response('Solicitação inválida (FORM_INVALID). Reinicie a conexão no Codex.', { status: 400, headers });
    const client = await authClient(config);
    const { data: user, error: userError } = await client.auth.getUser();
    if (userError || !user?.user) return new Response('Autenticação necessária.', { status: 401, headers });
    const { data: details, error: detailsError } = await client.auth.oauth.getAuthorizationDetails(id);
    if (detailsError || !details) return new Response('Solicitação indisponível ou expirada (AUTHORIZATION_UNAVAILABLE). Reinicie a conexão no Codex.', { status: 400, headers });
    if (!('authorization_id' in details) || details.authorization_id !== id || details.user?.id !== user.user.id || typeof details.redirect_uri !== 'string') return new Response('Solicitação não pôde ser confirmada (AUTHORIZATION_MISMATCH). Reinicie a conexão no Codex.', { status: 400, headers });
    const { data, error } = decision === 'approve' ? await client.auth.oauth.approveAuthorization(id) : await client.auth.oauth.denyAuthorization(id);
    if (error || !data || !sameRedirect(details.redirect_uri, data.redirect_url)) return new Response('Solicitação indisponível.', { status: 502, headers });
    return new Response(null, { status: 303, headers: { ...headers, Location: data.redirect_url } });
  } catch { return new Response('Solicitação indisponível.', { status: 503, headers }); }
}
