import * as z from './schema.ts';
import {criterionChoice} from './studio-direction.ts';
import type {StudioState} from './studio-domain.ts';
import {generatedSignalsSchema,currentGeneratedFeedback,type GeneratedSignal} from './generated-feedback-contract.ts';
import {referenceSignalsResponseSchema,currentReferenceFeedback,type ReferenceSignal} from './reference-exploration-contract.ts';

const gateSchema=z.object({status:z.enum(['active','awaiting_feedback'])});

export async function readExplorationGate(projectId:string, signal?:AbortSignal) {
  const response=await fetch('/api/studio/explorations/status',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId}),signal,
  });
  if(!response.ok)throw Error('gate_unavailable');
  return gateSchema.parse(await response.json()).status;
}

/** Account history is always read; a post additionally reads its own project-scoped signals. */
export async function readExplorationSignals(projectId:string, conversationId:string, fetchApi:typeof fetch, signal?:AbortSignal) {
  async function read(path:string,scope:'account'|'project') {
    const response=await fetchApi(path,{method:'POST',headers:{'content-type':'application/json'},signal,
      body:JSON.stringify({projectId,scope,...(scope==='project'?{pieceId:conversationId}:{})}),
    });
    if(!response.ok)throw Error('feedback_unavailable');
    return response.json();
  }
  const [generated,external]=await Promise.all(['/api/studio/explorations/signals','/api/studio/references/signals']
    .map(path=>Promise.all([read(path,'account'),...(conversationId==='references'?[]:[read(path,'project')])])));
  return {
    generatedSignals:generated.flatMap(value=>generatedSignalsSchema.parse(value).signals),
    referenceSignals:external.flatMap(value=>referenceSignalsResponseSchema.parse(value).signals),
  };
}

export function planningFeedback(generated:GeneratedSignal[],external:ReferenceSignal[]) {
  return [...currentGeneratedFeedback(generated),...currentReferenceFeedback(external)];
}

export function planningCriteria(direction:StudioState['direction']) {
  const statements=(decision:'accept'|'reject')=>direction.criteria
    .filter(item=>criterionChoice(direction,item.id)===decision).slice(0,4).map(item=>item.statement.slice(0,160));
  return {accepted:statements('accept'),rejected:statements('reject')};
}
