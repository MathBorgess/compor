import {referenceSelectionProjection,referenceSelectionPublic} from './reference-selection-projection.ts';
import {createReferenceAuthorityClient} from './reference-authority-client.ts';
import {createStudioStorage} from './studio-storage.ts';
import type {StudioScope,StudioReference} from './studio-domain.ts';

type Store=ReturnType<typeof createStudioStorage>;
type Client=Pick<ReturnType<typeof createReferenceAuthorityClient>,'read'|'write'|'receipt'>;
type Change={kind:'select';reference:StudioReference;target:string}|{kind:'unselect';id:string;target:string};
type Result={status:'ready';revision:number}|{status:'pending'|'conflict'|'unavailable'};
const storageConflict=(error:unknown)=>Boolean(error&&typeof error==='object'&&'code' in error&&error.code==='studio_storage_conflict');

/** No paid action is sent here. A pending or mismatched selection is never ready. */
export function createReferenceSelectionCoordinator({store,client=createReferenceAuthorityClient()}:{store:Store;client?:Client}){
 async function readiness(scope:StudioScope):Promise<Result>{
  try{
   const local=await store.readReferenceAuthority(scope);
   if(local.pending)return {status:'pending'};
   if(!local.confirmed)return {status:'unavailable'};
   if(JSON.stringify(referenceSelectionProjection(local.state))!==JSON.stringify(local.confirmed.selection))return {status:'conflict'};
   return {status:'ready',revision:local.confirmed.revision};
  }catch{return {status:'unavailable'};}
 }
 /** First observation does not publish or silently replace a previous baseline. */
 async function observe(scope:StudioScope):Promise<Result>{
  try{
   const local=await store.readReferenceAuthority(scope);if(local.pending)return {status:'pending'};
   const projection=referenceSelectionProjection(local.state),remote=await client.read(scope.projectId);
   if(JSON.stringify(await referenceSelectionPublic(projection))!==JSON.stringify(remote.state))return {status:'conflict'};
   await store.establishReferenceAuthority(scope,local.state.revision,remote.revision,projection);
   return {status:'ready',revision:remote.revision};
  }catch(error){return {status:storageConflict(error)?'conflict':'unavailable'};}
 }
 /** A lost reply is reconciled by the same ID; an absent receipt is not a fence. */
 async function reconcile(scope:StudioScope):Promise<Result>{
  try{
   const local=await store.readReferenceAuthority(scope),pending=local.pending;
   if(!pending)return readiness(scope);
   const receipt=await client.receipt(scope.projectId,pending.commandId);
   if(receipt.status==='absent')return {status:'pending'};
   if(receipt.revision!==pending.expectedRemoteRevision+1)return {status:'conflict'};
   const remote=await client.read(scope.projectId);
   if(remote.revision!==receipt.revision||JSON.stringify(remote.state)!==JSON.stringify(await referenceSelectionPublic(pending.selection)))return {status:'conflict'};
   await store.confirmReferenceAuthorityChange(scope,pending.commandId,receipt.revision);
   return {status:'ready',revision:receipt.revision};
  }catch(error){return {status:storageConflict(error)?'conflict':'pending'};}
 }
 /** Persist the local gesture and its immutable command before one remote write. */
 async function change(scope:StudioScope,change:Change):Promise<Result>{
  let local;
  try{local=await store.readReferenceAuthority(scope);}catch{return {status:'unavailable'};}
  if(local.pending)return {status:'pending'};
  if(!local.confirmed)return {status:'unavailable'};
  let command;
  try{({command}=await store.beginReferenceAuthorityChange(scope,{commandId:crypto.randomUUID(),expectedLocalRevision:local.state.revision,expectedRemoteRevision:local.confirmed.revision,change}));}
  catch(error){return {status:storageConflict(error)?'conflict':'unavailable'};}
  if(!command)return {status:'ready',revision:local.confirmed.revision};
  try{
   const receipt=await client.write(scope.projectId,command.commandId,command.expectedRemoteRevision,command.selection);
   if(receipt.revision!==command.expectedRemoteRevision+1)return {status:'conflict'};
  }catch(error){return {status:error instanceof Error&&error.message==='reference_authority_conflict'?'conflict':'pending'};}
  return reconcile(scope);
 }
 return {readiness,observe,reconcile,change};
}
