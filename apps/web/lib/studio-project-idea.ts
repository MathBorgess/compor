import {REFERENCE_SELECTION_EVENT} from './studio-state.ts';
import type {StudioState} from './studio-domain.ts';

export function studioProjectIdea(state:StudioState|null,openingPrompt='') {
  return state?.projectIdea.trim() || state?.messages.find(message=>message.role==='user'&&message.text.trim()!==REFERENCE_SELECTION_EVENT&&message.text.trim())?.text || openingPrompt;
}

/** The current post or initial idea takes priority over the offer for reference discovery. */
export function referenceDiscoverySubject(state:StudioState,idea:string):string {
  return idea.trim() || state.brief.offer.trim();
}
