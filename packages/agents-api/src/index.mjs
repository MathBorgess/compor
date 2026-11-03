const MAX_REQUEST = 16 * 1024;
const MAX_STREAM = 1024 * 1024;
const endpoint = 'https://api.openai.com/v1/agents/sessions';

function json(data, status) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function limitedText(stream, limit) {
  if (!stream) throw new Error('missing body');
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('body too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export function createAgentHandler({ authenticate, fetch: fetchApi = globalThis.fetch } = {}) {
  if (typeof authenticate !== 'function') throw new TypeError('authenticate is required');
  return async function handle(request) {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      const identity = await authenticate(request);
      if (!identity?.userId) return json({ error: 'unauthorized' }, 401);
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }
    let body;
    try { body = JSON.parse(await limitedText(request.body, MAX_REQUEST)); }
    catch { return json({ error: 'invalid_request' }, 400); }
    if (!body || typeof body.apiKey !== 'string' || !/^sk-[^\s]{20,300}$/.test(body.apiKey) ||
        typeof body.objective !== 'string' || !body.objective.trim() || body.objective.length > 4000 || body.objective.includes(body.apiKey)) {
      return json({ error: 'invalid_request' }, 400);
    }
    const key = body.apiKey;
    try {
      const response = await fetchApi(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: { model: 'gpt-6-astra', instructions: 'Ajude a pessoa a explorar uma direção criativa para seu objetivo.' }, environment: { type: 'none' }, input: body.objective, stream: true }),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.status === 401 || response.status === 403) return json({ error: 'openai_credentials_rejected' }, response.status);
      if (response.status === 429) return json({ error: 'openai_quota_or_rate_limit' }, 429);
      if (!response.ok) return json({ error: 'upstream_error' }, 502);
      const raw = await limitedText(response.body, MAX_STREAM);
      let sessionId = null;
      const parts = new Map();
      let completed = false;
      for (const block of raw.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.type === 'agent.session.created') sessionId = event.session?.id ?? null;
        const part = JSON.stringify([event.item_id ?? '', event.output_index ?? 0, event.content_index ?? 0]);
        if (event.type === 'agent.session.turn.output_text.delta' && typeof event.delta === 'string') parts.set(part, (parts.get(part) ?? '') + event.delta);
        if (event.type === 'agent.session.turn.output_text.done' && typeof event.text === 'string') parts.set(part, event.text);
        if (event.type === 'agent.session.turn.completed') completed = true;
        if (event.type === 'agent.session.turn.failed' || event.type === 'agent.session.turn.cancelled' || event.type === 'agent.session.failed') completed = false;
      }
      const output = [...parts.values()].join('');
      if (!completed || typeof sessionId !== 'string' || !/^sess_[a-zA-Z0-9_-]+$/.test(sessionId) || !output) return json({ error: 'incomplete_turn' }, 502);
      return json({ sessionId, text: output.replaceAll(key, '[redacted]'), usage: null }, 200);
    } catch {
      return json({ error: 'upstream_error' }, 502);
    }
  };
}
