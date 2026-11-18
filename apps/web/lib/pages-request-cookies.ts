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
  const original = explicit.getSetCookie();
  const nameOf = (line: string) => line.slice(0, line.indexOf('=')).trim();
  const explicitNames = new Set(original.map(nameOf));
  // Keep each serialized line intact. Parsing it again can discard a zero Max-Age.
  return [...original, ...changed.getSetCookie().filter(line => !explicitNames.has(nameOf(line)))];
}
