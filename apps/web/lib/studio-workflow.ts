import {changeStudioState,createPost,selectDraft,parseStudioState,StudioStateError,type StudioState,type StudioWorkflow} from './studio-state';
import {emptyPostSettings} from './studio-post-context';
import {postNameSchema} from './post-catalog';
import {postContextSchema,type PostContext} from './studio-domain';

export function updateWorkflow(state:StudioState,patch:Partial<StudioWorkflow>) {
  return parseStudioState({...state,revision:state.revision+1,workflow:{...state.workflow,...patch}});
}
export function conversationMessages(state:StudioState,conversationId?:string) {
  const referenceIds=new Set(state.adjustments.filter(turn=>state.messages.some(message=>message.id===turn.messageId&&message.role==='system')).flatMap(turn=>[turn.messageId,...(turn.result?.messageId?[turn.result.messageId]:[])]));
  return state.messages.filter(message=>(message.conversationId??(referenceIds.has(message.id)?'references':message.context?.pieceId))===conversationId);
}
export function postIds(state:StudioState) {
  return [...new Set(state.drafts.map(draft=>draft.pieceId))].filter(id=>id!==state.workflow.referencePieceId&&!state.posts[id]?.deleted);
}

export function startPostPreparation(state:StudioState,pieceId:string,initialProjectTitle?:string) {
  if(state.drafts.some(draft=>draft.pieceId===pieceId))throw new StudioStateError('studio_draft_unavailable');
  const initial=initialProjectTitle!==undefined;
  const name=initial?postNameSchema.safeParse(initialProjectTitle).data??'':'';
  const message=initial?postContextSchema.shape.message.safeParse(state.brief.offer).data??'':'';
  return changeStudioState(state,next=>{
    next.workflow.pendingPost={pieceId,name,objective:'',message,action:'',...(initial?{initial:true as const}:{})};
    next.workflow.view='prepare-post';
  });
}

export function updatePostPreparation(state:StudioState,patch:Partial<PostContext&{name:string}>) {
  return changeStudioState(state,next=>{if(!next.workflow.pendingPost)throw new StudioStateError();Object.assign(next.workflow.pendingPost,patch);});
}
export function cancelPostPreparation(state:StudioState){return changeStudioState(state,next=>{next.workflow.pendingPost=null;next.workflow.view='posts';});}
export function updateLegacyPostName(state:StudioState,pieceId:string,name:string){return changeStudioState(state,next=>{next.posts[pieceId]={...emptyPostSettings(),...next.posts[pieceId],name};});}

export function completePostPreparation(state:StudioState) {
  const pending=state.workflow.pendingPost;
  if(pending){
    const name=postNameSchema.parse(pending.name);
    const prepared={...state,workflow:{...state.workflow,pendingPost:null}};
    return changeStudioState(createPost(prepared,{pieceId:pending.pieceId}),next=>{
      next.posts[pending.pieceId]={...emptyPostSettings(),name,objective:pending.objective,message:pending.message,action:pending.action};
      next.workflow.pendingPost=null;next.workflow.view='compose';
    });
  }
  return changeStudioState(state,next=>{
    if(!next.selection||next.selection.pieceId===next.workflow.referencePieceId)throw new StudioStateError('studio_draft_unavailable');
    const id=next.selection.pieceId;
    next.posts[id]={...emptyPostSettings(),...next.posts[id],name:postNameSchema.parse(next.posts[id]?.name),prepared:true};
    next.workflow.view='compose';
  });
}

export function removePostFromList(state:StudioState,pieceId:string){
  return changeStudioState(state,next=>{
    if(pieceId===next.workflow.referencePieceId)throw new StudioStateError();
    if(next.adjustments.some(turn=>turn.context.pieceId===pieceId&&!['completed','failed'].includes(turn.status)))throw new StudioStateError('studio_operation_active');
    if(next.drafts.some(draft=>draft.pieceId===pieceId))next.posts[pieceId]={...emptyPostSettings(),...next.posts[pieceId],deleted:true};
    if(next.selection?.pieceId===pieceId){next.selection=null;next.workflow.view='posts';}
  });
}

/** Reference turns require a draft identity; this internal workspace is never a user post. */
export function prepareReferenceWorkspace(state:StudioState,pieceId:string) {
  if(state.selection)return state;
  if(state.workflow.referencePieceId)return selectDraft(state,{pieceId:state.workflow.referencePieceId,baseVersion:0});
  return updateWorkflow(createPost(state,{pieceId}),{referencePieceId:pieceId});
}
