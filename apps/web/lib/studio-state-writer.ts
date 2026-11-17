import type {StudioState} from './studio-domain.ts';
interface StateRepository {save:(state:StudioState,options:{expectedRevision:number|null})=>Promise<StudioState>;close:()=>void}
/** Serializes one account/project's local snapshots. A failed save is retained
 * for an explicit retry, rather than repeatedly retrying quota or CAS errors. */
export function createStudioStateWriter({ repository, storedRevision = null, onError = () => {} }: {repository?:StateRepository|null;storedRevision?:number|null;onError?:(error:unknown)=>void} = {}) {
  let pending:StudioState|null = null, saving:Promise<void>|null = null, closing:Promise<void>|null = null, stopped = false, failure:unknown = null;
  let external:Promise<void>|null=null;
  async function drain() {
    while (pending) {
      const snapshot = pending;
      pending = null;
      try {
        if(!repository)throw Error('local_storage_unavailable');
        await repository.save(snapshot, { expectedRevision: storedRevision });
        storedRevision = snapshot.revision;
      } catch (error) {
        pending = pending ?? snapshot;
        failure = error;
        try { onError(error); } catch {}
        throw error;
      }
    }
  }
  async function flushQueue(ignoreExternal=false) {
    if (typeof repository?.save !== 'function') throw Error('local_storage_unavailable');
    // Check again after awaiting the writer: another microtask can enqueue a
    // snapshot after drain resolves but before its saving promise is cleared.
    while (pending || saving) {
      if(external&&!ignoreExternal){await external;continue;}
      if (!saving) failure = null;
      const work = saving ?? (saving = drain());
      try { await work; }
      finally { if (saving === work) saving = null; }
    }
  }
  async function flush() {
    do{if(external)await external;await flushQueue();}while(external);
  }
  /** Hold saves only for the short local transaction; queued edits remain in memory. */
  async function acquireExternal(baseline:StudioState){
    if(stopped||external||!repository)throw Error('local_storage_unavailable');
    let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});external=barrier;
    try{
      if(storedRevision===null&&!pending&&!saving)pending=baseline;
      await flushQueue(true);
      const baseRevision=storedRevision;if(baseRevision===null)throw Error('local_storage_unavailable');
      let finished=false;
      function end(){if(finished)return;finished=true;if(external===barrier)external=null;release();}
      return {baseRevision,commit(committed:StudioState,rebased:StudioState|null){
        if(finished||committed.revision!==baseRevision+1||rebased&&rebased.revision<=committed.revision)throw Error('local_storage_conflict');
        storedRevision=committed.revision;pending=rebased;end();
      },release:end};
    }catch(error){if(external===barrier)external=null;release();throw error;}
  }
  function enqueue(snapshot:StudioState) {
    if (stopped) throw Error('local_storage_closed');
    pending = snapshot;
  }
  function close() {
    if (closing) return closing;
    stopped = true;
    closing = (async () => {
      try {
        if (failure && !saving) throw failure;
        await flush();
      }
      finally { repository?.close(); }
    })();
    return closing;
  }
  return { enqueue, flush, close, acquireExternal };
}
