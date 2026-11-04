/** Server-only. Never return or log this value through an HTTP response. */
export function agentSigningKey(env=process.env) {
 try {
  if(env.COMPOR_AGENT_ENABLED!=='true' || typeof env.COMPOR_AGENT_HMAC_SECRET!=='string' || !/^[A-Za-z0-9_-]{43,172}$/.test(env.COMPOR_AGENT_HMAC_SECRET))return null;
  const key=Buffer.from(env.COMPOR_AGENT_HMAC_SECRET,'base64url');
  if(key.length<32 || key.toString('base64url')!==env.COMPOR_AGENT_HMAC_SECRET)return null;
  return key;
 } catch {return null;}
}
