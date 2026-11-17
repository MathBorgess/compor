import {criterionChoice} from './studio-direction.ts';
import {audienceResolution} from './studio-context.ts';
import {generatedSignalsSchema,currentGeneratedFeedback} from './generated-feedback-contract.ts';
import {referenceSignalsResponseSchema,currentReferenceFeedback} from './reference-exploration-contract.ts';
import type {StudioState} from './studio-domain.ts';

/** Rebuild the same local and authorized feedback snapshot for planning or explicit replacement. */
export async function parallelExplorationContext(state:StudioState,projectId:string,conversationId:string,idea:string,fetchApi:typeof fetch=fetch){
  const local=conversationId!=='references';
  const read=async(path:string,project:boolean)=>{const response=await fetchApi(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,scope:project?'project':'account',...(project&&local?{pieceId:conversationId}:{})})});if(!response.ok)throw Error('feedback_unavailable');return response.json();};
  const [generated,external]=await Promise.all(['/api/studio/explorations/signals','/api/studio/references/signals'].map(async path=>Promise.all([read(path,false),...(local?[read(path,true)]:[])])));
  const generatedSignals=generated.flatMap(value=>generatedSignalsSchema.parse(value).signals),referenceSignals=external.flatMap(value=>referenceSignalsResponseSchema.parse(value).signals);
  const audience=audienceResolution(state);if(audience.status==='conflict')throw Error('audience_conflict');
  return {idea,offer:state.brief.offer,audience:audience.value,goal:state.brief.action,direction:state.brief.direction,offerFacts:state.offerFacts??[],accepted:state.direction.criteria.filter(item=>criterionChoice(state.direction,item.id)==='accept').slice(0,4).map(item=>item.statement.slice(0,160)),rejected:state.direction.criteria.filter(item=>criterionChoice(state.direction,item.id)==='reject').slice(0,4).map(item=>item.statement.slice(0,160)),feedback:[...currentGeneratedFeedback(generatedSignals),...currentReferenceFeedback(referenceSignals)]};
}
