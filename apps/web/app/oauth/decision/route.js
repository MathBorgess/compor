import { authClient } from '../../../lib/supabase';
import { oauthConfig, redirectValidation, validAuthorizationId } from '../../../lib/oauth';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Type': 'text/plain; charset=utf-8' };
const eventNames = new Set(['provider_result_received', 'provider_error_or_empty', 'redirect_validated', 'redirect_rejected_scheme', 'redirect_rejected_userinfo', 'redirect_rejected_fragment', 'redirect_rejected_origin', 'redirect_rejected_path', 'redirect_rejected_insecure_host', 'redirect_rejected_query', 'redirect_rejected_invalid_url', 'response_prepared_303', 'response_prepared_502']);
function recordEvent(name) {
  if (!eventNames.has(name)) return;
  try { console.info(`COMPOR_OAUTH_EVENT ${name}`); } catch { /* Observability must not affect an already-sent decision. */ }
}
function detailsFailure(error) {
  if (error?.name === 'AuthSessionMissingError') return 'AUTHORIZATION_SESSION_MISSING';
  if (error?.status === 404) return 'AUTHORIZATION_NOT_FOUND';
  if (error?.status === 400 && error?.code === 'validation_failed' && error?.message === 'authorization request cannot be processed') return 'AUTHORIZATION_NOT_PENDING';
  if (error?.status === 400 && error?.code === 'validation_failed' && error?.message === 'unauthorized request origin') return 'AUTHORIZATION_PROVIDER_ORIGIN';
  if (error?.status === 400) return 'AUTHORIZATION_REJECTED';
  if (error?.status === 401 || error?.status === 403) return 'AUTHORIZATION_SESSION_REJECTED';
  if (error?.status === 429) return 'AUTHORIZATION_RATE_LIMITED';
  if (error?.status >= 500) return 'AUTHORIZATION_SERVICE_UNAVAILABLE';
  return 'AUTHORIZATION_UNAVAILABLE';
}
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
    if (detailsError || !details) return new Response(`Solicitação indisponível (${detailsFailure(detailsError)}). Reinicie a conexão no Codex.`, { status: 400, headers });
    if (!('authorization_id' in details) || details.authorization_id !== id || details.user?.id !== user.user.id || typeof details.redirect_uri !== 'string') return new Response('Solicitação não pôde ser confirmada (AUTHORIZATION_MISMATCH). Reinicie a conexão no Codex.', { status: 400, headers });
    const { data, error } = decision === 'approve' ? await client.auth.oauth.approveAuthorization(id) : await client.auth.oauth.denyAuthorization(id);
    if (error || !data) { const response = new Response('Solicitação indisponível.', { status: 502, headers }); recordEvent('provider_error_or_empty'); recordEvent('response_prepared_502'); return response; }
    recordEvent('provider_result_received');
    const validation = redirectValidation(details.redirect_uri, data.redirect_url);
    if (validation !== 'valid') { const response = new Response('Solicitação indisponível.', { status: 502, headers }); recordEvent(`redirect_rejected_${validation}`); recordEvent('response_prepared_502'); return response; }
    recordEvent('redirect_validated');
    const response = new Response(null, { status: 303, headers: { ...headers, Location: data.redirect_url } });
    recordEvent('response_prepared_303');
    return response;
  } catch { return new Response('Solicitação indisponível.', { status: 503, headers }); }
}
