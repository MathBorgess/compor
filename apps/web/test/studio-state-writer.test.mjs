import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioStateWriter } from '../lib/studio-state-writer.ts';

const ticks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function controlledRepository() {
  const writes = [];
  let closed = false;
  return {
    writes,
    get closed() { return closed; },
    save(snapshot, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      writes.push({ snapshot, options, promise, resolve, reject });
      return promise;
    },
    close() { closed = true; },
  };
}

test('flush includes a change enqueued as the previous save resolves', async () => {
  const repository = controlledRepository(), writer = createStudioStateWriter({ repository });
  writer.enqueue({ revision: 1 });
  let settled = false, second;
  const first = writer.flush().then(() => { settled = true; });
  repository.writes[0].promise.then(() => {
    writer.enqueue({ revision: 2 });
    second = writer.flush();
  });
  repository.writes[0].resolve();
  await ticks();
  assert.deepEqual(repository.writes.map(w => w.snapshot.revision), [1, 2]);
  assert.equal(settled, false, 'the original flush still waits for the new snapshot');
  assert.equal(repository.writes[1].options.expectedRevision, 1);
  repository.writes[1].resolve();
  await Promise.all([first, second]);
  assert.equal(settled, true);
});

test('close drains the resolving save and its queued successor before closing', async () => {
  const repository = controlledRepository(), writer = createStudioStateWriter({ repository });
  writer.enqueue({ revision: 1 });
  const first = writer.flush();
  let closing;
  repository.writes[0].promise.then(() => {
    writer.enqueue({ revision: 2 });
    closing = writer.close();
  });
  repository.writes[0].resolve();
  await ticks();
  assert.equal(repository.closed, false);
  assert.deepEqual(repository.writes.map(w => w.snapshot.revision), [1, 2]);
  assert.throws(() => writer.enqueue({ revision: 3 }), /local_storage_closed/);
  repository.writes[1].resolve();
  await Promise.all([first, closing]);
  assert.equal(repository.closed, true);
});

test('quota/CAS failure retains the newest snapshot without automatic retries', async () => {
  const repository = controlledRepository(), errors = [];
  const writer = createStudioStateWriter({ repository, onError: error => errors.push(error) });
  writer.enqueue({ revision: 1 });
  const first = writer.flush();
  writer.enqueue({ revision: 2 });
  const failure = Error('studio_storage_conflict');
  repository.writes[0].reject(failure);
  await assert.rejects(first, error => error === failure);
  await ticks();
  assert.equal(repository.writes.length, 1);
  assert.deepEqual(errors, [failure]);
  const retry = writer.flush();
  assert.equal(repository.writes[1].snapshot.revision, 2);
  assert.equal(repository.writes[1].options.expectedRevision, null);
  repository.writes[1].resolve();
  await retry;
});

test('closing an old project never writes into the next project repository', async () => {
  const oldRepository = controlledRepository(), nextRepository = controlledRepository();
  const oldWriter = createStudioStateWriter({ repository: oldRepository });
  const nextWriter = createStudioStateWriter({ repository: nextRepository });
  oldWriter.enqueue({ projectId: 'old', revision: 1 });
  const closing = oldWriter.close();
  nextWriter.enqueue({ projectId: 'next', revision: 1 });
  const next = nextWriter.flush();
  nextRepository.writes[0].resolve();
  await next;
  assert.equal(oldRepository.closed, false);
  assert.equal(nextRepository.closed, false);
  oldRepository.writes[0].resolve();
  await closing;
  assert.equal(oldRepository.writes[0].snapshot.projectId, 'old');
  assert.equal(nextRepository.writes[0].snapshot.projectId, 'next');
  assert.equal(oldRepository.closed, true);
});

test('close settles a failed write once and closes the repository', async () => {
  const repository = controlledRepository(), writer = createStudioStateWriter({ repository });
  writer.enqueue({ revision: 1 });
  const closing = writer.close();
  repository.writes[0].reject(Error('quota'));
  await assert.rejects(closing, /quota/);
  await ticks();
  assert.equal(repository.writes.length, 1);
  assert.equal(repository.closed, true);
});

test('unmount after an observed failure does not retry its pending snapshot', async () => {
  const repository = controlledRepository(), writer = createStudioStateWriter({ repository });
  writer.enqueue({ revision: 1 });
  const save = writer.flush();
  repository.writes[0].reject(Error('quota'));
  await assert.rejects(save, /quota/);
  await assert.rejects(writer.close(), /quota/);
  assert.equal(repository.writes.length, 1);
  assert.equal(repository.closed, true);
});
