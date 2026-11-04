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
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Cleanup is best-effort. */ }
    try { reader.releaseLock(); } catch { /* No pending reads should remain. */ }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

async function readAgentEvents(stream, stopForAction) {
  if (!stream) throw new Error('missing stream');
  const reader = stream.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', size = 0, sessionId = null, completed = false;
  const parts = new Map();
  function processBlock(block) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return false;
    const event = JSON.parse(data);
    if (event.type === 'agent.session.created') {
      if (sessionId || typeof event.session?.id !== 'string' || !/^sess_[A-Za-z0-9_-]{1,128}$/.test(event.session.id)) throw new Error('invalid session');
      sessionId = event.session.id;
    }
    if (event.type === 'agent.session.requires_action' && stopForAction) {
      if (!sessionId || event.session?.id !== sessionId) throw new Error('invalid action event');
      return true;
    }
    const part = JSON.stringify([event.item_id ?? '', event.output_index ?? 0, event.content_index ?? 0]);
    if (event.type === 'agent.session.turn.output_text.delta' && typeof event.delta === 'string') parts.set(part, (parts.get(part) ?? '') + event.delta);
    if (event.type === 'agent.session.turn.output_text.done' && typeof event.text === 'string') parts.set(part, event.text);
    const mainTurn = !event.turn || event.turn.subagent_id == null;
    if (event.type === 'agent.session.turn.completed' && mainTurn) completed = true;
    if (((event.type === 'agent.session.turn.failed' || event.type === 'agent.session.turn.cancelled') && mainTurn) || event.type === 'agent.session.failed') completed = false;
    return false;
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { buffer += decoder.decode(); break; }
      size += value.byteLength; if (size > MAX_STREAM) throw new Error('stream too large');
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (processBlock(block)) return { action: true, sessionId };
      }
    }
    if (buffer.trim() && processBlock(buffer)) return { action: true, sessionId };
    return { action: false, sessionId, completed, output: [...parts.values()].join('') };
  } finally {
    // Some transports never settle cancel(); initiate it without blocking the action.
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Cleanup is best-effort. */ }
    try { reader.releaseLock(); } catch { /* No pending reads should remain. */ }
  }
}

export function createAgentHandler({ authenticate, fetch: fetchApi = globalThis.fetch, enableImageTool = false, mcpTool } = {}) {
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
      const agentAbort = new AbortController();
      const response = await fetchApi(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'agents=v1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: { model: 'gpt-6-astra', instructions: enableImageTool ? 'Ajude a pessoa com seu objetivo criativo. Quando ela solicitar a geração de uma imagem, use a função generate_image com uma descrição apropriada; a geração depende de confirmação explícita. Não afirme ter gerado uma imagem antes do resultado da função.' : 'Ajude a pessoa a explorar uma direção criativa para seu objetivo.', ...((enableImageTool || mcpTool) ? { tools: [...(enableImageTool ? [{ type: 'function', name: 'generate_image', description: 'Solicita uma imagem, sujeita a consentimento explícito.', parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'], additionalProperties: false } }] : []), ...(mcpTool ? [mcpTool] : [])] } : {}) }, environment: { type: 'none' }, input: body.objective, stream: true }),
        signal: AbortSignal.any([AbortSignal.timeout(90_000), agentAbort.signal]),
        redirect: 'error',
      });
      if (response.status === 401 || response.status === 403) { agentAbort.abort(); return json({ error: 'openai_credentials_rejected' }, response.status); }
      if (response.status === 429) { agentAbort.abort(); return json({ error: 'openai_quota_or_rate_limit' }, 429); }
      if (!response.ok) { agentAbort.abort(); return json({ error: 'upstream_error' }, 502); }
      let observed;
      try { observed = await readAgentEvents(response.body, enableImageTool); }
      finally { agentAbort.abort(); }
      if (enableImageTool && observed.sessionId) {
        const lookup = await fetchApi(`${endpoint}/${encodeURIComponent(observed.sessionId)}`, { method: 'GET', headers: { Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'agents=v1' }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
        if (!lookup.ok) throw new Error('session unavailable');
        const session = JSON.parse(await limitedText(lookup.body, 256 * 1024));
        if (session?.id !== observed.sessionId || !Array.isArray(session.required_actions)) throw new Error('invalid session');
        if (session.status === 'idle' && session.required_actions.length === 0 && !observed.action) {
          if (!observed.completed || !observed.output) return json({ error: 'incomplete_turn' }, 502);
          const delegated = mcpTool?.transport?.authorization?.replace(/^Bearer /i, '');
          const text = observed.output.replaceAll(key, '[redacted]');
          return json({ sessionId: observed.sessionId, text: delegated ? text.replaceAll(delegated, '[redacted]') : text, usage: null }, 200);
        }
        if (session.status !== 'requires_action' || session.required_actions.length !== 1) throw new Error('invalid pending action');
        const action = session.required_actions[0];
        let args = action?.arguments;
        if (typeof args === 'string') { if (args.length > 8192) throw new Error('invalid arguments'); args = JSON.parse(args); }
        const delegated = mcpTool?.transport?.authorization?.replace(/^Bearer /i, '');
        if (action?.type !== 'function_call' || action.name !== 'generate_image' || !/^turn_[A-Za-z0-9_-]{1,128}$/.test(action.turn_id ?? '') || !/^call_[A-Za-z0-9_-]{1,128}$/.test(action.call_id ?? '') || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 || typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 4000 || args.prompt.includes(key) || (delegated && args.prompt.includes(delegated)) || /sk-[^\s]+/i.test(args.prompt)) throw new Error('invalid pending action');
        return json({ status: 'consent_required', sessionId: observed.sessionId, turnId: action.turn_id, callId: action.call_id, prompt: args.prompt }, 202);
      }
      if (!observed.completed || !observed.sessionId || !observed.output) return json({ error: 'incomplete_turn' }, 502);
      const delegated = mcpTool?.transport?.authorization?.replace(/^Bearer /i, '');
      const text = observed.output.replaceAll(key, '[redacted]');
      return json({ sessionId: observed.sessionId, text: delegated ? text.replaceAll(delegated, '[redacted]') : text, usage: null }, 200);
    } catch {
      return json({ error: 'upstream_error' }, 502);
    }
  };
}
