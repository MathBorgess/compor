import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createSessionBindings } from '../src/session-binding.mjs';

const userId = 'a2b9eb55-83e4-41d5-b726-c28116a31234';
const projectId = 'a2b9eb55-83e4-41d5-b726-c28116a34321';
const attemptId = 'a2b9eb55-83e4-41d5-b726-c28116a39999';
const secret = Buffer.alloc(32, 11);

test('recovery proof is durable and cannot be forged or moved to another user, project or attempt', () => {
  let time = 1;
  const b = createSessionBindings({ secret, now: () => time });
  const context = { userId, projectId, attemptId };
  const proof = b.issueRecovery({ ...context, sessionId: 'sess_example' });
  time += 99_000_000;
  assert.equal(b.verifyRecovery({ ...context, token: proof }).sessionId, 'sess_example');
  for (const field of Object.keys(context)) assert.equal(b.verifyRecovery({ ...context, [field]: '12345678-1234-4123-8123-123456789abc', token: proof }), null);
  const p = proof.split('.');
  const value = JSON.parse(Buffer.from(p[1], 'base64url'));
  value.sessionId = 'sess_forged';
  assert.equal(b.verifyRecovery({ ...context, token: `v4.${Buffer.from(JSON.stringify(value)).toString('base64url')}.${p[2]}` }), null);
  assert.equal(createSessionBindings({secret:Buffer.alloc(32,12)}).verifyRecovery({...context, token:proof}), null);
  assert.throws(() => b.issueRecovery({ ...context, sessionId:'sk-secret-unsafe' }));
});

test('recovery proof signs the reference-selection origin and rejects an added or unknown origin', () => {
  const b = createSessionBindings({ secret });
  const context = { userId, projectId, attemptId };
  const selection = b.issueRecovery({ ...context, sessionId: 'sess_example', origin: 'reference_selection' });
  assert.deepEqual(b.verifyRecovery({ ...context, token: selection }), { ...context, sessionId: 'sess_example', origin: 'reference_selection' });
  const plain = b.issueRecovery({ ...context, sessionId: 'sess_example' });
  assert.deepEqual(b.verifyRecovery({ ...context, token: plain }), { ...context, sessionId: 'sess_example' });
  const p = plain.split('.');
  const added = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p[1], 'base64url')), origin: 'reference_selection' })).toString('base64url');
  assert.equal(b.verifyRecovery({ ...context, token: `v4.${added}.${p[2]}` }), null);
  const unknown = Buffer.from(JSON.stringify({ ...context, sessionId: 'sess_example', origin: 'user' })).toString('base64url');
  assert.equal(b.verifyRecovery({ ...context, token: `v4.${unknown}.${createHmac('sha256', secret).update(`v4.${unknown}`).digest('base64url')}` }), null);
  assert.throws(() => b.issueRecovery({ ...context, sessionId: 'sess_example', origin: 'user' }));
});
