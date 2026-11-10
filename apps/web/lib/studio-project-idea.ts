import {REFERENCE_SELECTION_EVENT} from './studio-state.ts';
import type {StudioState} from './studio-domain.ts';

export function studioProjectIdea(state:StudioState|null,openingPrompt='') {
  return state?.projectIdea.trim() || state?.messages.find(message=>message.role==='user'&&message.text.trim()!==REFERENCE_SELECTION_EVENT&&message.text.trim())?.text || openingPrompt;
}
