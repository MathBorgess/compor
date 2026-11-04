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
    return uuid.test(input?.projectId ?? '') && id(input?.sessionId, 'sess') && id(input?.turnId, 'turn') && id(input?.callId, 'call');
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
  };
}
