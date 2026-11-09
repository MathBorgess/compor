import type { AuthConfig } from './supabase.ts';
import { brandImages, entryCopy, entryDraftStorage, siteMetadata } from './entry-content.ts';

export type LightEntryRequest = { method: string; pathname: string; cookieNames: readonly string[] };
export type LightEntrySettings = { auth: AuthConfig | null; localAuth: boolean; studioEnabled: boolean };

/** True only for a first visit that the App Router would answer with the signed-out entry; see ADR 0034. */
export function servesLightEntry(request: LightEntryRequest, settings: LightEntrySettings) {
  if (request.method !== 'GET' || request.pathname !== '/') return false;
  if (!settings.auth || settings.localAuth || !settings.studioEnabled) return false;
  const session = sessionCookieName(settings.auth.service);
  return !request.cookieNames.some(name => name === session || (name.startsWith(`${session}.`) && /^(0|[1-9]\d*)$/.test(name.slice(session.length + 1))));
}

// Matches the default storage key of @supabase/supabase-js and the chunk names of @supabase/ssr.
function sessionCookieName(service: string) {
  return `sb-${new URL(service).hostname.split('.')[0]}-auth-token`;
}

export const lightEntryHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
} as const;

const text = (value: string) => value.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const scriptData = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');

// Mirrors the signed-out branch and the sign-in submit handler of workspace.tsx.
const draftScript = `(() => {
  const storage = ${scriptData(entryDraftStorage)};
  const copy = ${scriptData({ storageError: entryCopy.storageError, draftSummary: entryCopy.draftSummary })};
  const panel = document.querySelector('.entry-panel');
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = content;
    return node;
  };
  let key = null, objective = '', draft = null, storageAlert = null;
  try {
    sessionStorage.removeItem(storage.claimPending);
    key = sessionStorage.getItem(storage.seenAccount) === '1' ? storage.draft.anonymous : storage.draft.guest;
    objective = sessionStorage.getItem(key) || '';
  } catch { key = null; }
  if (objective) {
    draft = element('details', 'entry-draft', '');
    draft.append(element('summary', '', copy.draftSummary), element('p', '', objective));
    panel.append(draft);
  }
  panel.querySelector('form').addEventListener('submit', event => {
    try {
      if (key) {
        sessionStorage.setItem(key, objective);
        sessionStorage.setItem(storage.claimPending, key === storage.draft.guest ? 'guest' : 'anonymous');
      }
    } catch {
      if (!objective) return;
      event.preventDefault();
      if (!storageAlert) {
        storageAlert = element('p', 'entry-alert', copy.storageError);
        storageAlert.setAttribute('role', 'alert');
        panel.insertBefore(storageAlert, draft);
      }
      draft.open = true;
    }
  });
})();`;

export function renderLightEntry({ css, loginError }: { css: string; loginError: boolean }) {
  const { symbol, wordmark } = brandImages;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(siteMetadata.title)}</title><meta name="description" content="${text(siteMetadata.description)}"><link rel="icon" href="${siteMetadata.icon}">
<style>${css}</style></head>
<body><main class="compor-entry" aria-labelledby="entry-title"><div class="entry-content">
<div class="entry-brand" aria-label="Compor"><span class="compor-brand-symbol" data-motion="arriving" aria-hidden="true"><img src="${symbol.src}" alt="" width="${symbol.width}" height="${symbol.height}"></span><img src="${wordmark.src}" alt="${text(wordmark.alt)}" width="${wordmark.width}" height="${wordmark.height}"></div>
<section class="entry-panel" aria-labelledby="entry-title"><h1 id="entry-title">${text(entryCopy.title)}</h1>
<p class="entry-description">${text(entryCopy.description)}</p>
<form action="/auth/sign-in" method="post"><button class="entry-google">${text(entryCopy.googleButton)}</button></form>
<p class="entry-note">${text(entryCopy.googleNote)}</p>${loginError ? `
<p class="entry-alert" role="alert">${text(entryCopy.loginError)}</p>` : ''}
</section><p class="entry-byline">${text(entryCopy.byline)}</p></div></main>
<script>${draftScript}</script></body></html>
`;
}
