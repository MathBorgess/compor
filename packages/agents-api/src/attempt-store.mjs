const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPublicKey(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon';
  } catch { return false; }
}

export function createSupabaseAttemptStore({ url, anonKey, fetch: fetchApi = globalThis.fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/' || !isPublicKey(anonKey)) throw new Error('invalid configuration');
  async function rpc(name, actor, body) {
    if (!uuid.test(actor?.userId ?? '') || typeof actor.token !== 'string' || !actor.token) throw new Error('invalid identity');
    const response = await fetchApi(new URL(`/rest/v1/rpc/${name}`, base), {
      method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('attempt store unavailable');
    return response.json();
  }
  return {
    async start({ actor, projectId, idempotencyKey }) {
      if (!uuid.test(projectId ?? '') || !uuid.test(idempotencyKey ?? '')) throw new Error('invalid attempt');
      const rows = await rpc('reserve_agent_attempt', actor, { p_project_id: projectId, p_idempotency_key: idempotencyKey });
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!uuid.test(row?.attempt_id ?? '') || !['started', 'completed', 'unknown'].includes(row?.state) || typeof row?.is_new !== 'boolean' || (row.is_new && row.state !== 'started')) throw new Error('invalid attempt response');
      return { id: row.attempt_id, state: row.state, isNew: row.is_new };
    },
    async finish({ actor, projectId, attemptId, state }) {
      if (!uuid.test(projectId ?? '') || !uuid.test(attemptId ?? '') || !['completed', 'unknown'].includes(state)) throw new Error('invalid attempt');
      const result = await rpc('finish_agent_attempt', actor, { p_project_id: projectId, p_attempt_id: attemptId, p_state: state });
      if (result !== true) throw new Error('invalid attempt response');
    },
  };
}
