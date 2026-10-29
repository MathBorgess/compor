import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComporServer } from '../dist/server.js';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';
import { SummaryDelivery } from '../dist/phoenix_engine/services/summary_delivery.js';

async function connect(actor, session) {
  const server = createComporServer({ phoenixActorId: actor, phoenixProfileSession: session });
  const client = new Client({ name: 'profile-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}
const call = (connection, name, args = {}) => connection.client.callTool({ name, arguments: args });
const ok = async (connection, name, args = {}) => {
  const result = await call(connection, name, args);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent;
};

test('MCP profile tools update, undo and prepare a revocable local summary with a private Markdown history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-mcp-test-'));
  const ledger = new ProfileLedger('alice');
  const connection = await connect('alice', { ledger, directory: Promise.resolve(dir) });
  const event = { id: 'e1', kind: 'choice', version_id: 'v1', scope: { type: 'campaign', id: 'c1' }, source: 'selection', preference: { key: 'color', value: 'blue', confidence: 'confirmed' } };
  try {
    assert.equal((await call(connection, 'phoenix_profile_signal', event)).isError, true);
    await ok(connection, 'phoenix_profile_consent', { purpose: 'personalization', granted: true });
    await ok(connection, 'phoenix_profile_signal', event);
    const changed = await ok(connection, 'phoenix_profile_signal', { ...event, id: 'e2', kind: 'comment', source: 'conversation', version_id: 'v2', person_statement: 'Talvez amarelo', agent_interpretation: 'Possível mudança de cor', preference: { key: 'color', value: 'yellow', confidence: 'ambiguous' } });
    assert.equal(changed.change.previous.confidence, 'confirmed');
    assert.equal(changed.change.current.value, 'yellow');
    assert.match(changed.message, /desfazer/);
    assert.equal((await ok(connection, 'phoenix_profile_signal', { ...event, id: 'e2', kind: 'comment', source: 'conversation', version_id: 'v2', person_statement: 'Talvez amarelo', agent_interpretation: 'Possível mudança de cor', preference: { key: 'color', value: 'yellow', confidence: 'ambiguous' } })).duplicate, true);
    const undone = await ok(connection, 'phoenix_profile_undo', { change_id: changed.change.id, correction: 'Era apenas um teste' });
    assert.equal(undone.change.current.value, 'blue');
    const profile = await ok(connection, 'phoenix_profile_read');
    assert.equal(profile.profile.events[1].person_statement, 'Talvez amarelo');
    assert.equal(profile.profile.events[1].agent_interpretation, 'Possível mudança de cor');
    assert.equal((await stat(profile.markdown_path)).mode & 0o777, 0o600);
    const markdown = await readFile(profile.markdown_path, 'utf8');
    assert.match(markdown, /Era apenas um teste/);
    assert.match(markdown, /Talvez amarelo/);
    assert.equal((await call(connection, 'phoenix_profile_summary', { recipient: 'maintainer', purpose: 'study' })).isError, true);
    await ok(connection, 'phoenix_profile_consent', { purpose: 'maintainer_summary', granted: true });
    await ok(connection, 'phoenix_profile_maintainer_consent', { recipient: 'maintainer', purpose: 'study', granted: true });
    const summary = await ok(connection, 'phoenix_profile_summary', { recipient: 'maintainer', purpose: 'study' });
    assert.equal(summary.delivery, 'not_sent');
    assert.equal(summary.summary.id, 'alice');
    assert.equal(summary.summary.sources[1].version_id, 'v2');
    assert.doesNotMatch(JSON.stringify(summary.summary), /Talvez amarelo|Era apenas um teste/);
    await ok(connection, 'phoenix_profile_maintainer_consent', { recipient: 'maintainer', purpose: 'study', granted: false });
    assert.equal((await call(connection, 'phoenix_profile_summary', { recipient: 'maintainer', purpose: 'study' })).isError, true);
    assert.equal(ledger.preparedSummaries('alice').length, 1);
  } finally { await connection.client.close(); await connection.server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('MCP host identity binds owner and collaborator; supplied actor cannot escalate access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-mcp-access-'));
  const ledger = new ProfileLedger('alice');
  const session = { ledger, directory: Promise.resolve(dir) };
  const alice = await connect('alice', session);
  const bob = await connect('bob', session);
  const eve = await connect('eve', session);
  try {
    await ok(alice, 'phoenix_profile_consent', { purpose: 'personalization', granted: true });
    await ok(alice, 'phoenix_profile_signal', { id: 'e1', kind: 'reaction', version_id: 'v1', scope: { type: 'task', id: 't1' }, source: 'reaction' });
    assert.equal((await call(bob, 'phoenix_profile_read', { actor: 'alice' })).isError, true);
    assert.equal((await call(bob, 'phoenix_profile_read_shared', { purpose: 'study', actor: 'alice' })).isError, true);
    await ok(alice, 'phoenix_profile_share', { collaborator: 'bob', purpose: 'study', granted: true });
    assert.equal((await ok(bob, 'phoenix_profile_read_shared', { purpose: 'study', actor: 'alice' })).profile.id, 'alice');
    assert.equal((await call(eve, 'phoenix_profile_read_shared', { purpose: 'study', actor: 'bob' })).isError, true);
    assert.equal((await call(bob, 'phoenix_profile_read_shared', { purpose: 'marketing' })).isError, true);
    await ok(alice, 'phoenix_profile_share', { collaborator: 'bob', purpose: 'study', granted: false });
    assert.equal((await call(bob, 'phoenix_profile_read_shared', { purpose: 'study' })).isError, true);
    const audit = (await ok(alice, 'phoenix_profile_read')).profile.audit;
    assert.ok(audit.some(a => a.action === 'read' && a.actor === 'bob'));
    assert.ok(audit.some(a => a.action === 'revoke_share'));
  } finally { for (const c of [alice, bob, eve]) { await c.client.close(); await c.server.close(); } await rm(dir, { recursive: true, force: true }); }
});

test('discovery uses only the chosen, consented profile scope and drops it after revocation', async () => {
  const { PhoenixMemoryStore } = await import('../dist/phoenix_engine/services/memory_store.js');
  const { createPhoenixHyperparams } = await import('../dist/phoenix_engine/config/hyperparams.js');
  const memory = new PhoenixMemoryStore({ hp: createPhoenixHyperparams() });
  const ledger = new ProfileLedger('alice');
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-scope-test-'));
  const server = createComporServer({ phoenixActorId: 'alice', phoenixMemoryStore: memory, phoenixProfileSession: { ledger, directory: Promise.resolve(dir) } });
  const client = new Client({ name: 'scope-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  const connection = { server, client };
  const search = (profile_scope) => ok(connection, 'discover_visual_references', { briefing: 'Arte editorial', target_format: 'carousel', client_mode: 'web', decision_fallback_mode: 'deterministic_mock', profile_scope });
  try {
    await ok(connection, 'phoenix_profile_consent', { purpose: 'personalization', granted: true });
    await ok(connection, 'phoenix_profile_signal', { id: 'a', kind: 'choice', version_id: 'v1', scope: { type: 'campaign', id: 'one' }, source: 'choice', preference: { key: 'color', value: 'blue', confidence: 'confirmed' } });
    await ok(connection, 'phoenix_profile_signal', { id: 'b', kind: 'choice', version_id: 'v1', scope: { type: 'campaign', id: 'two' }, source: 'choice', preference: { key: 'color', value: 'red', confidence: 'confirmed' } });
    const found = await search({ type: 'campaign', id: 'one' });
    assert.equal(found.candidate_origin, 'synthetic');
    assert.deepEqual(memory.getOrCreateUser('alice').user_taste.visual_dna_rules, ['color: blue (confirmed)']);
    await search({ type: 'campaign', id: 'two' });
    assert.deepEqual(memory.getOrCreateUser('alice').user_taste.visual_dna_rules, ['color: red (confirmed)']);
    await ok(connection, 'phoenix_profile_consent', { purpose: 'personalization', granted: false });
    await search({ type: 'campaign', id: 'one' });
    assert.deepEqual(memory.getOrCreateUser('alice').user_taste.visual_dna_rules, []);
  } finally { await client.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
});


test('MCP summary delivery requires host configuration, verifier, consent and remains blocked after revocation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phoenix-mcp-delivery-'));
  const ledger = new ProfileLedger('alice');
  const payloads = [];
  const port = { async send(summary) { payloads.push(summary); return { acknowledged: true, receipt: 'fake-1' }; } };
  const noConfig = await connect('alice', { ledger, directory: Promise.resolve(dir) });
  const noVerifier = await connect('alice', { ledger, directory: Promise.resolve(dir), delivery: new SummaryDelivery(ledger, port) });
  const configured = await connect('alice', { ledger, directory: Promise.resolve(dir), delivery: new SummaryDelivery(ledger, port, summary => !JSON.stringify(summary).includes('texto integral')) });
  const args = { recipient: 'maintainer', purpose: 'study' };
  try {
    assert.equal((await call(noConfig, 'phoenix_profile_send_summary', args)).isError, true);
    await ok(configured, 'phoenix_profile_consent', { purpose: 'personalization', granted: true });
    await ok(configured, 'phoenix_profile_consent', { purpose: 'maintainer_summary', granted: true });
    await ok(configured, 'phoenix_profile_maintainer_consent', { ...args, granted: true });
    await ok(configured, 'phoenix_profile_signal', { id: 'safe', kind: 'choice', version_id: 'v1', scope: { type: 'task', id: 't1' }, source: 'person', preference: { key: 'cor', value: 'azul', confidence: 'confirmed' } });
    assert.equal((await call(noVerifier, 'phoenix_profile_send_summary', args)).isError, true);
    const sent = await ok(configured, 'phoenix_profile_send_summary', args);
    assert.equal(sent.attempt.status, 'acknowledged');
    assert.equal(sent.attempt.receipt, 'fake-1');
    assert.equal(payloads.length, 1);
    await ok(configured, 'phoenix_profile_maintainer_consent', { ...args, granted: false });
    assert.equal((await call(configured, 'phoenix_profile_send_summary', args)).isError, true);
    assert.equal(payloads.length, 1);
  } finally { for (const c of [noConfig, noVerifier, configured]) { await c.client.close(); await c.server.close(); } await rm(dir, { recursive: true, force: true }); }
});
