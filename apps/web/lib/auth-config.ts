function isPublicKey(value:unknown):value is string {
  if (typeof value !== 'string' || !value || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

export function authConfig() {
  try {
    const service = new URL(process.env.SUPABASE_URL??'');
    const app = new URL(process.env.APP_ORIGIN??'');
    const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!isPublicKey(key) || service.protocol !== 'https:' || service.origin !== service.href.slice(0, -1) || !['https:', 'http:'].includes(app.protocol) || app.origin !== app.href.slice(0, -1)) return null;
    if (app.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(app.hostname)) return null;
    if (service.username || service.password || app.username || app.password) return null;
    return { service: service.origin, app: app.origin, key };
  } catch { return null; }
}
