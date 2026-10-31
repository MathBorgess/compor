import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';
import { SummaryDelivery, createSupabaseRestSummaryPort } from '../dist/phoenix_engine/services/summary_delivery.js';

function setup() {
  const ledger = new ProfileLedger('alice');
  ledger.setConsent('alice', 'personalization', true);
  ledger.record('alice', { id: 'e1', kind: 'comment', version_id: 'v1', scope: { type: 'task', id: 't1' }, source: 'conversation', person_statement: 'texto privado integral', preference: { key: 'cor', value: 'azul', confidence: 'confirmed' } });
  ledger.setConsent('alice', 'maintainer_summary', true);
  ledger.setMaintainerConsent('alice', 'maintainer', 'study', true);
  return ledger;
}

test('injected delivery validates continuous specific consent and preserves snapshots and acknowledgement', async () => {
  const ledger = setup();
  const received = [];
  const delivery = new SummaryDelivery(ledger, { async send(summary) { received.push(summary); return { acknowledged: true, receipt: 'receipt-1' }; } }, () => true);
  assert.equal((await delivery.send('alice', 'maintainer', 'study')).status, 'acknowledged');
  assert.equal(received.length, 1);
  assert.doesNotMatch(JSON.stringify(received), /texto privado integral/);
  assert.equal(received[0].sources[0].version_id, 'v1');
  ledger.setMaintainerConsent('alice', 'maintainer', 'study', false);
  await assert.rejects(delivery.send('alice', 'maintainer', 'study'), /consent/);
  await assert.rejects(delivery.send('alice', 'other', 'study'), /consent/);
  assert.equal(received.length, 1);
  assert.equal(ledger.preparedSummaries('alice').length, 1);
  assert.equal(delivery.listAttempts('alice')[0].receipt, 'receipt-1');
  assert.throws(() => delivery.listAttempts('other'), /denied/);
});

test('failure remains unknown and no port performs no send or preparation', async () => {
  const ledger = setup();
  const noPort = new SummaryDelivery(ledger);
  await assert.rejects(noPort.send('alice', 'maintainer', 'study'), /No summary delivery port/);
  assert.equal(ledger.preparedSummaries('alice').length, 0);
  const delivery = new SummaryDelivery(ledger, { async send() { throw new Error('timeout'); } }, () => true);
  assert.equal((await delivery.send('alice', 'maintainer', 'study')).status, 'unknown');
  assert.equal(ledger.preparedSummaries('alice').length, 1);
  assert.equal(delivery.listAttempts('alice').length, 1);
});

test('optional REST port sends only the summary to an explicit HTTPS endpoint with host key', async () => {
  const requests = [];
  const port = createSupabaseRestSummaryPort({ endpoint: 'https://example.invalid/rest/v1/profiles', apiKey: 'host-key', fetchFn: async (url, init) => { requests.push({ url, init }); return new Response(null, { status: 201 }); } });
  const delivery = new SummaryDelivery(setup(), port, () => true);
  assert.equal((await delivery.send('alice', 'maintainer', 'study')).status, 'acknowledged');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.recipient, 'maintainer');
  assert.equal(body.purpose, 'study');
  assert.equal(body.summary.id, 'alice');
  assert.doesNotMatch(requests[0].init.body, /texto privado integral/);
  assert.equal(requests[0].init.headers.apikey, 'host-key');
  assert.throws(() => createSupabaseRestSummaryPort({ endpoint: 'http://example.invalid/rest/v1/profiles', apiKey: 'key' }), /Invalid/);
  const rejected = createSupabaseRestSummaryPort({ endpoint: 'https://example.invalid/rest/v1/profiles', apiKey: 'host-key', fetchFn: async () => new Response(null, { status: 403 }) });
  assert.equal((await new SummaryDelivery(setup(), rejected, () => true).send('alice', 'maintainer', 'study')).status, 'unknown');
});


test('host must explicitly verify minimization, and consent is checked again after verification', async () => {
  const ledger = setup();
  let sent = 0;
  const port = { async send() { sent++; return { acknowledged: true }; } };
  await assert.rejects(new SummaryDelivery(ledger, port).send('alice', 'maintainer', 'study'), /verification required/);
  await assert.rejects(new SummaryDelivery(ledger, port, () => false).send('alice', 'maintainer', 'study'), /verification failed/);
  const unsafe = setup();
  unsafe.record('alice', { id: 'e2', kind: 'edit', version_id: 'v2', scope: { type: 'task', id: 't1' }, source: 'person', preference: { key: 'copy', value: 'full-text', confidence: 'ambiguous' } });
  await assert.rejects(new SummaryDelivery(unsafe, port, summary => !JSON.stringify(summary).includes('full-text')).send('alice', 'maintainer', 'study'), /verification failed/);
  await assert.rejects(new SummaryDelivery(ledger, port, () => { ledger.setMaintainerConsent('alice', 'maintainer', 'study', false); return true; }).send('alice', 'maintainer', 'study'), /consent/);
  assert.equal(sent, 0);
});
