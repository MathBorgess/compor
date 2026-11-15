import * as z from './schema.ts';
import {creationContextSchema} from './studio-domain.ts';

export const BATCH_SIZE=3;
export const BATCH_DELAY_MS=15_000;
const sequence=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-1));
const reviewBatch=z.strictObject({batchId:z.string().check(z.uuid()),imageIds:z.array(z.string().check(z.uuid())).check(z.maxLength(BATCH_SIZE))});
const progressSchema=z.strictObject({sequence,batchId:z.string().check(z.uuid()),completed:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(BATCH_SIZE)),nextAt:z.nullable(z.number().check(z.int()).check(z.nonnegative())),remainingMs:z._default(z.nullable(z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(BATCH_DELAY_MS))),null),reviewBatches:z._default(z.array(reviewBatch).check(z.maxLength(2)),[]),reviewedBatchId:z._default(z.nullable(z.string().check(z.uuid())),null),awaitingFeedback:z._default(z.boolean(),false)}).check(z.refine(value=>value.completed===BATCH_SIZE ? (value.nextAt!==null)!==(value.remainingMs!==null) : value.nextAt===null&&value.remainingMs===null));
export const pendingSchema=z.strictObject({projectId:z.string().check(z.uuid()),requestId:z.string().check(z.uuid()),sequence,batchId:z.optional(z.string().check(z.uuid())),position:z.optional(z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(BATCH_SIZE))),conversationId:z.optional(z.union([z.literal('references'),z.uuid()])),creationContext:z.optional(creationContextSchema)}).check(z.refine(value=>(value.batchId===undefined)===(value.position===undefined)));
export type BatchProgress=z.infer<typeof progressSchema>;
export type PendingExploration=z.infer<typeof pendingSchema>;
type StorageReader=Pick<Storage,'getItem'|'setItem'>;

export function readBatchProgress(storage:StorageReader,key:string,legacyKey:string,newId:()=>string):BatchProgress {
  const saved=storage.getItem(key);
  if(saved!==null)return progressSchema.parse(JSON.parse(saved));
  const legacy=storage.getItem(legacyKey);
  const initial=progressSchema.parse({sequence:legacy===null?0:Number(legacy),batchId:newId(),completed:0,nextAt:null});
  storage.setItem(key,JSON.stringify(initial));
  return initial;
}

/** Persist progress before clearing the dispatch marker, so a lost response never creates an extra slot. */
export function recordBatchCompletion(progress:BatchProgress,pending:PendingExploration,now:number):BatchProgress {
  if(progress.sequence===pending.sequence+1) {
    if(pending.batchId!==undefined&&(pending.batchId!==progress.batchId||pending.position!==progress.completed))throw Error('batch_mismatch');
    return progress;
  }
  if(progress.sequence!==pending.sequence)throw Error('batch_sequence_mismatch');
  if(pending.batchId===undefined)return progressSchema.parse({...progress,sequence:progress.sequence+1});
  if(pending.batchId!==progress.batchId||pending.position!==progress.completed+1||progress.nextAt!==null)throw Error('batch_mismatch');
  const completed=progress.completed+1;
  const reviewBatches=[...progress.reviewBatches];
  if(progress.reviewedBatchId!==progress.batchId) {
    const index=reviewBatches.findIndex(batch=>batch.batchId===progress.batchId);
    if(index<0)reviewBatches.push({batchId:progress.batchId,imageIds:[pending.requestId]});
    else reviewBatches[index]={...reviewBatches[index],imageIds:[...reviewBatches[index].imageIds,pending.requestId]};
  }
  return progressSchema.parse({...progress,sequence:progress.sequence+1,completed,nextAt:completed===BATCH_SIZE?now+BATCH_DELAY_MS:null,reviewBatches});
}

export function nextBatch(progress:BatchProgress,now:number,newId:()=>string):BatchProgress {
  if(progress.nextAt===null||progress.nextAt>now)throw Error('batch_waiting');
  return progressSchema.parse({...progress,batchId:newId(),completed:0,nextAt:null,remainingMs:null,reviewedBatchId:null,reviewBatches:progress.reviewBatches.filter(batch=>batch.imageIds.length===BATCH_SIZE)});
}

/** A selection or explicit comment resets the window, including a partially completed batch. */
export function reviewBatchProgress(progress:BatchProgress,engagedImageIds:Set<string>):BatchProgress {
  if(progress.awaitingFeedback)return progress;
  if(progress.reviewBatches.some(batch=>batch.imageIds.some(id=>engagedImageIds.has(id)))) {
    return progressSchema.parse({...progress,reviewBatches:[],reviewedBatchId:progress.completed>0&&progress.completed<BATCH_SIZE?progress.batchId:null});
  }
  return progressSchema.parse({...progress,awaitingFeedback:progress.reviewBatches.filter(batch=>batch.imageIds.length===BATCH_SIZE).length>=2});
}

export function resumeAfterFeedback(progress:BatchProgress):BatchProgress {
  return progressSchema.parse({...progress,awaitingFeedback:false,reviewBatches:[],reviewedBatchId:progress.completed<BATCH_SIZE?progress.batchId:null});
}

export function selectedExplorationKey(userId:string,projectId:string,imageId:string) {
  return `compor-exploration-selected:${userId}:${projectId}:${imageId}`;
}

export function freezeBatchWait(progress:BatchProgress,now:number):BatchProgress {
  if(progress.nextAt===null)return progress;
  return progressSchema.parse({...progress,nextAt:null,remainingMs:Math.max(0,Math.min(BATCH_DELAY_MS,progress.nextAt-now))});
}

export function resumeBatchWait(progress:BatchProgress,now:number):BatchProgress {
  if(progress.remainingMs===null)return progress;
  return progressSchema.parse({...progress,nextAt:now+progress.remainingMs,remainingMs:null});
}
