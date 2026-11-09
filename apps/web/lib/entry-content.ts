// Shared by the App Router entry (workspace.tsx) and the script-free entry (light-entry.ts) so both stay identical.
export const siteMetadata = {
  title: 'Compor',
  description: 'Crie uma direção para sua próxima divulgação.',
  icon: '/studio/compor-avatar.svg',
} as const;

export const brandImages = {
  symbol: { src: '/studio/brand-symbol.svg', width: '30', height: '30.4667' },
  wordmark: { src: '/studio/brand-wordmark.svg', alt: 'Compor', width: '100', height: '20.0997' },
} as const;

export const entryCopy = {
  title: 'Bom ter você por aqui.',
  description: 'Traga uma ideia. Encontre a direção do seu próximo post em uma conversa.',
  googleButton: 'Entrar com Google',
  googleNote: 'Uma conta Google para entrar e retomar seus projetos.',
  loginError: 'Não foi possível concluir o login. Tente novamente.',
  storageError: 'Não foi possível preservar seu rascunho. Copie o texto antes de continuar.',
  draftSummary: 'Seu rascunho anterior está preservado',
  byline: 'Compor por We MathAI',
} as const;

/** sessionStorage keys written before sign-in and claimed by workspace.tsx once the session is connected. */
export const entryDraftStorage = {
  seenAccount: 'compor-has-authenticated',
  claimPending: 'compor-claim-pending',
  draft: { guest: 'compor-objective:guest', anonymous: 'compor-objective:anonymous' },
} as const;

export type DraftSource = keyof typeof entryDraftStorage.draft;
