import { Buffer } from 'node:buffer';

type VaultConfig = { service: string };
type Environment = Record<string, string | undefined>;

const validOpenAiKey = (value: unknown): value is string =>
  typeof value === 'string' && /^sk-[^\s]{20,300}$/.test(value);

function serverKey(env: Environment): string | null {
  const value = env.SUPABASE_SERVER_KEY;
  if (typeof value !== 'string' || value.length > 8192 || /\s/.test(value)) return null;
  if (/^sb_secret_[A-Za-z0-9_-]{20,300}$/.test(value)) return value;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const claim: unknown = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'));
    return claim && typeof claim === 'object' && !Array.isArray(claim) &&
      'role' in claim && claim.role === 'service_role' ? value : null;
  } catch { return null; }
}

function endpointFor(config: VaultConfig): URL | null {
  try {
    const service = new URL(config.service);
    if (service.protocol !== 'https:' || service.username || service.password || service.href !== `${service.origin}/`) return null;
    return new URL('/rest/v1/rpc/compor_default_openai_key', service.origin);
  } catch { return null; }
}

/** Configuration only; availability still requires a successful Vault lookup. */
export function defaultOpenAiConfigured(config: VaultConfig, env: Environment = process.env): boolean {
  return env.COMPOR_DEFAULT_OPENAI_ENABLED === 'true' && !!serverKey(env) && !!endpointFor(config);
}

async function boundedValue(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) return null;
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * Server-only credential lookup. Call after verifying the user's identity and
 * operation scope. The administrative key is confined to this fixed RPC;
 * application data operations must retain the verified user's token and RLS.
 * Never serialize either credential or provider errors to an HTTP response.
 */
export async function resolveDefaultOpenAiKey(
  config: VaultConfig,
  env: Environment = process.env,
  fetchApi: typeof fetch = fetch,
): Promise<string | null> {
  if (env.COMPOR_DEFAULT_OPENAI_ENABLED !== 'true') return null;
  const key = serverKey(env), endpoint = endpointFor(config);
  if (!key || !endpoint) return null;
  try {
    const response = await fetchApi(endpoint, {
      method: 'POST',
      // Modern sb_secret keys are opaque gateway credentials, not JWTs.
      headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
      body: '{}',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return null;
    const value = await boundedValue(response);
    return validOpenAiKey(value) ? value : null;
  } catch { return null; }
}
