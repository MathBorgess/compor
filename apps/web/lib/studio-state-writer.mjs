/** Serializes one account/project's local snapshots. A failed save is retained
 * for an explicit retry, rather than repeatedly retrying quota or CAS errors. */
export function createStudioStateWriter({ repository, storedRevision = null, onError = () => {} } = {}) {
  let pending = null, saving = null, closing = null, stopped = false, failure = null;
  async function drain() {
    while (pending) {
      const snapshot = pending;
      pending = null;
      try {
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
  async function flush() {
    if (typeof repository?.save !== 'function') throw Error('local_storage_unavailable');
    // Check again after awaiting the writer: another microtask can enqueue a
    // snapshot after drain resolves but before its saving promise is cleared.
    while (pending || saving) {
      if (!saving) failure = null;
      const work = saving ?? (saving = drain());
      try { await work; }
      finally { if (saving === work) saving = null; }
    }
  }
  function enqueue(snapshot) {
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
  return { enqueue, flush, close };
}
