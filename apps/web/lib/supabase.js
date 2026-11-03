import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function authConfig() {
  try {
    const service = new URL(process.env.SUPABASE_URL);
    const app = new URL(process.env.APP_ORIGIN);
    const key = process.env.SUPABASE_ANON_KEY?.trim();
    if (!key || service.protocol !== 'https:' || service.origin !== service.href.slice(0, -1) || !['https:', 'http:'].includes(app.protocol) || app.origin !== app.href.slice(0, -1)) return null;
    if (app.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(app.hostname)) return null;
    if (service.username || service.password || app.username || app.password) return null;
    return { service: service.origin, app: app.origin, key };
  } catch { return null; }
}

export async function authClient(config) {
  const jar = await cookies();
  return createServerClient(config.service, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}
