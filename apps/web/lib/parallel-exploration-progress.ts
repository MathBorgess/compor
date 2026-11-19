import {explorationImageOutcomes,explorationQualityReasons,isReplaceableExplorationOutcome,type ExplorationImageOutcome,type ExplorationQualityReason} from './exploration-image-outcome.ts';
import * as z from './schema.ts';

export const PARALLEL_WAIT_MS=15_000;
const timestamp=z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER-PARALLEL_WAIT_MS));
const child=z.strictObject({requestId:z.uuid(),position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),status:z.enum(['unconfirmed',...explorationImageOutcomes]),revision:z.number().check(z.int()).check(z.nonnegative()),confirmedAt:z.nullable(timestamp),qualityReason:z.optional(z.enum(explorationQualityReasons))}).check(z.refine(item=>(item.status==='completed')===(item.confirmedAt!==null)&&((item.status==='quality_held')===(item.qualityReason!==undefined))));
const wait=z.union([
  z.strictObject({mode:z.literal('none')}),
  z.strictObject({mode:z.literal('paused'),remainingMs:z.number().check(z.int()).check(z.minimum(0)).check(z.maximum(PARALLEL_WAIT_MS))}),
  z.strictObject({mode:z.literal('running'),nextAt:timestamp}),
]);
export const parallelProgressSchema=z.strictObject({children:z.array(child).check(z.minLength(3)).check(z.maxLength(3)),wait}).check(z.refine(value=>{
  const positions=new Set(value.children.map(item=>item.position));
  const ids=new Set(value.children.map(item=>item.requestId));
  const complete=value.children.every(item=>item.status==='completed');
  return positions.size===3&&ids.size===3&&(complete===(value.wait.mode!=='none'));
}));
export type ParallelProgress=z.infer<typeof parallelProgressSchema>;
export type ParallelObservation={requestId:string;position:number;status:ExplorationImageOutcome;revision:number;qualityReason?:ExplorationQualityReason};
export type ParallelGates={visible:boolean;sessionActive:boolean;originalCredential:boolean;generationAllowed:boolean;questionResolved:boolean;feedbackAllowed:boolean;noOtherPending:boolean};
const gatesSchema=z.strictObject({visible:z.boolean(),sessionActive:z.boolean(),originalCredential:z.boolean(),generationAllowed:z.boolean(),questionResolved:z.boolean(),feedbackAllowed:z.boolean(),noOtherPending:z.boolean()});
const eligible=(gates:ParallelGates)=>Object.values(gatesSchema.parse(gates)).every(value=>value===true);
const validNow=(now:number)=>timestamp.parse(now);

/** Apply only an authenticated, validated durable observation; the local journal is not proof of a provider effect. */
export function observeParallelChild(progress:ParallelProgress,observation:ParallelObservation,now:number,visible:boolean):ParallelProgress {
  const before=parallelProgressSchema.parse(progress),time=validNow(now);z.boolean().parse(visible);
  const value=z.strictObject({requestId:z.uuid(),position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),status:z.enum(explorationImageOutcomes),qualityReason:z.optional(z.enum(explorationQualityReasons)),revision:z.number().check(z.int()).check(z.nonnegative())}).parse(observation);
  const existing=before.children.find(item=>item.requestId===value.requestId);
  if(!existing||existing.position!==value.position)throw Error('parallel_child_mismatch');
  if(value.revision<existing.revision)return before;
  if(value.revision===existing.revision){if(value.status===existing.status&&value.qualityReason===existing.qualityReason)return before;throw Error('parallel_revision_conflict');}
  if((existing.status==='completed'||isReplaceableExplorationOutcome(existing.status))&&(existing.status!==value.status||existing.qualityReason!==value.qualityReason))throw Error('parallel_terminal_conflict');
  if(existing.status==='unknown'&&value.status==='running')return before;
  const children=before.children.map(item=>item.requestId===value.requestId?{...item,status:value.status,revision:value.revision,confirmedAt:value.status==='completed'?(item.confirmedAt??time):null,...(value.qualityReason?{qualityReason:value.qualityReason}:{})}:item);
  const allCompleted=children.every(item=>item.status==='completed');
  const nextWait=allCompleted&&before.wait.mode==='none'?(visible?{mode:'running' as const,nextAt:time+PARALLEL_WAIT_MS}:{mode:'paused' as const,remainingMs:PARALLEL_WAIT_MS}):before.wait;
  return parallelProgressSchema.parse({children,wait:nextWait});
}

/** Change a slot only after a matching durable replacement receipt was read. */
export function replaceRejectedParallelChild(progress:ParallelProgress,observation:{position:number;previousId:string;requestId:string;status:ExplorationImageOutcome;revision:number;qualityReason?:ExplorationQualityReason},now:number,visible:boolean):ParallelProgress {
  const value=z.strictObject({position:z.number().check(z.int()).check(z.minimum(1)).check(z.maximum(3)),previousId:z.uuid(),requestId:z.uuid(),status:z.enum(explorationImageOutcomes),qualityReason:z.optional(z.enum(explorationQualityReasons)),revision:z.number().check(z.int()).check(z.positive()).check(z.maximum(Number.MAX_SAFE_INTEGER))}).parse(observation);
  const before=parallelProgressSchema.parse(progress),old=before.children.find(item=>item.position===value.position);
  if(!old||old.requestId!==value.previousId||!isReplaceableExplorationOutcome(old.status)||before.children.some(item=>item.requestId===value.requestId))throw Error('parallel_replacement_mismatch');
  const children=before.children.map(item=>item.position===value.position?{requestId:value.requestId,position:value.position,status:'unconfirmed' as const,revision:0,confirmedAt:null}:item);
  return observeParallelChild(parallelProgressSchema.parse({...before,children}),{requestId:value.requestId,position:value.position,status:value.status,revision:value.revision,...(value.qualityReason?{qualityReason:value.qualityReason}:{})},now,visible);
}

export function pauseParallelWait(progress:ParallelProgress,now:number):ParallelProgress {
  const value=parallelProgressSchema.parse(progress),time=validNow(now);
  return value.wait.mode==='running'?parallelProgressSchema.parse({...value,wait:{mode:'paused',remainingMs:Math.max(0,Math.min(PARALLEL_WAIT_MS,value.wait.nextAt-time))}}):value;
}
/** Reload cannot prove how long the view was visible, so conservatively require a fresh visible wait. */
export function restoreParallelWait(progress:ParallelProgress):ParallelProgress {
  const value=parallelProgressSchema.parse(progress);
  return value.wait.mode==='running'?parallelProgressSchema.parse({...value,wait:{mode:'paused',remainingMs:PARALLEL_WAIT_MS}}):value;
}
export function resumeParallelWait(progress:ParallelProgress,now:number,gates:ParallelGates):ParallelProgress {
  const value=parallelProgressSchema.parse(progress),time=validNow(now);
  return value.wait.mode==='paused'&&eligible(gates)?parallelProgressSchema.parse({...value,wait:{mode:'running',nextAt:time+value.wait.remainingMs}}):value;
}
/** Call whenever visibility, credentials or another continuation gate changes. */
export function reconcileParallelGates(progress:ParallelProgress,now:number,gates:ParallelGates):ParallelProgress {
  return eligible(gates)?parallelProgressSchema.parse(progress):pauseParallelWait(progress,now);
}
/** Eligibility only; it never dispatches a plan or image. */
export function parallelWaitElapsed(progress:ParallelProgress,now:number,gates:ParallelGates):boolean {
  const value=parallelProgressSchema.parse(progress),time=validNow(now);
  return value.wait.mode==='running'&&time>=value.wait.nextAt&&eligible(gates);
}
