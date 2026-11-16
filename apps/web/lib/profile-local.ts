import type {StudioState,CreativeCriterion,CreativeDecision} from './studio-domain.ts';
import {criterionChoice} from './studio-direction.ts';

export type LocalProfileCriterion={projectId:string;pieceId:string|null;postName:string|null;criterion:CreativeCriterion;choice:CreativeDecision['choice'];reason:string};

export function localProfileCriteria(state:StudioState,userId:string,projectId:string):LocalProfileCriterion[] {
  if(state.userId!==userId||state.projectId!==projectId)throw Error('invalid_local_profile_scope');
  const scopes=[{pieceId:null,postName:null,direction:state.direction},...Object.entries(state.posts).map(([pieceId,post])=>({pieceId,postName:post.name||null,direction:post.direction}))];
  return scopes.flatMap(({pieceId,postName,direction})=>direction.criteria.map(criterion=>({projectId,pieceId,postName,criterion,choice:criterionChoice(direction,criterion.id),reason:direction.decisions.findLast(decision=>decision.criterionId===criterion.id)?.reason??''})));
}
