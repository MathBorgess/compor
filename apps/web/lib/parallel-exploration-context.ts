import {audienceResolution} from './studio-context.ts';
import type {StudioState} from './studio-domain.ts';
import {readExplorationSignals,planningCriteria,planningFeedback} from './exploration-feedback.ts';

/** Rebuild the same local and authorized feedback snapshot for planning or explicit replacement. */
export async function parallelExplorationContext(state:StudioState,projectId:string,conversationId:string,idea:string,fetchApi:typeof fetch=fetch){
  const {generatedSignals,referenceSignals}=await readExplorationSignals(projectId,conversationId,fetchApi);
  const audience=audienceResolution(state);if(audience.status==='conflict')throw Error('audience_conflict');
  return {idea,offer:state.brief.offer,audience:audience.value,goal:state.brief.action,direction:state.brief.direction,offerFacts:state.offerFacts??[],...planningCriteria(state.direction),feedback:planningFeedback(generatedSignals,referenceSignals)};
}
