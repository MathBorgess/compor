import { z } from 'zod';

export const BATCH_SIZE=3;
export const BATCH_DELAY_MS=15_000;
const sequence=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1);
const reviewBatch=z.strictObject({batchId:z.string().uuid(),imageIds:z.array(z.string().uuid()).max(BATCH_SIZE)});
const progressSchema=z.strictObject({sequence,batchId:z.string().uuid(),completed:z.number().int().min(0).max(BATCH_SIZE),nextAt:z.number().int().nonnegative().nullable(),remainingMs:z.number().int().min(0).max(BATCH_DELAY_MS).nullable().default(null),reviewBatches:z.array(reviewBatch).max(2).default([]),reviewedBatchId:z.string().uuid().nullable().default(null),awaitingFeedback:z.boolean().default(false)}).refine(value=>value.completed===BATCH_SIZE ? (value.nextAt!==null)!==(value.remainingMs!==null) : value.nextAt===null&&value.remainingMs===null);
export const pendingSchema=z.strictObject({projectId:z.string().uuid(),requestId:z.string().uuid(),sequence,batchId:z.string().uuid().optional(),position:z.number().int().min(1).max(BATCH_SIZE).optional()}).refine(value=>(value.batchId===undefined)===(value.position===undefined));
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
