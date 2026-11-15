import {parseStudioState,type StudioState,type StudioWorkflow} from './studio-state';

export function updateWorkflow(state:StudioState,patch:Partial<StudioWorkflow>) {
  return parseStudioState({...state,revision:state.revision+1,workflow:{...state.workflow,...patch}});
}
export function conversationMessages(state:StudioState,conversationId?:string) {
  const referenceIds=new Set(state.adjustments.filter(turn=>state.messages.some(message=>message.id===turn.messageId&&message.role==='system')).flatMap(turn=>[turn.messageId,...(turn.result?.messageId?[turn.result.messageId]:[])]));
  return state.messages.filter(message=>(message.conversationId??(referenceIds.has(message.id)?'references':message.context?.pieceId))===conversationId);
}
export function postIds(state:StudioState) {
  return [...new Set(state.drafts.map(draft=>draft.pieceId))];
}
