import type { AuthConfig } from './supabase.ts';

/** Explicit opt-in for an isolated development Supabase; never enables remote bypass. */
export function localDevelopmentAuth(config:AuthConfig, env:NodeJS.ProcessEnv=process.env) {
  if (env.NODE_ENV !== 'development' || env.COMPOR_LOCAL_AUTH_ENABLED !== 'true') return false;
  try {
    const app = new URL(config.app), service = new URL(config.service);
    return app.protocol === 'http:' && app.hostname === '127.0.0.1' && app.origin === config.app
      && service.protocol === 'https:' && service.hostname === '127.0.0.1' && service.origin === config.service
      && !app.username && !app.password && !service.username && !service.password;
  } catch { return false; }
}
