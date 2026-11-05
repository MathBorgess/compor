import {isAgentCallId} from './agent-call-id.mjs';
// Protocol-only experimental boundary. It is not wired to an HTTP route, provider,
// durable store, or tool registration; these helpers cannot authorize or execute work.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const identifier = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value);

/** Inspect only a server-obtained requires_action. Caller must independently verify binding and approval. */
export function describePendingImageCall({ event, binding, explicitApproval } = {}) {
  if (explicitApproval !== true || !binding || !['userId', 'projectId', 'pieceId', 'attemptId'].every(key => uuid(binding[key])) ||
      !Number.isSafeInteger(binding.version) || binding.version < 1 || binding.version > 2147483647 || !identifier(binding.sessionId, 'sess')) return null;
  if (event?.type !== 'agent.session.requires_action' || event.session?.id !== binding.sessionId || !Array.isArray(event.session.required_actions) || event.session.required_actions.length > 20) return null;
  const matches = event.session.required_actions.filter(action => action?.type === 'function_call' && action.name === 'generate_image');
  if (matches.length !== 1) return null;
  const action = matches[0];
  const args = action.arguments;
  if (!identifier(action.turn_id, 'turn') || !isAgentCallId(action.call_id) || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 ||
      typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 4000 || /sk-[^\s]+/i.test(args.prompt)) return null;
  return { sessionId: binding.sessionId, turnId: action.turn_id, callId: action.call_id, prompt: args.prompt, binding: { userId: binding.userId, projectId: binding.projectId, pieceId: binding.pieceId, version: binding.version, attemptId: binding.attemptId, sessionId: binding.sessionId } };
}

/** Construct a non-secret protocol result; this function does not submit an event. */
export function imageResultUnknown(call) {
  if (!identifier(call?.turnId, 'turn') || !isAgentCallId(call?.callId)) throw new TypeError('invalid call');
  return { type: 'agent.session.input.tool_result', turn_id: call.turnId, call_id: call.callId, success: false, error: 'Resultado desconhecido. Não repita automaticamente; confirme o estado da tentativa.' };
}

/** Deliberately non-operational until durable authorization, idempotency, storage, and recovery exist. */
export function createDisabledImageToolHandler() {
  return async () => Response.json({ error: 'image_tool_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
