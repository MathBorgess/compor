import { authClient } from '../../../lib/supabase';
import { oauthConfig, safeText, validAuthorizationId, validProviderRedirect } from '../../../lib/oauth';

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin', 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' };
const html = (body, status = 200) => new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conectar ao Compor</title><main>${body}</main></html>`, { status, headers });
export async function GET(request) {
  const config = oauthConfig();
  if (!config) return html('<p>Conexão temporariamente indisponível.</p>', 503);
  const id = new URL(request.url).searchParams.get('authorization_id');
  if (!validAuthorizationId(id)) return html('<p>Solicitação inválida.</p>', 400);
  try {
    const client = await authClient(config);
    const { data: user, error: userError } = await client.auth.getUser();
    if (userError || !user?.user) return html(`<h1>Entre para continuar</h1><form method="post" action="/auth/sign-in"><input type="hidden" name="authorization_id" value="${safeText(id)}"><button>Entrar com Google</button></form>`);
    const { data, error } = await client.auth.oauth.getAuthorizationDetails(id);
    if (!error && data && !('authorization_id' in data) && validProviderRedirect(data.redirect_url)) {
      return new Response(null, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Location: data.redirect_url } });
    }
    if (error || !data || !('authorization_id' in data) || data.authorization_id !== id || data.user?.id !== user.user.id || !data.client || typeof data.client.name !== 'string' || typeof data.redirect_uri !== 'string' || typeof data.scope !== 'string') return html('<p>Solicitação indisponível ou já concluída.</p>', 400);
    return html(`<h1>Conectar ${safeText(data.client.name)} ao Compor?</h1><p>Este cliente poderá ler e criar projetos e peças da sua conta. Não forneça acesso a aplicativos que você não reconhece.</p><p>Cliente: ${safeText(data.client.name)}</p><p>Retorno: ${safeText(data.redirect_uri)}</p><p>Escopos solicitados: ${safeText(data.scope)}</p><form method="post" action="/oauth/decision"><input type="hidden" name="authorization_id" value="${safeText(id)}"><button name="decision" value="approve">Autorizar</button><button name="decision" value="deny">Negar</button></form>`);
  } catch { return html('<p>Conexão temporariamente indisponível.</p>', 503); }
}
