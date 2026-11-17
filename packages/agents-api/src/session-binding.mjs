import {isAgentCallId} from './agent-call-id.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { imageProposalDigest, artworkInputDigest, parseArtworkInput } from './artwork-input.mjs';
import {visualInputDigest as digestVisualInput} from './visual-input.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sessionIdValid = value => typeof value === 'string' && /^sess_[A-Za-z0-9_-]{1,128}$/.test(value) && !/sk-/i.test(value);
const callIdValid = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value) && !/sk-/i.test(value);
const lifetime = 10 * 60 * 1000;
const digestValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const visualClaimValid=(digest,ids)=>digest===undefined&&ids===undefined||digestValid(digest)&&Array.isArray(ids)&&ids.length<=20&&ids.every(uuid)&&new Set(ids.map(id=>id.toLowerCase())).size===ids.length;
const packIds=ids=>Buffer.concat(ids.map(id=>Buffer.from(id.replaceAll('-',''),'hex'))).toString('base64url');
function unpackIds(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]*$/.test(value))throw Error('invalid visual IDs');
  const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value||bytes.length%16||bytes.length>320)throw Error('invalid visual IDs');
  const ids=[];for(let offset=0;offset<bytes.length;offset+=16){const hex=bytes.subarray(offset,offset+16).toString('hex');ids.push(`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`);}return ids;
}

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
  // Durable, domain-separated provenance proof. The Supabase caller can write
  // a row, so recovery must not trust its contents without this signature.
  // `origin` signs which reply contract the session was opened with; proofs
  // issued before it existed have none and keep their original contract.
  function issueRecovery({ userId, projectId, attemptId, sessionId, origin, conversationId, visualInputDigest, visualReferenceIds, visualRequiredIds }) {
    if (![userId, projectId, attemptId].every(uuid) || !sessionIdValid(sessionId) || (origin !== undefined && origin !== 'reference_selection') || (conversationId !== undefined && conversationId !== 'references' && !uuid(conversationId)) || !visualClaimValid(visualInputDigest,visualReferenceIds) || (visualRequiredIds!==undefined&&(!Array.isArray(visualReferenceIds)||!Array.isArray(visualRequiredIds)||new Set(visualRequiredIds).size!==visualRequiredIds.length||visualRequiredIds.some(id=>!visualReferenceIds.includes(id))))) throw new Error('invalid recovery context');
    const requiredMask=visualRequiredIds?.reduce((mask,id)=>mask|1<<visualReferenceIds.indexOf(id),0);
    const payload = Buffer.from(JSON.stringify({ userId, projectId, attemptId, sessionId, ...(origin ? { origin } : {}), ...(conversationId ? { conversationId } : {}),...(visualInputDigest!==undefined?{visualInputDigest,visualReferences:packIds(visualReferenceIds)}:{}),...(requiredMask!==undefined?{visualRequired:requiredMask}:{}) })).toString('base64url');
    return `v4.${payload}.${createHmac('sha256', signingKey).update(`v4.${payload}`).digest('base64url')}`;
  }
  function verifyRecovery({ token, userId, projectId, attemptId }) {
    try {
      if (typeof token !== 'string' || token.length > 2048 || ![userId, projectId, attemptId].every(uuid)) return null;
      const p = token.split('.');
      if (p.length !== 3 || p[0] !== 'v4' || !/^[A-Za-z0-9_-]+$/.test(p[1]) || !/^[A-Za-z0-9_-]+$/.test(p[2])) return null;
      const actual = Buffer.from(p[2], 'base64url');
      const expected = createHmac('sha256', signingKey).update(`v4.${p[1]}`).digest();
      if (actual.length !== expected.length || actual.toString('base64url') !== p[2] || !timingSafeEqual(actual, expected)) return null;
      const bytes = Buffer.from(p[1], 'base64url');
      if (bytes.toString('base64url') !== p[1]) return null;
      const value = JSON.parse(bytes.toString('utf8'));
      const signedOrigin = value && Object.hasOwn(value, 'origin');
      const scoped=value&&Object.hasOwn(value,'conversationId');
      const visual=value&&Object.hasOwn(value,'visualInputDigest');
      const visualReferenceIds=visual?unpackIds(value.visualReferences):undefined;
      const hasRequired=value&&Object.hasOwn(value,'visualRequired');
      if (!value || Object.keys(value).length !== (signedOrigin ? 5 : 4)+(scoped?1:0)+(visual?2:0)+(hasRequired?1:0) || !visualClaimValid(value.visualInputDigest,visualReferenceIds) || (hasRequired&&(!visual||!Number.isSafeInteger(value.visualRequired)||value.visualRequired<0||value.visualRequired>=2**visualReferenceIds.length)) || (scoped&&value.conversationId!=='references'&&!uuid(value.conversationId)) || (signedOrigin && value.origin !== 'reference_selection') || value.userId !== userId || value.projectId !== projectId || value.attemptId !== attemptId || !sessionIdValid(value.sessionId)) return null;
      return { userId, projectId, attemptId, sessionId: value.sessionId, ...(signedOrigin ? { origin: value.origin } : {}), ...(scoped?{conversationId:value.conversationId}:{}),...(visual?{visualInputDigest:value.visualInputDigest,visualReferenceIds,...(hasRequired?{visualRequiredIds:visualReferenceIds.filter((_,i)=>value.visualRequired&(1<<i))}:{})}:{}) };
    } catch { return null; }
  }
  // Stable per original attempt, but unlinkable without the server secret.
  function recoveryAttemptKey({ userId, projectId, attemptId }) {
    if (![userId, projectId, attemptId].every(uuid)) throw new Error('invalid recovery context');
    const bytes = Buffer.from(createHmac('sha256', signingKey).update(`recovery-attempt-v1:${userId}:${projectId}:${attemptId}`).digest().subarray(0,16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function issueAction({ userId, projectId, attemptId, sessionId, turnId, callId, prompt, proposal, visualInputDigest }) {
    const iat = now();
    if (![userId, projectId, attemptId].every(uuid) || !sessionIdValid(sessionId) || !callIdValid(turnId, 'turn') || !isAgentCallId(callId) || (visualInputDigest!==undefined&&!digestValid(visualInputDigest)) || !Number.isSafeInteger(iat) || iat < 0 || !Number.isSafeInteger(iat + lifetime)) throw new Error('invalid action context');
    const proposalDigest = imageProposalDigest(proposal ?? {prompt});
    const payload = Buffer.from(JSON.stringify({ userId, projectId, attemptId, sessionId, turnId, callId, proposalDigest,...(visualInputDigest!==undefined?{visualInputDigest}:{}), iat, exp: iat + lifetime })).toString('base64url');
    const signature = createHmac('sha256', signingKey).update(`v5.${payload}`).digest('base64url');
    return `v5.${payload}.${signature}`;
  }
  function verifyAction({ token, userId, projectId, attemptId }) {
    try {
      if (typeof token !== 'string' || token.length > 2048 || ![userId, projectId, attemptId].every(uuid)) return null;
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== 'v5' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;
      const actual = Buffer.from(parts[2], 'base64url'), expected = createHmac('sha256', signingKey).update(`v5.${parts[1]}`).digest();
      if (actual.length !== expected.length || actual.toString('base64url') !== parts[2] || !timingSafeEqual(actual, expected)) return null;
      const raw = Buffer.from(parts[1], 'base64url'); if (raw.toString('base64url') !== parts[1]) return null;
      const claim = JSON.parse(raw.toString('utf8')); const current = now();
      const visual=claim&&Object.hasOwn(claim,'visualInputDigest');
      if (!claim || Object.keys(claim).length !== 9+(visual?1:0) || (visual&&!digestValid(claim.visualInputDigest)) || claim.userId !== userId || claim.projectId !== projectId || claim.attemptId !== attemptId || !sessionIdValid(claim.sessionId) || !callIdValid(claim.turnId, 'turn') || !isAgentCallId(claim.callId) || !/^[0-9a-f]{64}$/.test(claim.proposalDigest) || !Number.isSafeInteger(current) || !Number.isSafeInteger(claim.iat) || !Number.isSafeInteger(claim.exp) || claim.exp !== claim.iat + lifetime || claim.iat > current || current >= claim.exp) return null;
      return { userId, projectId, attemptId, sessionId: claim.sessionId, turnId: claim.turnId, callId: claim.callId, proposalDigest: claim.proposalDigest,...(visual?{visualInputDigest:claim.visualInputDigest}:{}) };
    } catch { return null; }
  }
  // Only trusted server code may issue this proof after checking the actor's explicit
  // confirmation and access to the selected version. This is not an identity credential.
  function issueApprovedAction({ actionBinding, userId, projectId, attemptId, pieceId, version, artworkInput }) {
    const action = verifyAction({ token: actionBinding, userId, projectId, attemptId });
    const iat = now();
    if (!action || !uuid(pieceId) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647 || !Number.isSafeInteger(iat) || iat < 0 || !Number.isSafeInteger(iat + lifetime)) throw new Error('invalid approval context');
    const parsed=parseArtworkInput(artworkInput);
    if(Boolean(action.visualInputDigest)!==Boolean(parsed.visualInput)||parsed.visualInput&&digestVisualInput(parsed.visualInput)!==action.visualInputDigest)throw Error('visual_input_changed');
    const artworkDigest = artworkInputDigest(parsed);
    const payload = Buffer.from(JSON.stringify({ ...action, pieceId, version, artworkDigest, iat, exp: iat + lifetime })).toString('base64url');
    return `v6.${payload}.${createHmac('sha256', signingKey).update(`v6.${payload}`).digest('base64url')}`;
  }
  function verifyApprovedAction({ token, userId, projectId, attemptId, pieceId, version }) {
    try {
      if (typeof token !== 'string' || token.length > 2048 || ![userId,projectId,attemptId,pieceId].every(uuid) || !Number.isSafeInteger(version) || version < 1 || version > 2147483647) return null;
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== 'v6' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;
      const actual = Buffer.from(parts[2], 'base64url'), expected = createHmac('sha256', signingKey).update(`v6.${parts[1]}`).digest();
      if (actual.length !== expected.length || actual.toString('base64url') !== parts[2] || !timingSafeEqual(actual,expected)) return null;
      const raw = Buffer.from(parts[1], 'base64url'); if (raw.toString('base64url') !== parts[1]) return null;
      const c = JSON.parse(raw.toString('utf8')), current = now();
      const visual=c&&Object.hasOwn(c,'visualInputDigest');
      if (!c || Object.keys(c).length !== 12+(visual?1:0) || (visual&&!digestValid(c.visualInputDigest)) || c.userId !== userId || c.projectId !== projectId || c.attemptId !== attemptId || c.pieceId !== pieceId || c.version !== version || !sessionIdValid(c.sessionId) || !callIdValid(c.turnId,'turn') || !isAgentCallId(c.callId) || !/^[0-9a-f]{64}$/.test(c.proposalDigest) || !/^[0-9a-f]{64}$/.test(c.artworkDigest) || !Number.isSafeInteger(current) || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.exp !== c.iat + lifetime || c.iat > current || current >= c.exp) return null;
      return { userId,projectId,attemptId,pieceId,version,sessionId:c.sessionId,turnId:c.turnId,callId:c.callId,proposalDigest:c.proposalDigest,artworkDigest:c.artworkDigest,...(visual?{visualInputDigest:c.visualInputDigest}:{}) };
    } catch { return null; }
  }
  return Object.freeze({ issue, verify, issueRecovery, verifyRecovery, recoveryAttemptKey, issueAction, verifyAction, issueApprovedAction, verifyApprovedAction });
}
