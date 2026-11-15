import {parseStudioState,type StudioState,type StudioWorkflow,type StudioMessage} from './studio-state';

export function updateWorkflow(state:StudioState,patch:Partial<StudioWorkflow>) {
  return parseStudioState({...state,revision:state.revision+1,workflow:{...state.workflow,...patch}});
}
/** Unassigned historical messages remain available in the legacy history only. */
export function messageConversation(message:StudioMessage) {
  return message.conversationId??(message.role==='system'?'references':message.context?.pieceId??null);
}
export function conversationMessages(state:StudioState,conversationId?:string) {
  if(conversationId===undefined)return state.messages;
  const referenceIds=new Set(state.adjustments.filter(turn=>state.messages.some(message=>message.id===turn.messageId&&message.role==='system')).flatMap(turn=>[turn.messageId,...(turn.result?.messageId?[turn.result.messageId]:[])]));
  return state.messages.filter(message=>(message.conversationId??(referenceIds.has(message.id)?'references':message.context?.pieceId))===conversationId);
}
export function postIds(state:StudioState) {
  return [...new Set(state.drafts.map(draft=>draft.pieceId))];
}
