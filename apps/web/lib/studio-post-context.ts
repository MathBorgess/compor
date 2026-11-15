import {parseDirection,proposeCriterion,decideCriterion} from './studio-direction.ts';
import type {CreativeCriterion,CreativeDecision,PostContext,StudioReference,StudioState} from './studio-domain.ts';
import {changeStudioState,StudioStateError} from './studio-state.ts';

export const emptyPostSettings=()=>({name:'',deleted:false,prepared:true,direction:{criteria:[] as CreativeCriterion[],decisions:[] as CreativeDecision[]},objective:'',message:'',action:'',referenceIds:[] as string[],excludedReferenceIds:[] as string[]});
export function postContext(state:StudioState,pieceId:string):PostContext {
  const post=state.posts[pieceId]??emptyPostSettings();
  return {objective:post.objective,message:post.message,action:post.action};
}
export function effectiveReferences(state:StudioState,scope?:string):StudioReference[] {
  if(scope===undefined)return state.references;
  const post=state.posts[scope];
  const ids=new Set(scope==='references'?state.projectReferenceIds:[...state.projectReferenceIds.filter(id=>!post?.excludedReferenceIds.includes(id)),...post?.referenceIds??[]]);
  return state.references.filter(reference=>ids.has(reference.id));
}
/** Read-only projection. Reducers and persistence always receive the canonical state. */
export function conversationDirection(state:StudioState,scope?:string) {
  const local=scope&&scope!=='references'?state.posts[scope]?.direction:undefined;
  if(!local)return state.direction;
  const localIds=new Set(local.criteria.map(item=>item.id));
  return {criteria:[...state.direction.criteria.filter(item=>!localIds.has(item.id)),...local.criteria],decisions:[...state.direction.decisions.filter(item=>!localIds.has(item.criterionId)),...local.decisions]};
}
export function conversationContext(state:StudioState,scope?:string) {
  return {...state,direction:conversationDirection(state,scope),referenceScope:scope,references:effectiveReferences(state,scope),brief:{...state.brief,action:scope&&scope!=='references'?postContext(state,scope).action:''}};
}
export function validatePostSettings(state:StudioState) {
  const ids=new Set(state.references.map(reference=>reference.id));
  const validIds=(values:string[])=>new Set(values).size===values.length&&values.every(id=>ids.has(id));
  return validIds(state.projectReferenceIds)&&Object.entries(state.posts).every(([id,post])=>state.drafts.some(draft=>draft.pieceId===id)&&Boolean(parseDirection(post.direction))&&Boolean(parseDirection(conversationDirection(state,id)))&&validIds(post.referenceIds)&&validIds(post.excludedReferenceIds)&&[post.objective,post.message,post.action].every(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|sk-[^\s]+/i.test(value)));
}
function settings(state:StudioState,pieceId:string) {
  if(!state.drafts.some(draft=>draft.pieceId===pieceId))throw new StudioStateError('studio_draft_unavailable');
  return state.posts[pieceId]??(state.posts[pieceId]=emptyPostSettings());
}
export function updatePostContext(state:StudioState,pieceId:string,patch:Partial<PostContext>) {
  return changeStudioState(state,next=>{
    if(!Object.keys(patch).length||!Object.keys(patch).every(key=>['objective','message','action'].includes(key)))throw new StudioStateError();
    Object.assign(settings(next,pieceId),patch);
  });
}
export function selectScopedReference(state:StudioState,reference:StudioReference,scope='references') {
  return changeStudioState(state,next=>{
    const existing=next.references.find(item=>item.id===reference.id);
    if(existing&&JSON.stringify(existing)!==JSON.stringify(reference))throw new StudioStateError();
    if(!existing)next.references.push(reference);
    const selected=scope==='references'||next.projectReferenceIds.includes(reference.id)?next.projectReferenceIds:settings(next,scope).referenceIds;
    if(!selected.includes(reference.id))selected.push(reference.id);
    if(scope!=='references')settings(next,scope).excludedReferenceIds=settings(next,scope).excludedReferenceIds.filter(id=>id!==reference.id);
  });
}
export function unselectScopedReference(state:StudioState,id:string,scope='references') {
  return changeStudioState(state,next=>{
    if(scope==='references')next.projectReferenceIds=next.projectReferenceIds.filter(value=>value!==id);
    else {
      const post=settings(next,scope);
      post.referenceIds=post.referenceIds.filter(value=>value!==id);
      if(next.projectReferenceIds.includes(id)&&!post.excludedReferenceIds.includes(id))post.excludedReferenceIds.push(id);
    }
    // Keep shared blobs and immutable attempt snapshots; detach only this selection.
    const used=next.projectReferenceIds.includes(id)||Object.values(next.posts).some(post=>post.referenceIds.includes(id))||[next.direction,...Object.values(next.posts).map(post=>post.direction)].some(direction=>direction.criteria.some(item=>item.example.referenceId===id||item.counterexample.referenceId===id));
    if(!used){next.references=next.references.filter(item=>item.id!==id);for(const post of Object.values(next.posts))post.excludedReferenceIds=post.excludedReferenceIds.filter(value=>value!==id);}
  });
}
export function freezeCreationContext(state:StudioState,pieceId:string,baseVersion:number,context:NonNullable<StudioState['drafts'][number]['creationContext']>) {
  return changeStudioState(state,next=>{const draft=next.drafts.find(item=>item.pieceId===pieceId&&item.baseVersion===baseVersion);if(!draft)throw new StudioStateError('studio_draft_unavailable');draft.creationContext=context;});
}

export function addPostCriterion(state:StudioState,pieceId:string,criterion:CreativeCriterion) {
  return changeStudioState(state,next=>{const post=settings(next,pieceId);post.direction=proposeCriterion(post.direction,criterion);});
}
export function decidePostCriterion(state:StudioState,pieceId:string,decision:CreativeDecision) {
  return changeStudioState(state,next=>{const post=settings(next,pieceId);if(!post.direction.criteria.some(item=>item.id===decision.criterionId)){const shared=next.direction.criteria.find(item=>item.id===decision.criterionId);if(!shared)throw new StudioStateError();post.direction.criteria.push(shared);}post.direction=decideCriterion(post.direction,decision);});
}
