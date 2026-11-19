import {explorationImageOutcomes} from './exploration-image-outcome.ts';
import * as z from './schema.ts';
import {explorationCandidateSchema,type StudioState} from './studio-domain.ts';
import {getCurrentDraft,changeStudioState,StudioStateError} from './studio-state.ts';
import {freezeCreationContext} from './studio-post-context.ts';
import type {createStudioStorage} from './studio-storage.ts';

type Candidate=z.infer<typeof explorationCandidateSchema>;
type Repository=Pick<ReturnType<typeof createStudioStorage>,'getDraftAsset'|'putDraftAsset'>;
const listing=z.object({images:z.array(z.object({id:z.uuid(),project_id:z.uuid(),state:z.enum(explorationImageOutcomes),ordinal:z.number().check(z.int()).check(z.positive())})).check(z.maxLength(100)),nextBeforeOrdinal:z.optional(z.nullable(z.number().check(z.int()).check(z.positive())))});

export async function confirmedExploration(projectId:string,imageId:string,fetcher:typeof fetch=fetch,expectedOrdinal?:number):Promise<Candidate> {
  let cursor=expectedOrdinal===undefined?undefined:expectedOrdinal+1;
  for(;;){
    const response=await fetcher(`/api/studio/explorations?${new URLSearchParams({projectId,...(cursor===undefined?{}:{beforeOrdinal:String(cursor)})})}`,{cache:'no-store'});
    if(!response.ok)throw Error('exploration_unavailable');
    const page=listing.parse(await response.json());
    if(page.images.some(item=>item.project_id!==projectId||cursor!==undefined&&item.ordinal>=cursor))throw Error('exploration_unconfirmed');
    const row=page.images.find(item=>item.id===imageId);
    if(row){if(row.state!=='completed')throw Error('exploration_unconfirmed');return {imageId:row.id,ordinal:row.ordinal};}
    if(expectedOrdinal!==undefined||page.nextBeforeOrdinal==null)throw Error('exploration_unconfirmed');
    if(cursor!==undefined&&page.nextBeforeOrdinal>=cursor)throw Error('exploration_unconfirmed');
    cursor=page.nextBeforeOrdinal;
  }
}

/** A confirmed completion belongs to its originating conversation, including a late response. */
export function recordCompletedExploration(state:StudioState,conversationId:string,candidate:Candidate) {
  const value=explorationCandidateSchema.parse(candidate);
  if(conversationId!=='references'&&!state.drafts.some(draft=>draft.pieceId===conversationId))throw new StudioStateError('studio_draft_unavailable');
  if((state.workflow.latestExplorations?.[conversationId]?.ordinal??0)>=value.ordinal)return state;
  return changeStudioState(state,next=>{next.workflow.latestExplorations={...next.workflow.latestExplorations,[conversationId]:value};});
}
function eligible(state:StudioState,conversationId:string) {
  const draft=getCurrentDraft(state);
  return draft&&draft.pieceId!==state.workflow.referencePieceId&&draft.baseVersion===0&&draft.expectedLatestVersion===0&&!draft.dirty&&draft.approval.status==='unapproved'&&
    (conversationId==='references'||conversationId===draft.pieceId)&&
    !state.drafts.some(item=>item.pieceId===draft.pieceId&&item.baseVersion>0)&&
    !Object.entries(draft.content).some(([key,value])=>key==='fields'?Array.isArray(value)&&value.length>0:key!=='captionOrigin'&&typeof value==='string'&&value.trim());
}
/** Reads completed bytes only. The conditional IDB insert preserves an upload from another tab. */
export async function prepareExplorationDraft({conversationId,getState,change,flush,storage,fetcher=fetch}:{conversationId:string;getState:()=>StudioState;change:(reducer:(state:StudioState)=>StudioState)=>StudioState|null;flush:()=>Promise<void>;storage:Repository;fetcher?:typeof fetch}):Promise<'retained'|'preserved'|'none'> {
  const initial=getState(),draft=getCurrentDraft(initial),candidate=initial.workflow.latestExplorations?.[conversationId];
  if(!candidate)return 'none';
  if(!draft||!eligible(initial,conversationId))return 'preserved';
  const scope={userId:initial.userId,projectId:initial.projectId},address={pieceId:draft.pieceId,baseVersion:0,kind:'base' as const};
  if(await storage.getDraftAsset(scope,address))return 'preserved';
  const confirmed=await confirmedExploration(scope.projectId,candidate.imageId,fetcher,candidate.ordinal);
  if(confirmed.ordinal!==candidate.ordinal)throw Error('exploration_unconfirmed');
  const image=await fetcher(`/api/studio/explorations/image?${new URLSearchParams({projectId:scope.projectId,imageId:candidate.imageId})}`,{cache:'no-store'});
  if(!image.ok)throw Error('exploration_image_unavailable');
  const file=await image.blob();
  if(file.type!=='image/png'||!file.size||file.size>8*1024*1024)throw Error('exploration_image_invalid');
  const current=getState();
  if(current.userId!==scope.userId||current.projectId!==scope.projectId||current.selection?.pieceId!==draft.pieceId||!eligible(current,conversationId))return 'preserved';
  const latest=current.workflow.latestExplorations?.[conversationId];
  if(latest?.imageId!==candidate.imageId||latest.ordinal!==candidate.ordinal)throw Error('exploration_changed');
  await flush();
  try {await storage.putDraftAsset({...scope,...address,file,ifAbsent:true,expectedRevision:current.revision});}
  catch(error) {if(error instanceof Error&&'code' in error&&error.code==='studio_draft_asset_exists')return 'preserved';throw error;}
  // Text-only explorations have no evidence that a selected image was consumed.
  // Retain the generated source without awarding approval credit to reference assets.
  if(getState().selection?.pieceId===draft.pieceId)change(state=>freezeCreationContext(state,draft.pieceId,0,{postContext:candidate.creationContext?.postContext??{objective:'',message:'',action:''},references:[],explorationSource:{imageId:candidate.imageId,ordinal:candidate.ordinal,projectId:scope.projectId,conversationId}}));
  await flush();
  return 'retained';
}
