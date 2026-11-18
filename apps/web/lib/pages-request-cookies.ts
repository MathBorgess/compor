import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest, NextResponse } from 'next/server';

type CookieOptions = Partial<ReturnType<NextResponse['cookies']['getAll']>[number]>;

function createCookieScope(headers: Headers) {
  const incoming = new NextRequest('http://localhost/', { headers }).cookies;
  const changes = new NextResponse(null);
  return {
    headers: changes.headers,
    jar: {
      get: (name: string) => incoming.get(name),
      getAll: () => incoming.getAll(),
      set(name: string, value: string, options: CookieOptions) {
        incoming.set(name, value);
        changes.cookies.set(name, value, options);
      },
      delete(name: string) {
        incoming.set(name, '');
        changes.cookies.delete(name);
      },
    },
  };
}

const scopes = new AsyncLocalStorage<ReturnType<typeof createCookieScope>>();

export function withRequestCookies<T>(headers: Headers, run: (outgoing: Headers) => Promise<T>): Promise<T> {
  const scope = createCookieScope(headers);
  return scopes.run(scope, () => run(scope.headers));
}

export async function cookies() {
  const scope = scopes.getStore();
  if (!scope) throw Error('Cookies require an active request.');
  return scope.jar;
}

/** Mirror the Route Handler rule that explicit response cookies take precedence over jar changes. */
export function outgoingCookies(explicit: Headers, changed: Headers): string[] {
  if (!changed.has('set-cookie')) return explicit.getSetCookie();
  const response = new NextResponse(null, {headers: explicit});
  const original = response.cookies.getAll();
  for (const value of new NextResponse(null, {headers: changed}).cookies.getAll()) response.cookies.set(value);
  for (const value of original) response.cookies.set(value);
  return response.headers.getSetCookie();
}
