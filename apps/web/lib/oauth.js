import { authConfig } from './supabase';

export function oauthConfig() {
  return process.env.MCP_OAUTH_ENABLED === 'true' ? authConfig() : null;
}
export function validAuthorizationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(value);
}
// The URL is accepted only from the authenticated Supabase authorization response.
// Supabase validates the registered client redirect URI and PKCE before issuing it.
export function validProviderRedirect(destination) {
  try {
    if (typeof destination !== 'string' || destination.length > 8192) return false;
    const target = new URL(destination);
    if (target.username || target.password || target.hash || !['https:', 'http:'].includes(target.protocol)) return false;
    if (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) return false;
    if (target.searchParams.getAll('code').length !== 1 || !target.searchParams.get('code') || target.searchParams.has('error') || target.searchParams.getAll('state').length > 1) return false;
    return true;
  } catch { return false; }
}
export function sameRedirect(registered, destination) {
  try {
    const expected = new URL(registered);
    const target = new URL(destination);
    if (!['https:', 'http:'].includes(expected.protocol) || expected.username || expected.password || target.username || target.password || expected.hash || target.hash || expected.origin !== target.origin || expected.pathname !== target.pathname) return false;
    if (expected.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname)) return false;
    for (const [key, value] of expected.searchParams) if (target.searchParams.get(key) !== value) return false;
    return true;
  } catch { return false; }
}
export function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
