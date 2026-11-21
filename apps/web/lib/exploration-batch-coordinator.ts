import {ExplorationProviderClosed,ExplorationQualityHeld,type ExplorationClosureReason,type ExplorationProviderOutcome,type ExplorationQualityReason} from './exploration-image-outcome.ts';

/** A definitive provider credential rejection, not a transport failure. */
export class ExplorationBatchRejected extends Error {}

export type ReservedExplorationChild = Readonly<{requestId:string;prompt:string;proof:string}>;
export type ExplorationChildResult = Readonly<{requestId:string;status:'completed'|'rejected'|'unknown'}|{requestId:string;status:'quality_held';qualityReason:ExplorationQualityReason}|{requestId:string;status:'failed';closureReason:ExplorationClosureReason;providerOutcome:ExplorationProviderOutcome}>;
export type ExplorationBatchPorts = Readonly<{
  generate:(child:ReservedExplorationChild)=>Promise<Uint8Array>;
  put:(child:ReservedExplorationChild,bytes:Uint8Array)=>Promise<void>;
  finish:(child:ReservedExplorationChild,state:'completed'|'unknown')=>Promise<void>;
  reject:(child:ReservedExplorationChild)=>Promise<void>;
  hold:(child:ReservedExplorationChild,reason:ExplorationQualityReason)=>Promise<void>;
  fail?:(child:ReservedExplorationChild,closureReason:ExplorationClosureReason,providerOutcome:ExplorationProviderOutcome)=>Promise<void>;
}>;

const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/**
 * Dispatches exactly the three children of an already reserved batch.
 * The caller must authenticate, validate the plan and atomically reserve all
 * three before calling this helper. A result of unknown never authorizes retry.
 */
export async function dispatchReservedExplorationBatch(children:readonly ReservedExplorationChild[],ports:ExplorationBatchPorts):Promise<ExplorationChildResult[]> {
  if(children.length!==3 || children.some(child=>!child || !uuid(child.requestId) || typeof child.prompt!=='string' || !child.prompt.trim() || child.prompt.length>8000 || typeof child.proof!=='string' || !child.proof)) throw Error('invalid_batch');
  if(new Set(children.map(child=>child.requestId)).size!==3 || new Set(children.map(child=>child.proof)).size!==3) throw Error('invalid_batch');
  const items=children.map(({requestId,prompt,proof})=>Object.freeze({requestId,prompt,proof}));
  return Promise.all(items.map(async child=>{
    try {
      let bytes:Uint8Array;
      try { bytes=await ports.generate(child); }
      catch(error) {
        if(error instanceof ExplorationQualityHeld) {
          await ports.hold(child,error.reason);
          return {requestId:child.requestId,status:'quality_held',qualityReason:error.reason} as const;
        }
        if(error instanceof ExplorationBatchRejected) {
          await ports.reject(child);
          return {requestId:child.requestId,status:'rejected'} as const;
        }
        if(error instanceof ExplorationProviderClosed && ports.fail) {
          await ports.fail(child,error.closureReason,error.providerOutcome);
          return {requestId:child.requestId,status:'failed',closureReason:error.closureReason,providerOutcome:error.providerOutcome} as const;
        }
        throw error;
      }
      if(!(bytes instanceof Uint8Array)||bytes.byteLength===0)throw Error('invalid_image');
      await ports.put(child,bytes);
      await ports.finish(child,'completed');
      return {requestId:child.requestId,status:'completed'} as const;
    } catch {
      try {await ports.finish(child,'unknown');} catch { /* Preserve uncertainty if persistence also fails. */ }
      return {requestId:child.requestId,status:'unknown'} as const;
    }
  }));
}
