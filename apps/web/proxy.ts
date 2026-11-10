import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from './lib/supabase.ts';
import { localDevelopmentAuth } from './lib/local-auth.ts';
import { lightEntryHeaders, renderLightEntry, servesLightEntry } from './lib/light-entry.ts';
import styleCss from './app/style.css?text';
import fontsCss from './app/fonts.css?text';
import brandSymbolCss from './app/brand-symbol.css?text';
import entryCss from './app/entry.css?text';

const css = [styleCss, fontsCss, brandSymbolCss, entryCss].join('\n');

export function proxy(request: NextRequest) {
  const auth = authConfig();
  const light = servesLightEntry(
    { method: request.method, pathname: request.nextUrl.pathname, cookieNames: request.cookies.getAll().map(cookie => cookie.name) },
    { auth, localAuth: Boolean(auth && localDevelopmentAuth(auth)) },
  );
  if (!light) return NextResponse.next();
  return new Response(renderLightEntry({ css, loginError: request.nextUrl.searchParams.get('login') === 'erro' }), { headers: lightEntryHeaders });
}

export const config = { matcher: '/' };
