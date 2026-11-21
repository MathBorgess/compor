const comporVercelProjectId = 'prj_48C8lO4W6WdEMScyAfZRSnkvN6QS';
const comporPreviewHostname = /^compor-[a-z0-9]{9}-math-ai2\.vercel\.app$/;

export function resolveAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL_ENV === 'preview') {
    const host = env.VERCEL_URL;
    if (env.VERCEL !== '1' || env.VERCEL_PROJECT_ID !== comporVercelProjectId ||
        !host || host !== host.trim() || !comporPreviewHostname.test(host)) return null;
    return `https://${host}`;
  }

  try {
    const app = new URL(env.APP_ORIGIN ?? '');
    if (app.username || app.password || app.origin !== app.href.slice(0, -1)) return null;
    if (app.protocol === 'https:' || (app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname))) return app.origin;
    return null;
  } catch { return null; }
}

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
    const app = resolveAppOrigin();
    const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!app || !isPublicKey(key) || service.protocol !== 'https:' || service.origin !== service.href.slice(0, -1) ||
        service.username || service.password) return null;
    return { service: service.origin, app, key };
  } catch { return null; }
}
