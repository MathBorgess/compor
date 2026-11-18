import {isAgentCallId} from './agent-call-id.mjs';
// Not wired to image generation or a public route. Successful reservation is not consent.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value) && !/sk-/i.test(value);
function isPublicKey(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { const parts = value.split('.'); return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon'; } catch { return false; }
}
export function createImageToolReservationStore({ url, anonKey, fetch: fetchApi = globalThis.fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !isPublicKey(anonKey)) throw new Error('invalid configuration');
  async function rpc(name, actor, body) {
    if (!uuid.test(actor?.userId ?? '') || typeof actor.token !== 'string' || !actor.token || /\s/.test(actor.token)) throw new Error('invalid identity');
    try {
      const response = await fetchApi(new URL(`/rest/v1/rpc/${name}`, base), { method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch { throw new Error('reservation status unknown'); }
  }
  function validCall(input) {
    return uuid.test(input?.projectId ?? '') && id(input?.sessionId, 'sess') && id(input?.turnId, 'turn') && isAgentCallId(input?.callId);
  }
  return {
    async reserve(input) {
      if (!validCall(input) || !uuid.test(input.pieceId ?? '') || !uuid.test(input.attemptId ?? '') || !Number.isInteger(input.version) || input.version < 1 || input.version > 2147483647) throw new Error('invalid reservation');
      const rows = await rpc('reserve_image_tool_call', input.actor, { p_project_id: input.projectId, p_piece_id: input.pieceId, p_piece_version: input.version, p_attempt_id: input.attemptId, p_session_id: input.sessionId, p_turn_id: input.turnId, p_call_id: input.callId });
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!uuid.test(row?.reservation_id ?? '') || !['reserved', 'unknown'].includes(row?.state) || typeof row?.is_new !== 'boolean' || (row.is_new && row.state !== 'reserved')) throw new Error('reservation status unknown');
      return { id: row.reservation_id, state: row.state, isNew: row.is_new };
    },
    async markUnknown(input) {
      if (!validCall(input)) throw new Error('invalid reservation');
      const result = await rpc('mark_image_tool_call_unknown', input.actor, { p_project_id: input.projectId, p_session_id: input.sessionId, p_turn_id: input.turnId, p_call_id: input.callId });
      if (result !== true) throw new Error('reservation status unknown');
    },
    async fenceUnsubmitted(input) {
      if (!validCall(input) || !uuid.test(input.pieceId ?? '') || !uuid.test(input.attemptId ?? '') || !Number.isInteger(input.version) || input.version < 1 || input.version > 2147483647) throw new Error('invalid reservation');
      const result = await rpc('fence_unsubmitted_image_tool_call', input.actor, {p_project_id:input.projectId,p_piece_id:input.pieceId,p_piece_version:input.version,p_attempt_id:input.attemptId,p_session_id:input.sessionId,p_turn_id:input.turnId,p_call_id:input.callId});
      if (!['fenced','unverified'].includes(result)) throw new Error('reservation status unknown');
      return {status:result};
    },
    async confirmClosedAttempt({actor,projectId,requestId}) {
      if (!uuid.test(projectId ?? '') || !uuid.test(requestId ?? '')) throw new Error('invalid attempt');
      const result=await rpc('confirm_closed_image_attempt',actor,{p_project_id:projectId,p_request_id:requestId});
      if (result==='failed_without_dispatch') return {status:'confirmed',outcome:result};
      if (!['confirmed','unverified'].includes(result)) throw new Error('reservation status unknown');
      return {status:result};
    },
    async declareConsent({ actor, reservationId, confirmed }) {
      if (!uuid.test(reservationId ?? '') || confirmed !== true) throw new Error('invalid declaration');
      const rows = await rpc('declare_image_generation_consent', actor, { p_reservation_id: reservationId, p_confirmed: true });
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!uuid.test(row?.declaration_id ?? '') || typeof row?.is_new !== 'boolean') throw new Error('reservation status unknown');
      return { id: row.declaration_id, isNew: row.is_new };
    },
    async claimExecution({ actor, reservationId, visualAuthority }) {
      if (!uuid.test(reservationId ?? '')) throw new Error('invalid execution');
      if(visualAuthority&&(!uuid.test(visualAuthority.requestId??'')||!/^[a-f0-9]{64}$/.test(visualAuthority.manifestDigest)||(visualAuthority.consentSecret!==null&&!/^[a-f0-9]{64}$/.test(visualAuthority.consentSecret))))throw new Error('invalid visual authority');
      const rows = await rpc(visualAuthority?'claim_image_tool_execution_authorized':'claim_image_tool_execution', actor, { p_reservation_id: reservationId,...(visualAuthority?{p_authority_request_id:visualAuthority.requestId,p_manifest_digest:visualAuthority.manifestDigest,p_consent_secret:visualAuthority.consentSecret}:{}) });
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (['busy','blocked'].includes(row?.state) && row.execution_id === null && row.asset_id === null && row.is_new === false) return {state:row.state};
      if (!uuid.test(row?.execution_id ?? '') || !uuid.test(row?.asset_id ?? '') || !['running', 'unknown', 'completed'].includes(row?.state) || typeof row?.is_new !== 'boolean' || (row.is_new && row.state !== 'running')) throw new Error('reservation status unknown');
      return { id: row.execution_id, assetId: row.asset_id, state: row.state, isNew: row.is_new };
    },
    async markExecutionUnknown({ actor, executionId }) {
      if (!uuid.test(executionId ?? '')) throw new Error('invalid execution');
      const result = await rpc('mark_image_tool_execution_unknown', actor, { p_execution_id: executionId });
      if (result !== true) throw new Error('reservation status unknown');
    },
    async completeExecution({ actor, executionId }) {
      if (!uuid.test(executionId ?? '')) throw new Error('invalid execution');
      const result = await rpc('complete_image_tool_execution', actor, { p_execution_id: executionId });
      if (result !== true) throw new Error('reservation status unknown');
    },
    async claimResultSubmission(input) {
      if (!validCall(input) || !uuid.test(input.executionId ?? '') || !uuid.test(input.pieceId ?? '') || !uuid.test(input.attemptId ?? '') || !Number.isInteger(input.version) || input.version < 1 || input.version > 2147483647) throw new Error('invalid submission');
      const rows = await rpc('claim_image_tool_result_submission', input.actor, {p_execution_id:input.executionId,p_project_id:input.projectId,p_piece_id:input.pieceId,p_piece_version:input.version,p_attempt_id:input.attemptId,p_session_id:input.sessionId,p_turn_id:input.turnId,p_call_id:input.callId});
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!uuid.test(row?.submission_id ?? '') || !uuid.test(row?.asset_id ?? '') || !['sending','unknown','sent'].includes(row?.state) || typeof row?.is_new !== 'boolean' || (row.is_new && row.state !== 'sending')) throw new Error('submission status unknown');
      return {id:row.submission_id,assetId:row.asset_id,state:row.state,isNew:row.is_new};
    },
    async finishResultSubmission({actor,submissionId,state}) {
      if (!uuid.test(submissionId ?? '') || !['sent','unknown'].includes(state)) throw new Error('invalid submission');
      if (await rpc('finish_image_tool_result_submission', actor, {p_submission_id:submissionId,p_state:state}) !== true) throw new Error('submission status unknown');
    },
  };
}
