import { createServerClient } from '@supabase/ssr';
import { cookies } from './pages-request-cookies.ts';

import {authConfig} from './auth-config.ts';
export {authConfig} from './auth-config.ts';

export async function authClient(config:NonNullable<ReturnType<typeof authConfig>>) {
  const jar = await cookies();
  return createServerClient(config.service, config.key, {
    cookieOptions: { httpOnly: true, secure: config.app.startsWith('https://'), sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}

export type AuthConfig=NonNullable<ReturnType<typeof authConfig>>;
export type AuthClient=Awaited<ReturnType<typeof authClient>>;
