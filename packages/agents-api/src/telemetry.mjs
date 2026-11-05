// Only fixed, non-content categories may leave this boundary.
const names = new Set(['configuration_unavailable','mcp_configuration_unavailable','origin_denied','request_invalid','actor_unavailable','actor_unauthorized','ownership_unavailable','ownership_denied','attempt_reserved','attempt_existing','attempt_reservation_failed','usage_reserved','usage_reservation_failed','mcp_scope_failed','provider_create_dispatched','provider_create_failed','provider_lookup_dispatched','provider_lookup_failed','stream_action','stream_completed','stream_incomplete']);
for (const stage of ['provider_create_http','provider_lookup_http']) {
  for (const status of ['200','201','400','401','403','404','409','413','422','429','500','502','503','504','other']) names.add(`${stage}_${status}`);
}
const codes = new Set(['unknown_parameter','invalid_value','invalid_type','unsupported_value','missing_required_parameter','invalid_request_error','context_length_exceeded','insufficient_quota','rate_limit_exceeded']);
const types = new Set(['invalid_request_error','authentication_error','permission_error','rate_limit_error']);
const parameters = new Map([
  ['spend_control','spend_control'], ['spend_control.limit','spend_control_limit'],
  ['agent','agent'], ['agent.model','agent_model'], ['agent.tools','agent_tools'],
  ['agent.tools[0]','agent_tool_0'], ['agent.tools[1]','agent_tool_1'],
  ['agent.tools[0].parameters','agent_tool_parameters'],
  ['agent.tools[1].transport','agent_tool_transport'],
  ['agent.tools[1].transport.authorization','agent_tool_authorization'],
  ['agent.tools[1].transport.server_url','agent_tool_server_url'],
  ['environment','environment'], ['input','input'], ['stream','stream'],
]);
for (const code of [...codes,'other']) names.add(`provider_error_code_${code}`);
for (const type of [...types,'other']) names.add(`provider_error_type_${type}`);
for (const parameter of [...parameters.values(),'other']) names.add(`provider_error_param_${parameter}`);
export function recordAgentEvent(name) {
  if (!names.has(name)) return;
  try { console.info(`COMPOR_AGENT_EVENT ${name}`); } catch { /* Logging must not change execution. */ }
}
export function recordProviderStatus(stage,status) {
  const allowed = [200,201,400,401,403,404,409,413,422,429,500,502,503,504];
  recordAgentEvent(`${stage}_${allowed.includes(status) ? status : 'other'}`);
}

// Discard provider text; only fixed categories may leave this boundary.
export async function recordProviderClientError(response) {
  let parsed = null, reader, timer;
  try {
    if (!response?.body) throw Error();
    reader = response.body.getReader();
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 750); });
    const chunks = []; let total = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), timeout]);
      if (!part) throw Error();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 4096) throw Error();
      chunks.push(part.value);
    }
    const data = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Buffer.concat(chunks)));
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error && typeof data.error === 'object' && !Array.isArray(data.error)) parsed = data.error;
  } catch { /* Unknown provider bodies are never logged. */ }
  finally {
    if (timer) clearTimeout(timer);
    try { if (reader) Promise.resolve(reader.cancel()).catch(()=>{}); } catch {}
    try { reader?.releaseLock(); } catch {}
  }
  recordAgentEvent(`provider_error_code_${codes.has(parsed?.code) ? parsed.code : 'other'}`);
  recordAgentEvent(`provider_error_type_${types.has(parsed?.type) ? parsed.type : 'other'}`);
  recordAgentEvent(`provider_error_param_${parameters.get(parsed?.param) ?? 'other'}`);
}
