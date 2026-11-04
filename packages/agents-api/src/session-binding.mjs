import { createHmac, timingSafeEqual } from 'node:crypto';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sessionIdValid = value => typeof value === 'string' && /^sess_[A-Za-z0-9_-]{1,128}$/.test(value) && !/sk-/i.test(value);
const lifetime = 10 * 60 * 1000;

/** Server-only HMAC proof. Not a user credential, durable storage or authorization by itself. */
export function createSessionBindings({ secret, now = () => Date.now() } = {}) {
  if (!Buffer.isBuffer(secret) || secret.length < 32 || typeof now !== 'function') throw new TypeError('invalid signing configuration');
  const signingKey = Buffer.from(secret);
  function sign(payload) { return createHmac('sha256', signingKey).update(`v1.${payload}`).digest(); }
  function issue({ userId, projectId, attemptId, sessionId }) {
    const iat = now();
    if (![userId, projectId, attemptId].every(uuid) || !sessionIdValid(sessionId) || !Number.isSafeInteger(iat) || iat < 0 || !Number.isSafeInteger(iat + lifetime)) throw new Error('invalid session context');
    const payload = Buffer.from(JSON.stringify({ userId, projectId, attemptId, sessionId, iat, exp: iat + lifetime })).toString('base64url');
    return `v1.${payload}.${sign(payload).toString('base64url')}`;
  }
  function verify({ token, userId, projectId, attemptId }) {
    try {
      if (typeof token !== 'string' || token.length > 2048 || ![userId, projectId, attemptId].every(uuid)) return null;
      const pieces = token.split('.');
      if (pieces.length !== 3 || pieces[0] !== 'v1' || !/^[A-Za-z0-9_-]+$/.test(pieces[1]) || !/^[A-Za-z0-9_-]+$/.test(pieces[2])) return null;
      const signature = Buffer.from(pieces[2], 'base64url');
      const expected = sign(pieces[1]);
      if (signature.length !== expected.length || signature.toString('base64url') !== pieces[2] || !timingSafeEqual(signature, expected)) return null;
      const raw = Buffer.from(pieces[1], 'base64url');
      if (raw.toString('base64url') !== pieces[1]) return null;
      const claim = JSON.parse(raw.toString('utf8'));
      const current = now();
      if (!claim || Object.keys(claim).length !== 6 || claim.userId !== userId || claim.projectId !== projectId || claim.attemptId !== attemptId || !sessionIdValid(claim.sessionId) ||
          !Number.isSafeInteger(current) || !Number.isSafeInteger(claim.iat) || !Number.isSafeInteger(claim.exp) || claim.exp !== claim.iat + lifetime || claim.iat > current || current >= claim.exp) return null;
      return { sessionId: claim.sessionId, userId, projectId, attemptId };
    } catch { return null; }
  }
  return Object.freeze({ issue, verify });
}
