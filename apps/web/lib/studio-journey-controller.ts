import {postMutationSchema,postNameSchema,type PostRecord} from './post-catalog';
import {savedVersionSchema,type PieceVersion} from './studio-piece-contract';
import {changeStudioState,editDraft,getCurrentDraft,recordSavedVersion,samePieceContent,selectVersion,setPostFormat,updateBrandVoice,updateBrief} from './studio-state';
import {cancelPostPreparation,completePostPreparation,startPostPreparation,updateLegacyPostName,updatePostPreparation,updateWorkflow} from './studio-workflow';
import {selectScopedReference,unselectScopedReference,updatePostContext} from './studio-post-context';
import type {ActionResult,BrandVoice,DraftContext,PostContext,PostFormat,StudioState} from './studio-domain';
import type {DraftAssetAddress, createStudioStorage} from './studio-storage';
import type {ImageProposal} from '@compor/agents-api/image-proposal';

type Lock={current:boolean};
type RetainedProposal={result:'retained'|'preserved'|'none';hasImage:boolean};
type StatePort={
  getState:()=>StudioState;
  change:(reducer:(state:StudioState)=>StudioState)=>StudioState|null;
  flush:()=>Promise<void>;
  fetchImpl:typeof fetch;
  isActive:()=>boolean;
  isRemoved:(pieceId:string)=>boolean;
  locks?:{creation:Lock;save:Lock};
};
type CreationPorts={
  onPostCreated:(post:PostRecord)=>void;
  retainReferenceProposal:(conversationId:string)=>Promise<RetainedProposal>;
};
export type PostCreationResult=
  | {status:'created';post:PostRecord;retained:RetainedProposal}
  | {status:'superseded';post:PostRecord}
  | {status:'unknown'|'unavailable'};
export type SaveDraftInput=DraftContext&Partial<Pick<ImageProposal,'operation'|'changedDimension'>>&{frameId?:string};
export type VersionImagePublication='published'|'absent'|'conflict'|'unknown';
type PreparedVersionImage=
  | {status:'ready';publish:(version:number)=>Promise<VersionImagePublication>}
  | {status:'absent'|'image_unsupported'|'unknown'};
type SavePorts={
  readVersions:()=>Promise<PieceVersion[]>;
  copyDraftAsset:ReturnType<typeof createStudioStorage>['copyDraftAsset'];
  prepareVersionImage?:(input:{userId:string;projectId:string;pieceId:string;version:number;source:DraftAssetAddress})=>Promise<PreparedVersionImage>;
  newEventId:()=>string;
  onVersionsChanging:()=>void;
  onVersionSaved:(version:PieceVersion)=>void;
};
export type SaveResult={result:ActionResult;notice:'saved'|'recovered'|'conflict'|'image_unsupported'|'unknown'|'inactive'};

export function createStudioJourneyController(port:StatePort) {
  const locks=port.locks??{creation:{current:false},save:{current:false}};
  const fetchImpl=port.fetchImpl;
  const sameScope=(initial:StudioState)=>{
    const current=port.getState();
    return port.isActive()&&current.userId===initial.userId&&current.projectId===initial.projectId;
  };
  function change(reducer:(state:StudioState)=>StudioState) {
    const result=port.change(reducer);
    if(!result)throw Error('studio_unavailable');
    return result;
  }

  function preparePost(pieceId:string,{fromAgent=false,referenceScope,initialProjectTitle}:{fromAgent?:boolean;referenceScope?:string;initialProjectTitle?:string}={}) {
    if(port.isRemoved(pieceId))throw Error('Post excluído.');
    return change(value=>{
      const next=startPostPreparation(value,pieceId,initialProjectTitle);
      return fromAgent?changeStudioState(next,state=>{
        state.selection=null;
        if(state.workflow.phase==='references')state.workflow.phase='ready';
        if(referenceScope&&state.workflow.latestExplorations?.[referenceScope])state.workflow.referenceHandoff=referenceScope;
      }):next;
    });
  }

  function changePreparation(patch:Partial<PostContext&{name:string;format:PostFormat;targetFrameCount:number}>) {
    return change(value=>{
      if(value.workflow.pendingPost)return updatePostPreparation(value,patch);
      const draft=getCurrentDraft(value);
      if(!draft)return value;
      const contextPatch:Partial<PostContext>={};
      if(patch.objective!==undefined)contextPatch.objective=patch.objective;
      if(patch.message!==undefined)contextPatch.message=patch.message;
      if(patch.action!==undefined)contextPatch.action=patch.action;
      let next=Object.keys(contextPatch).length?updatePostContext(value,draft.pieceId,contextPatch):value;
      if('name' in patch)next=updateLegacyPostName(next,draft.pieceId,patch.name??'');
      if(patch.format!==undefined||patch.targetFrameCount!==undefined){
        const currentFormat=next.posts[draft.pieceId]?.format??draft.content.format??'single';
        next=setPostFormat(next,draft.pieceId,patch.format??currentFormat,patch.targetFrameCount);
      }
      return next;
    });
  }

  async function confirmPost(options:CreationPorts):Promise<PostCreationResult> {
    if(locks.creation.current||!port.isActive())return {status:'unavailable'};
    const value=port.getState(),pieceId=value.workflow.pendingPost?.pieceId??value.selection?.pieceId;
    const parsed=postNameSchema.safeParse(value.workflow.pendingPost?.name??(pieceId?value.posts[pieceId]?.name:''));
    if(!pieceId||!parsed.success)return {status:'unavailable'};
    const plannedHandoff=value.workflow.referenceHandoff,plannedImage=plannedHandoff?value.workflow.latestExplorations?.[plannedHandoff]?.imageId:undefined;
    locks.creation.current=true;
    try {
      await port.flush();
      if(!sameScope(value))return {status:'unknown'};
      const response=await fetchImpl('/api/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:value.projectId,pieceId,name:parsed.data})});
      if(!response.ok)throw Error('unconfirmed');
      const result=postMutationSchema.parse(await response.json());
      if(result.status!=='created'||result.post.projectId!==value.projectId||result.post.pieceId!==pieceId||result.post.name!==parsed.data||result.post.deleted)throw Error('unconfirmed');
      if(!sameScope(value))return {status:'unknown'};
      options.onPostCreated(result.post);
      const latest=port.getState(),currentPiece=latest.workflow.pendingPost?.pieceId??latest.selection?.pieceId,currentName=latest.workflow.pendingPost?.name??latest.posts[pieceId]?.name;
      const currentParsedName=postNameSchema.safeParse(currentName);
      if(currentPiece!==pieceId||!currentParsedName.success||currentParsedName.data!==parsed.data){
        if(plannedHandoff&&latest.workflow.referenceHandoff===plannedHandoff&&latest.workflow.latestExplorations?.[plannedHandoff]?.imageId===plannedImage)change(state=>updateWorkflow(state,{referenceHandoff:null}));
        await port.flush();
        return {status:'superseded',post:result.post};
      }
      change(state=>updateWorkflow(completePostPreparation(state),{view:'prepare-post'}));
      await port.flush();
      const retained:RetainedProposal=plannedHandoff?await options.retainReferenceProposal(plannedHandoff):{result:'none',hasImage:false};
      if(!sameScope(value))return {status:'unknown'};
      const retainedState=port.getState();
      if(retainedState.selection?.pieceId!==pieceId||retainedState.workflow.pendingPost)return {status:'superseded',post:result.post};
      change(state=>updateWorkflow(state,{view:retained.hasImage?'studio':'compose',referenceHandoff:null}));
      await port.flush();
      return {status:'created',post:result.post,retained};
    } catch {return {status:'unknown'};}
    finally {locks.creation.current=false;}
  }

  async function saveCurrent(options:SavePorts,args?:SaveDraftInput):Promise<SaveResult> {
    const current=port.getState(),selected=getCurrentDraft(current);
    if(!selected||locks.save.current)throw Error('save_unavailable');
    const draft=selected;
    if(args?.pieceId&&(args.pieceId!==draft.pieceId||args.baseVersion!==draft.baseVersion||args.expectedLatestVersion!==draft.expectedLatestVersion))throw Error('context_changed');
    const targetFrame=args?.frameId===undefined?undefined:draft.content.frames?.find(frame=>frame.id===args.frameId);
    if(args?.frameId!==undefined&&(!args.operation||!targetFrame))throw Error('context_changed');
    locks.save.current=true;
    const unknown=(notice:SaveResult['notice']='unknown'):SaveResult=>({result:{status:'unknown'},notice});
    const assetScope={userId:current.userId,projectId:current.projectId};
    const source:DraftAssetAddress={pieceId:draft.pieceId,baseVersion:draft.baseVersion,kind:'base'};
    let prepared:PreparedVersionImage|undefined;
    async function adopt(version:PieceVersion,recovered:boolean):Promise<SaveResult> {
      if(!sameScope(current))return unknown('inactive');
      if(version.project_id!==current.projectId||version.piece_id!==draft.pieceId||version.version!==draft.expectedLatestVersion+1)throw Error('save_unconfirmed');
      const destination={...source,baseVersion:version.version};
      if(!args?.operation){
        if(prepared?.status==='ready'){
          const published=await prepared.publish(version.version);
          if(!sameScope(current))return unknown('inactive');
          if(published==='unknown')return unknown();
        }else if(!options.prepareVersionImage&&!args?.changedDimension){
          await options.copyDraftAsset(assetScope,source,destination);
        }
      }
      // Other frames carry forward; the target slot must stay free for its new image.
      if(targetFrame||(!args?.operation&&!args?.changedDimension)){
        for(const frame of version.content.frames??[]){
          if(frame.id!==targetFrame?.id)await options.copyDraftAsset(assetScope,{...source,frameId:frame.id},{...destination,frameId:frame.id});
        }
      }
      if(targetFrame&&targetFrame.position>1){
        // The anchor can also be an older version-level image or a working preview.
        await options.copyDraftAsset(assetScope,source,destination);
        if(source.baseVersion>=1)await options.copyDraftAsset(assetScope,{...source,kind:'preview'},{...destination,kind:'preview'});
      }
      if(!sameScope(current))return unknown('inactive');
      if(!recovered){options.onVersionsChanging();options.onVersionSaved(version);}
      change(value=>recordSavedVersion(value,{
        pieceId:draft.pieceId,baseVersion:draft.baseVersion,version:version.version,content:version.content,
        approval:version.metadata?.approval.status==='approved'?version.metadata.approval:version.metadata||recovered?{status:'unapproved'}:undefined,
        eventId:options.newEventId(),
      }));
      await port.flush();
      if(recovered)return unknown('recovered');
      return {result:{status:'completed',pieceId:draft.pieceId,version:version.version},notice:'saved'};
    }
    try {
      if(!sameScope(current))return unknown('inactive');
      await port.flush();options.onVersionsChanging();
      if(!sameScope(current))return unknown('inactive');
      if(!args?.operation&&options.prepareVersionImage){
        prepared=await options.prepareVersionImage({userId:current.userId,projectId:current.projectId,pieceId:draft.pieceId,version:draft.expectedLatestVersion+1,source});
        if(!sameScope(current))return unknown('inactive');
        if(prepared.status==='image_unsupported'||prepared.status==='unknown')return unknown(prepared.status);
      }
      const response=await fetchImpl('/api/pieces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        projectId:current.projectId,pieceId:draft.pieceId,expectedVersion:draft.expectedLatestVersion,baseVersion:draft.baseVersion,content:draft.content,
        ...(args?.operation?{operation:args.operation}:{}),...(args?.changedDimension?{changedDimension:args.changedDimension}:{}),
      })});
      const input:unknown=await response.json();
      if(response.status===409){
        const versions=await options.readVersions();
        const latest=versions.filter(item=>item.piece_id===draft.pieceId).reduce<PieceVersion|null>((previous,item)=>!previous||item.version>previous.version?item:previous,null);
        if(latest?.version===draft.expectedLatestVersion+1&&latest.metadata?.baseVersion===(draft.baseVersion||null)&&samePieceContent(latest.content,draft.content)&&
          (latest.metadata?.operation??null)===(args?.operation??null)&&(latest.metadata?.changedDimension??null)===(args?.changedDimension??null))return await adopt(latest,true);
        return unknown('conflict');
      }
      const data=savedVersionSchema.parse(input);
      if(!response.ok||data.status!=='saved')throw Error('save_unknown');
      return await adopt(data.version,false);
    } catch {return unknown();}
    finally {locks.save.current=false;}
  }

  function openVersion(version:PieceVersion,versions:PieceVersion[]) {
    if(port.isRemoved(version.piece_id))return null;
    if(version.project_id!==port.getState().projectId)throw Error('context_changed');
    const latest=versions.filter(item=>item.piece_id===version.piece_id).reduce((n,item)=>Math.max(n,item.version),0);
    return change(value=>updateWorkflow(selectVersion(value,{
      pieceId:version.piece_id,version:version.version,latestVersion:latest,content:version.content,
      approval:version.metadata?.approval?.status==='approved'?version.metadata.approval:{status:'unapproved'},
    }),{view:'studio'}));
  }

  return {
    preparePost,changePreparation,confirmPost,saveCurrent,openVersion,
    cancelPreparation:()=>change(cancelPostPreparation),
    editDraft:(input:Parameters<typeof editDraft>[1])=>change(state=>editDraft(state,input)),
    updateBrief:(patch:Parameters<typeof updateBrief>[1])=>change(state=>updateBrief(state,patch)),
    updateBrandVoice:(patch:Partial<BrandVoice>)=>change(state=>updateBrandVoice(state,patch)),
    setPostFormat:(pieceId:string,format:PostFormat,frameCount?:number)=>change(state=>setPostFormat(state,pieceId,format,frameCount)),
    updateWorkflow:(patch:Parameters<typeof updateWorkflow>[1])=>change(state=>updateWorkflow(state,patch)),
    updatePostContext:(pieceId:string,patch:Partial<PostContext>)=>change(state=>updatePostContext(state,pieceId,patch)),
    selectReference:(reference:Parameters<typeof selectScopedReference>[1],scope:string)=>change(state=>selectScopedReference(state,reference,scope)),
    unselectReference:(id:string,scope:string)=>change(state=>unselectScopedReference(state,id,scope)),
  };
}
