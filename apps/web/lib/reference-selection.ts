import * as z from 'zod';
import {exploredReferenceSchema,referenceSignalSchema,type ExploredReference} from './reference-exploration-contract.ts';
type Selection={userId:string;projectId:string;pieceId?:string;reference:ExploredReference;commit:()=>Promise<void>};
const pendingSchema=z.strictObject({id:z.uuid(),reference:exploredReferenceSchema});
const responseSchema=z.object({signal:referenceSignalSchema});

/** Keep an uncertain choice's identity, then release it only after the local reference was persisted. */
export async function recordReferenceSelection({userId,projectId,pieceId,reference,commit}:Selection,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>=localStorage,fetchApi:typeof fetch=fetch) {
  reference=exploredReferenceSchema.parse(reference);
  const key=`compor-reference-selection-pending:${userId}:${projectId}${pieceId?`:${pieceId}`:''}:${reference.originUrl}`;
  const previous=storage.getItem(key);
  const pending=previous===null?{id:crypto.randomUUID(),reference}:pendingSchema.parse(JSON.parse(previous));
  if(JSON.stringify(pending.reference)!==JSON.stringify(reference))throw Error('selection_snapshot_changed');
  const marker=JSON.stringify(pending);
  if(previous===null)storage.setItem(key,marker);
  const response=await fetchApi('/api/studio/references/signals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pending.id,projectId,...(pieceId?{pieceId}:{}),originUrl:reference.originUrl,board:reference.board,action:'selected',comment:'',supersedes:null,reference})});
  if(!response.ok)throw Error('selection_unconfirmed');
  const {signal}=responseSchema.parse(await response.json());
  if(signal.pieceId!==pieceId||signal.id!==pending.id||signal.projectId!==projectId||signal.originUrl!==reference.originUrl||signal.action!=='selected')throw Error('selection_unconfirmed');
  await commit();
  if(storage.getItem(key)===marker)storage.removeItem(key);
}
