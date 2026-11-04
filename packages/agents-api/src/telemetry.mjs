// Only fixed, non-content categories may leave this boundary.
const names = new Set(['configuration_unavailable','mcp_configuration_unavailable','origin_denied','request_invalid','actor_unavailable','actor_unauthorized','ownership_unavailable','ownership_denied','attempt_reserved','attempt_existing','attempt_reservation_failed','usage_reserved','usage_reservation_failed','mcp_scope_failed','provider_create_dispatched','provider_create_failed','provider_lookup_dispatched','provider_lookup_failed','stream_action','stream_completed','stream_incomplete']);
for (const stage of ['provider_create_http','provider_lookup_http']) {
  for (const status of ['200','201','400','401','403','404','409','413','422','429','500','502','503','504','other']) names.add(`${stage}_${status}`);
}
export function recordAgentEvent(name) {
  if (!names.has(name)) return;
  try { console.info(`COMPOR_AGENT_EVENT ${name}`); } catch { /* Logging must not change execution. */ }
}
export function recordProviderStatus(stage,status) {
  const allowed = [200,201,400,401,403,404,409,413,422,429,500,502,503,504];
  recordAgentEvent(`${stage}_${allowed.includes(status) ? status : 'other'}`);
}
