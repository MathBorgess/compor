import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from './lib/auth-config.ts';
import { localDevelopmentAuth } from './lib/local-auth.ts';
import { lightEntryHeaders, renderLightEntry, servesLightEntry } from './lib/light-entry.ts';
import styleCss from './studio/style.css?text';
import fontsCss from './studio/fonts.css?text';
import brandSymbolCss from './studio/brand-symbol.css?text';
import entryCss from './studio/entry.css?text';

const css = [styleCss, fontsCss, brandSymbolCss, entryCss].join('\n');

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/__compor_bridge/')) {
    return NextResponse.rewrite(new URL('/404',request.url),{status:404});
  }
  const auth = authConfig();
  const light = servesLightEntry(
    { method: request.method, pathname: request.nextUrl.pathname, cookieNames: request.cookies.getAll().map(cookie => cookie.name) },
    { auth, localAuth: Boolean(auth && localDevelopmentAuth(auth)) },
  );
  if (!light) return NextResponse.next();
  return new Response(renderLightEntry({ css, loginError: request.nextUrl.searchParams.get('login') === 'erro' }), { headers: lightEntryHeaders });
}

export const config = { matcher: ['/', '/api/__compor_bridge/:path*'] };
