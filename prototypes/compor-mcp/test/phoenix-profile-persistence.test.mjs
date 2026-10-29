import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';

const signal = { id: 'e1', kind: 'comment', version_id: 'v1', scope: { type: 'campaign', id: 'campaign' }, source: 'conversation', person_statement: 'Talvez azul', agent_interpretation: 'Pode preferir azul', preference: { key: 'cor', value: 'azul', confidence: 'ambiguous' } };

test('local snapshot restores consent, events, deduplication, changes and correction after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-persist-'));
  try {
    const first = await ProfileLedger.restoreLocal('owner', dir);
    first.setConsent('owner', 'personalization', true);
    first.setConsent('owner', 'maintainer_summary', true);
    first.setMaintainerConsent('owner', 'maintainer', 'study', true);
    const changed = first.record('owner', signal);
    first.undo('owner', changed.change.id, 'Na verdade prefiro outras opções');
    first.share('owner', 'bob', 'study');
    first.readShared('bob', 'study');
    first.maintainerSummary('owner', 'maintainer', 'study');
    const path = await first.saveLocal('owner', dir);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const restored = await ProfileLedger.restoreLocal('owner', dir);
    const profile = restored.read('owner');
    assert.equal(profile.events[0].person_statement, 'Talvez azul');
    assert.equal(profile.events[0].agent_interpretation, 'Pode preferir azul');
    assert.equal(profile.preferences.length, 0);
    assert.equal(profile.changes[1].correction, 'Na verdade prefiro outras opções');
    assert.ok(profile.audit.some(a => a.actor === 'bob'));
    assert.equal(restored.preparedSummaries('owner').length, 1);
    assert.equal(restored.record('owner', signal).duplicate, true);
    restored.revokeShare('owner', 'bob', 'study');
    restored.setConsent('owner', 'personalization', false);
    await restored.saveLocal('owner', dir);
    const reopened = await ProfileLedger.restoreLocal('owner', dir);
    assert.throws(() => reopened.record('owner', { ...signal, id: 'e2' }), /consent/i);
    assert.throws(() => reopened.readShared('bob', 'study'), /denied/i);
    assert.throws(() => reopened.read('intruder'), /denied/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('stale writer, active lock and malformed snapshots never overwrite preserved state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-concurrency-'));
  try {
    const first = await ProfileLedger.restoreLocal('owner', dir);
    const stale = await ProfileLedger.restoreLocal('owner', dir);
    first.setConsent('owner', 'personalization', true);
    first.record('owner', signal);
    const path = await first.saveLocal('owner', dir);
    const original = await readFile(path, 'utf8');
    stale.setConsent('owner', 'evaluation', true);
    await assert.rejects(stale.saveLocal('owner', dir), /changed/i);
    assert.equal(await readFile(path, 'utf8'), original);
    await writeFile(`${path}.lock`, 'busy', { mode: 0o600 });
    await assert.rejects(first.saveLocal('owner', dir), { code: 'EEXIST' });
    assert.equal(await readFile(path, 'utf8'), original);
    await rm(`${path}.lock`);
    await writeFile(path, '{ invalid', { mode: 0o600 });
    await assert.rejects(ProfileLedger.restoreLocal('owner', dir));
    assert.equal(await readFile(path, 'utf8'), '{ invalid');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('MCP conversations restore profile and continue editing after server restart', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createComporServer } = await import('../dist/server.js');
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-mcp-persist-'));
  async function connection() {
    const ledger = await ProfileLedger.restoreLocal('host-bound-owner', dir);
    const server = createComporServer({ phoenixActorId: 'host-bound-owner', phoenixProfileSession: { ledger, persistenceDirectory: dir, directory: Promise.resolve(dir) } });
    const client = new Client({ name: 'profile-restart-test', version: '1' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st); await client.connect(ct);
    return { client, server };
  }
  const call = (c, name, args) => c.client.callTool({ name, arguments: args });
  try {
    let c = await connection();
    assert.notEqual((await call(c, 'phoenix_profile_consent', { purpose: 'personalization', granted: true })).isError, true);
    const recorded = await call(c, 'phoenix_profile_signal', signal);
    assert.match(recorded.content[0].text, /ambígua/);
    assert.match(recorded.content[0].text, /desfazer/);
    const changeId = recorded.structuredContent.change.id;
    await c.client.close(); await c.server.close();
    c = await connection();
    const profile = await call(c, 'phoenix_profile_read', {});
    assert.equal(profile.structuredContent.profile.preferences[0].value, 'azul');
    const duplicate = await call(c, 'phoenix_profile_signal', signal);
    assert.equal(duplicate.structuredContent.duplicate, true);
    assert.match(duplicate.content[0].text, /já havia sido registrado/);
    const undone = await call(c, 'phoenix_profile_undo', { change_id: changeId, correction: 'Era só uma sugestão' });
    assert.match(undone.content[0].text, /Desfiz/);
    await c.client.close(); await c.server.close();
    const loaded = await ProfileLedger.restoreLocal('host-bound-owner', dir);
    assert.equal(loaded.read('host-bound-owner').changes.at(-1).correction, 'Era só uma sugestão');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent persistence calls within the same ledger instance serialize without EEXIST and persist late mutations across restart', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createComporServer } = await import('../dist/server.js');
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-concurrent-ledger-'));
  try {
    // 1. Direct concurrent saveLocal calls on the same ledger instance, including a mutation arriving mid-flight
    const ledger = await ProfileLedger.restoreLocal('owner', dir);
    ledger.setConsent('owner', 'personalization', true);
    ledger.record('owner', signal);
    const firstSavePromise = ledger.saveLocal('owner', dir);

    // Mutate after firstSavePromise has already been initiated (and potentially after it serialized its snapshot)
    const secondSavePromise = Promise.resolve().then(() => {
      ledger.record('owner', {
        ...signal,
        id: 'e_late',
        preference: { key: 'tipografia', value: 'grotesca', confidence: 'confirmed' },
      });
      return ledger.saveLocal('owner', dir);
    });

    const [path1, path2] = await Promise.all([firstSavePromise, secondSavePromise]);
    assert.equal(path1, path2);

    const restoredAfterDirect = await ProfileLedger.restoreLocal('owner', dir);
    const directProfile = restoredAfterDirect.read('owner');
    assert.equal(directProfile.events.length, 2);
    assert.ok(directProfile.preferences.some((p) => p.key === 'tipografia' && p.value === 'grotesca'));

    // 2. Concurrent MCP profile tool calls over the same connection/session
    const server = createComporServer({
      phoenixActorId: 'owner',
      phoenixProfileSession: {
        ledger: restoredAfterDirect,
        persistenceDirectory: dir,
        directory: Promise.resolve(dir),
      },
    });
    const client = new Client({ name: 'concurrent-profile-tools', version: '1' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);

    try {
      const [resA, resB, resC] = await Promise.all([
        client.callTool({
          name: 'phoenix_profile_signal',
          arguments: {
            ...signal,
            id: 'e_conc_1',
            preference: { key: 'grid', value: 'suico', confidence: 'confirmed' },
          },
        }),
        client.callTool({
          name: 'phoenix_profile_signal',
          arguments: {
            ...signal,
            id: 'e_conc_2',
            preference: { key: 'contraste', value: 'alto', confidence: 'confirmed' },
          },
        }),
        client.callTool({
          name: 'phoenix_profile_share',
          arguments: { collaborator: 'alice', purpose: 'review', granted: true },
        }),
      ]);

      assert.notEqual(resA.isError, true);
      assert.notEqual(resB.isError, true);
      assert.notEqual(resC.isError, true);
    } finally {
      await client.close();
      await server.close();
    }

    const restoredFinal = await ProfileLedger.restoreLocal('owner', dir);
    const finalProfile = restoredFinal.read('owner');
    assert.equal(finalProfile.events.length, 4);
    assert.ok(finalProfile.preferences.some((p) => p.key === 'grid' && p.value === 'suico'));
    assert.ok(finalProfile.preferences.some((p) => p.key === 'contraste' && p.value === 'alto'));
    assert.ok(finalProfile.shares.some((s) => s.collaborator === 'alice' && s.active === true));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
