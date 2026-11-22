import {referenceDiscoverySubject} from './studio-project-idea.ts';
import {audienceResolution} from './studio-context.ts';
import type {StudioState} from './studio-domain.ts';
import {postFormatOf} from './studio-post-context.ts';
import {readExplorationSignals,planningCriteria,planningFeedback} from './exploration-feedback.ts';

/** Rebuild the same local and authorized feedback snapshot for planning or explicit replacement. */
export async function parallelExplorationContext(state:StudioState,projectId:string,conversationId:string,idea:string,fetchApi:typeof fetch=fetch,signal?:AbortSignal){
  const {generatedSignals,referenceSignals}=await readExplorationSignals(projectId,conversationId,fetchApi,signal);
  const audience=audienceResolution(state);if(audience.status==='conflict')throw Error('audience_conflict');
  const format=conversationId!=='references'?postFormatOf(state,conversationId):'single';
  const hasVoice=Boolean(state.brandVoice && (state.brandVoice.tone.trim() || state.brandVoice.examples.trim() || state.brandVoice.avoid.trim()));
  return {
    idea:referenceDiscoverySubject(state,idea),
    offer:state.brief.offer,
    audience:audience.value,
    goal:state.brief.action,
    direction:state.brief.direction,
    offerFacts:state.offerFacts??[],
    ...planningCriteria(state.direction),
    feedback:planningFeedback(generatedSignals,referenceSignals),
    ...(format!=='single'?{postFormat:format}:{}),
    ...(hasVoice&&state.brandVoice?{brandVoice:state.brandVoice}:{}),
  };
}
