import {changeStudioState,createPost,parseStudioState,StudioStateError,type StudioState,type StudioWorkflow} from './studio-state';
import {emptyPostSettings} from './studio-post-context';

export function updateWorkflow(state:StudioState,patch:Partial<StudioWorkflow>) {
  return parseStudioState({...state,revision:state.revision+1,workflow:{...state.workflow,...patch}});
}
export function conversationMessages(state:StudioState,conversationId?:string) {
  if(conversationId===undefined)return state.messages;
  const referenceIds=new Set(state.adjustments.filter(turn=>state.messages.some(message=>message.id===turn.messageId&&message.role==='system')).flatMap(turn=>[turn.messageId,...(turn.result?.messageId?[turn.result.messageId]:[])]));
  return state.messages.filter(message=>(message.conversationId??(referenceIds.has(message.id)?'references':message.context?.pieceId))===conversationId);
}
export function postIds(state:StudioState) {
  return [...new Set(state.drafts.map(draft=>draft.pieceId))].filter(id=>id!==state.workflow.referencePieceId);
}

export function startPostPreparation(state:StudioState,pieceId:string) {
  if(state.drafts.some(draft=>draft.pieceId===pieceId))throw new StudioStateError('studio_draft_unavailable');
  return changeStudioState(createPost(state,{pieceId}),next=>{
    next.posts[pieceId]={...emptyPostSettings(),prepared:false};
    next.workflow.view='prepare-post';
  });
}

export function completePostPreparation(state:StudioState) {
  return changeStudioState(state,next=>{
    if(!next.selection||next.selection.pieceId===next.workflow.referencePieceId)throw new StudioStateError('studio_draft_unavailable');
    const id=next.selection.pieceId;
    next.posts[id]={...emptyPostSettings(),...next.posts[id],prepared:true};
    next.workflow.view='compose';
  });
}

/** Reference turns require a draft identity; this internal workspace is never a user post. */
export function prepareReferenceWorkspace(state:StudioState,pieceId:string) {
  if(state.selection)return state;
  return updateWorkflow(createPost(state,{pieceId}),{referencePieceId:pieceId});
}
