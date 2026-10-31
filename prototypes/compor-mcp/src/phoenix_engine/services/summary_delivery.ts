import { randomUUID } from 'node:crypto';
import { ProfileLedger } from './profile_ledger.js';

export type ProfileSummary = ReturnType<ProfileLedger['maintainerSummary']>;
/** A host supplies this port; nothing is sent when no port is configured. */
export interface SummaryDeliveryPort {
  send(summary: ProfileSummary): Promise<{ acknowledged: true; receipt?: string }>;
}
export type SummaryAttempt = {
  id: string;
  recipient: string;
  purpose: string;
  prepared_at: string;
  status: 'acknowledged' | 'unknown';
  receipt?: string;
};

/** Host-provided policy must verify the actual payload, including all free-text fields. */
export type SummaryMinimizationVerifier = (summary: ProfileSummary) => boolean;

export class SummaryDelivery {
  private readonly attempts: SummaryAttempt[] = [];
  constructor(
    private readonly ledger: ProfileLedger,
    private readonly port?: SummaryDeliveryPort,
    private readonly verifyMinimized?: SummaryMinimizationVerifier,
  ) {}

  async send(actor: string, recipient: string, purpose: string): Promise<SummaryAttempt> {
    if (!this.port) throw new Error('No summary delivery port configured');
    if (!this.verifyMinimized) throw new Error('Host minimization verification required');
    const summary = this.ledger.maintainerSummary(actor, recipient, purpose);
    // This is an explicit host decision, not an assumption based on string length.
    if (this.verifyMinimized(structuredClone(summary)) !== true) throw new Error('Host minimization verification failed');
    // The verifier may have changed consent. Recheck synchronously immediately before sending.
    this.ledger.assertMaintainerConsent(actor, recipient, purpose);
    const attempt: SummaryAttempt = { id: randomUUID(), recipient, purpose, prepared_at: summary.generated_at, status: 'unknown' };
    this.attempts.push(attempt);
    try {
      const result = await this.port.send(summary);
      if (result?.acknowledged === true) {
        attempt.status = 'acknowledged';
        if (typeof result.receipt === 'string') attempt.receipt = result.receipt.slice(0, 200);
      }
    } catch {
      // A timeout or transport failure cannot establish whether the destination received it.
    }
    return structuredClone(attempt);
  }

  listAttempts(actor: string): SummaryAttempt[] {
    this.ledger.read(actor); // The host-bound identity must own the profile.
    return structuredClone(this.attempts);
  }
}

/**
 * Optional host-only PostgREST adapter. The host must provision a compatible table
 * with recipient, purpose and summary columns and appropriate database policies.
 * It does not create a table or establish production authorization.
 */
export function createSupabaseRestSummaryPort(options: {
  endpoint: string;
  apiKey: string;
  fetchFn?: typeof globalThis.fetch;
}): SummaryDeliveryPort {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || !endpoint.pathname.startsWith('/rest/v1/')) {
    throw new Error('Invalid Supabase REST endpoint');
  }
  if (!options.apiKey.trim()) throw new Error('Missing Supabase key');
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  return {
    async send(summary) {
      const response = await fetchFn(endpoint.toString(), {
        method: 'POST',
        headers: { apikey: options.apiKey, Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ recipient: summary.recipient, purpose: summary.purpose, summary }),
      });
      if (!response.ok) throw new Error('Destination did not acknowledge summary');
      return { acknowledged: true };
    },
  };
}
