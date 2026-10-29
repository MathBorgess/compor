import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileLedger } from '../dist/phoenix_engine/services/profile_ledger.js';

const owner = 'person-a';
const scope = { type: 'campaign', id: 'campaign-1' };
const signal = (id, patch = {}) => ({ id, kind: 'comment', version_id: 'v1', scope, source: 'conversation', ...patch });

test('signals update the chosen scope, preserve statement and interpretation, and undo ambiguous changes', () => {
  const profile = new ProfileLedger(owner);
  assert.throws(() => profile.record(owner, signal('without-consent')), /consent/);
  profile.setConsent(owner, 'personalization', true);
  const confirmed = profile.record(owner, signal('one', { person_statement: 'Prefiro azul', preference: { key: 'color', value: 'blue', confidence: 'confirmed' } }));
  const ambiguous = profile.record(owner, signal('two', { version_id: 'v2', person_statement: 'Talvez tente amarelo', agent_interpretation: 'Possível preferência por amarelo', preference: { key: 'color', value: 'yellow', confidence: 'ambiguous' } }));
  assert.equal(ambiguous.change.previous.confidence, 'confirmed');
  assert.equal(profile.read(owner).preferences[0].value, 'yellow');
  assert.equal(profile.read(owner).events[1].person_statement, 'Talvez tente amarelo');
  assert.equal(profile.read(owner).events[1].agent_interpretation, 'Possível preferência por amarelo');
  const undo = profile.undo(owner, ambiguous.change.id, 'Eu queria apenas experimentar');
  assert.equal(undo.current.value, 'blue');
  assert.equal(profile.read(owner).preferences[0].confidence, 'confirmed');
  assert.throws(() => profile.undo(owner, ambiguous.change.id, 'again'), /already undone/);
  assert.equal(confirmed.change.current.version_id, 'v1');
  assert.match(profile.markdown(owner), /Eu queria apenas experimentar/);
});

test('duplicate events are idempotent, conflicting copies and stale undo fail', () => {
  const profile = new ProfileLedger(owner);
  profile.setConsent(owner, 'personalization', true);
  const first = signal('one', { kind: 'choice', preference: { key: 'layout', value: 'grid', confidence: 'confirmed' } });
  const change = profile.record(owner, first).change;
  assert.equal(profile.record(owner, { ...first }).duplicate, true);
  assert.equal(profile.read(owner).changes.length, 1);
  assert.throws(() => profile.record(owner, { ...first, kind: 'rejection' }), /Conflicting duplicate/);
  profile.record(owner, signal('two', { kind: 'edit', preference: { key: 'layout', value: 'free', confidence: 'ambiguous' } }));
  assert.throws(() => profile.undo(owner, change.id, 'wrong'), /no longer current/);
  for (const kind of ['edit', 'choice', 'rejection', 'reaction', 'export', 'comment']) profile.record(owner, signal(`kind-${kind}`, { kind }));
  assert.equal(profile.read(owner).events.length, 8);
});

test('consents are independent, summary requires named recipient and purpose, revocation retains prepared snapshots', () => {
  const profile = new ProfileLedger(owner);
  profile.setConsent(owner, 'personalization', true);
  profile.record(owner, signal('one', { person_statement: 'private text', version_id: 'piece-v1', preference: { key: 'font', value: 'serif', confidence: 'confirmed' } }));
  profile.setConsent(owner, 'evaluation', true);
  assert.throws(() => profile.maintainerSummary(owner, 'maintainer', 'study'), /consent/);
  profile.setConsent(owner, 'maintainer_summary', true);
  profile.setMaintainerConsent(owner, 'maintainer', 'study', true);
  assert.throws(() => profile.maintainerSummary(owner, 'other', 'study'), /consent/);
  const summary = profile.maintainerSummary(owner, 'maintainer', 'study');
  assert.equal(summary.sources[0].source, 'conversation');
  assert.equal(summary.sources[0].version_id, 'piece-v1');
  assert.deepEqual(summary.sources[0].scope, scope);
  assert.doesNotMatch(JSON.stringify(summary), /private text/);
  profile.setMaintainerConsent(owner, 'maintainer', 'study', false);
  assert.throws(() => profile.maintainerSummary(owner, 'maintainer', 'study'), /consent/);
  assert.equal(profile.preparedSummaries(owner).length, 1);
  profile.setConsent(owner, 'personalization', false);
  assert.throws(() => profile.record(owner, signal('later')), /consent/);
  assert.equal(profile.read(owner).consents.find(c => c.purpose === 'evaluation').granted, true);
});

test('sharing grants only the named collaborator and purpose and records reads and revocation', () => {
  const profile = new ProfileLedger(owner);
  profile.setConsent(owner, 'personalization', true);
  profile.record(owner, signal('one'));
  assert.throws(() => profile.read('person-b'), /denied/);
  assert.throws(() => profile.readShared('person-b', 'study'), /denied/);
  profile.share(owner, 'person-b', 'study');
  assert.throws(() => profile.readShared('person-c', 'study'), /denied/);
  assert.throws(() => profile.readShared('person-b', 'marketing'), /denied/);
  assert.equal(profile.readShared('person-b', 'study').events.length, 1);
  profile.revokeShare(owner, 'person-b', 'study');
  assert.throws(() => profile.readShared('person-b', 'study'), /denied/);
  const audit = profile.read(owner).audit;
  assert.ok(audit.some(a => a.action === 'share'));
  assert.ok(audit.some(a => a.action === 'read' && a.actor === 'person-b'));
  assert.ok(audit.some(a => a.action === 'revoke_share'));
  assert.match(profile.markdown(owner), /person-b/);
});

test('local Markdown is private and reflects updates, corrections and access history', async () => {
  const { mkdtemp, readFile, stat, rm, chmod } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'phoenix-profile-test-'));
  try {
    const profile = new ProfileLedger(owner);
    profile.setConsent(owner, 'personalization', true);
    const change = profile.record(owner, signal('one', { preference: { key: 'color', value: 'red', confidence: 'ambiguous' } })).change;
    const path = await profile.syncMarkdown(owner, directory);
    assert.match(path, /phoenix-profile-[a-f0-9]+\.md$/);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    profile.undo(owner, change.id, 'Não era uma preferência');
    profile.share(owner, 'person-b', 'study');
    profile.readShared('person-b', 'study');
    assert.equal(await profile.syncMarkdown(owner, directory), path);
    const markdown = await readFile(path, 'utf8');
    assert.match(markdown, /Não era uma preferência/);
    assert.match(markdown, /person-b/);
    assert.match(markdown, /undo_of/);
    await chmod(directory, 0o755);
    await assert.rejects(profile.syncMarkdown(owner, directory), /private/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
