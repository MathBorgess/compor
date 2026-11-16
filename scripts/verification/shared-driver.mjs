import {mkdir,readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,basename} from 'node:path';
import {createStudioJourneyController} from '../../apps/web/lib/studio-journey-controller.ts';
import {createStudioState,parseStudioState,getCurrentDraft} from '../../apps/web/lib/studio-state.ts';
import {versionsSchema} from '../../apps/web/lib/studio-piece-contract.ts';
import {prepareExplorationDraft} from '../../apps/web/lib/exploration-draft.ts';
import {conversationContext,postContext} from '../../apps/web/lib/studio-post-context.ts';
import {offerContext} from '../../apps/web/lib/studio-context.ts';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const missing=error=>error?.code==='ENOENT';

/** File-backed client storage is explicit: it exercises the real reducers and
 * controller, but does not claim to exercise IndexedDB or browser lifecycle. */
export async function createFileStudioDriver(ctx,{projectId,actor=ctx.actorA,filename='studio-state.json',resume=false}) {
  if(!uuid(projectId)||!uuid(actor)||basename(filename)!==filename)throw Error('invalid_driver_scope');
  await mkdir(ctx.runDir,{recursive:true});
  const statePath=join(ctx.runDir,filename),assetsDir=join(ctx.runDir,`${filename}.assets`);
  await mkdir(assetsDir,{recursive:true});
  let state=createStudioState({userId:actor,projectId,prepare:true}),active=true,versions=[],posts=[];
  const checkScope=value=>{
    const parsed=parseStudioState(value);
    if(parsed.userId!==actor||parsed.projectId!==projectId)throw Error('driver_scope_changed');
    return parsed;
  };
  const getState=()=>state;
  function getChatContext(conversationId){
    if(conversationId!=='references'&&!uuid(conversationId))throw Error('invalid_conversation_scope');
    // conversationContext is a read-only projection, not a persistable state.
    const draft=getCurrentDraft(state),current=conversationContext(state,conversationId);
    if(!draft||conversationId!=='references'&&draft.pieceId!==conversationId)throw Error('conversation_selection_mismatch');
    return {revision:current.revision,pieceId:draft.pieceId,baseVersion:draft.baseVersion,expectedLatestVersion:draft.expectedLatestVersion,content:draft.content,approval:draft.approval,baseImageId:null,brief:current.brief,...offerContext(current),...(conversationId==='references'?{}:{postContext:postContext(state,conversationId)}),persona:current.persona,direction:current.direction,marks:current.marks.filter(mark=>mark.pieceId===draft.pieceId&&mark.baseVersion===draft.baseVersion),references:current.references};
  }
  const change=reducer=>{if(!active)return null;state=checkScope(reducer(state));return state;};
  async function flush(){
    if(!active)throw Error('driver_closed');
    const temporary=`${statePath}.tmp`;
    await writeFile(temporary,JSON.stringify(checkScope(state)),{mode:0o600});
    await rename(temporary,statePath);
  }
  async function reopen(){state=checkScope(JSON.parse(await readFile(statePath,'utf8')));active=true;return state;}
  if(resume)await reopen();else await flush();

  async function fetchImpl(input,options={}) {
    const request=new Request(new URL(typeof input==='string'?input:input.url,ctx.origin),options);
    const url=new URL(request.url);
    if(url.origin!==ctx.origin)throw Error('driver_destination_denied');
    const path=`${url.pathname}${url.search}`;
    if(request.method==='GET'&&['/api/images','/api/studio/explorations/image'].includes(url.pathname)){
      const result=await ctx.readBytes(actor,path);
      return new Response(result.bytes,{status:result.status,headers:{'content-type':result.status===200?'image/png':'application/octet-stream'}});
    }
    const body=request.body?await request.json():undefined;
    const result=await ctx.request(actor,path,{method:request.method,...(body===undefined?{}:{body}),headers:Object.fromEntries(request.headers)});
    return Response.json(result.body,{status:result.status});
  }
  function assetPath(scope,address){
    if(scope.userId!==actor||scope.projectId!==projectId||!uuid(address.pieceId)||!Number.isSafeInteger(address.baseVersion)||address.baseVersion<0||address.kind!=='base')throw Error('invalid_asset_scope');
    return join(assetsDir,`${address.pieceId}-${address.baseVersion}-base.png`);
  }
  const storage={
    async getDraftAsset(scope,address){
      try {return {file:new Blob([await readFile(assetPath(scope,address))],{type:'image/png'})};}
      catch(error){if(missing(error))return null;throw error;}
    },
    async putDraftAsset(value){
      if(value.expectedRevision!==undefined&&value.expectedRevision!==state.revision)throw Error('studio_state_conflict');
      const destination=assetPath(value,value),bytes=Buffer.from(await value.file.arrayBuffer());
      try {await writeFile(destination,bytes,{flag:value.ifAbsent?'wx':'w',mode:0o600});}
      catch(error){if(error?.code==='EEXIST'){const exists=Error('studio_draft_asset_exists');exists.code='studio_draft_asset_exists';throw exists;}throw error;}
    },
    async copyDraftAsset(scope,source,target){
      try {await copyFile(assetPath(scope,source),assetPath(scope,target),constants.COPYFILE_EXCL);return 'copied';}
      catch(error){if(missing(error))return 'missing';if(error?.code==='EEXIST')return 'exists';throw error;}
    },
  };
  const controller=createStudioJourneyController({getState,change,flush,fetchImpl,isActive:()=>active,isRemoved:pieceId=>Boolean(state.posts[pieceId]?.deleted||posts.some(post=>post.pieceId===pieceId&&post.deleted))});
  const creationPorts={
    onPostCreated:post=>{posts=[...posts.filter(item=>item.pieceId!==post.pieceId),post];},
    async retainReferenceProposal(conversationId){
      const result=await prepareExplorationDraft({conversationId,getState,change,flush,storage,fetcher:fetchImpl});
      const draft=getCurrentDraft(state);
      const image=draft?await storage.getDraftAsset({userId:actor,projectId},{pieceId:draft.pieceId,baseVersion:draft.baseVersion,kind:'base'}):null;
      return {result,hasImage:Boolean(image)};
    },
  };
  async function readVersions(){
    const response=await fetchImpl(`/api/pieces?projectId=${encodeURIComponent(projectId)}`,{cache:'no-store'});
    if(!response.ok)throw Error(`version_read_http_${response.status}`);
    const result=versionsSchema.parse(await response.json());
    if(result.versions.some(version=>version.project_id!==projectId)||result.posts.some(post=>post.projectId!==projectId))throw Error('version_scope_mismatch');
    versions=result.versions;posts=result.posts;return versions;
  }
  const savingPorts={readVersions,copyDraftAsset:storage.copyDraftAsset,newEventId:()=>ctx.newId(),onVersionsChanging:()=>{},onVersionSaved:version=>{versions=[...versions.filter(item=>item.piece_id!==version.piece_id||item.version!==version.version),version];}};
  return {controller,getState,getChatContext,change,flush,reopen,fetchImpl,storage,creationPorts,savingPorts,readVersions,statePath,assetsDir,close(){active=false;}};
}
