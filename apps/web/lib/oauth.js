import { authConfig } from './supabase';

export function oauthConfig() {
  return process.env.MCP_OAUTH_ENABLED === 'true' ? authConfig() : null;
}
export function validAuthorizationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(value);
}
export function sameRedirect(registered, destination) {
  try {
    const expected = new URL(registered);
    const target = new URL(destination);
    if (!['https:', 'http:'].includes(expected.protocol) || expected.username || expected.password || expected.hash || target.hash || expected.origin !== target.origin || expected.pathname !== target.pathname) return false;
    if (expected.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname)) return false;
    for (const [key, value] of expected.searchParams) if (target.searchParams.get(key) !== value) return false;
    return true;
  } catch { return false; }
}
export function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
