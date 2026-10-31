import { randomUUID, createHash } from 'node:crypto';
import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

/** In-memory prototype. The caller must bind actor to an authenticated session. */
export type ProfilePurpose = 'personalization' | 'evaluation' | 'maintainer_summary' | 'full_content';
export type SignalKind = 'edit' | 'choice' | 'rejection' | 'reaction' | 'export' | 'comment';
export type ProfileScope = { type: 'session' | 'task' | 'campaign' | 'user'; id: string };
export type Signal = {
  id: string;
  kind: SignalKind;
  version_id: string;
  /** Present only when a host-bound local piece was verified at registration. */
  piece_id?: string;
  scope: ProfileScope;
  source: string;
  person_statement?: string;
  agent_interpretation?: string;
  preference?: { key: string; value: string; confidence: 'ambiguous' | 'confirmed' };
};
export type Preference = { key: string; value: string; confidence: 'ambiguous' | 'confirmed'; source_event_id: string; scope: ProfileScope; version_id: string };
export type ProfileChange = { id: string; event_id: string; previous: Preference | null; current: Preference | null; timestamp: string; correction?: string; undo_of?: string };
export type Consent = { purpose: ProfilePurpose; granted: boolean; timestamp: string };
export type ReferenceDecisionInput = {
  id: string;
  version_id: string;
  campaign_id: string;
  origin_url: string;
  source_id?: string | null;
  action: 'select' | 'reject' | 'reconsider';
  selected_attributes?: Array<'typography' | 'composition' | 'color' | 'photography'>;
  person_statement?: string;
};
export type ReferenceDecision = ReferenceDecisionInput & { source_id: string | null; timestamp: string };
type MaintainerConsent = { recipient: string; purpose: string; granted: boolean; timestamp: string };
type Access = { collaborator: string; purpose: string; active: boolean; timestamp: string };
type Audit = { action: 'share' | 'revoke_share' | 'read' | 'summary_prepared'; actor: string; timestamp: string; purpose: string };
type StoredEvent = Signal & { timestamp: string };

const persistedScope = z.strictObject({ type: z.enum(['session', 'task', 'campaign', 'user']), id: z.string().min(1).max(2000) });
const persistedPreference = z.strictObject({ key: z.string().min(1).max(2000), value: z.string().min(1).max(2000), confidence: z.enum(['ambiguous', 'confirmed']), source_event_id: z.string().min(1).max(2000), scope: persistedScope, version_id: z.string().min(1).max(2000) });
const persistedChange = z.strictObject({ id: z.string().min(1).max(2000), event_id: z.string().min(1).max(2000), previous: persistedPreference.nullable(), current: persistedPreference.nullable(), timestamp: z.string(), correction: z.string().max(2000).optional(), undo_of: z.string().max(2000).optional() });
const persistedEvent = z.strictObject({ id: z.string().min(1).max(2000), kind: z.enum(['edit', 'choice', 'rejection', 'reaction', 'export', 'comment']), version_id: z.string().min(1).max(2000), piece_id:z.string().regex(/^piece_[0-9a-f]{32}$/u).optional(), scope: persistedScope, source: z.string().min(1).max(2000), person_statement: z.string().max(2000).optional(), agent_interpretation: z.string().max(2000).optional(), preference: z.strictObject({ key: z.string().min(1).max(2000), value: z.string().min(1).max(2000), confidence: z.enum(['ambiguous', 'confirmed']) }).optional(), timestamp: z.string() }).refine(event => event.piece_id === undefined || /^v_[0-9a-f]{32}$/u.test(event.version_id), 'Invalid local version');
const persistedReferenceDecision = z.strictObject({ id:z.string().min(1).max(200), version_id:z.string().min(1).max(200), campaign_id:z.string().min(1).max(200), origin_url:z.string().min(1).max(2000), source_id:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).nullable().default(null), action:z.enum(['select','reject','reconsider']), selected_attributes:z.array(z.enum(['typography','composition','color','photography'])).min(1).max(4).optional(), person_statement:z.string().min(1).max(2000).optional(), timestamp:z.string() });
const persistedSnapshot = z.strictObject({
  format: z.literal('compor-phoenix-profile-v1'), owner: z.string().min(1).max(2000), revision: z.number().int().positive(),
  preferences: z.array(z.tuple([z.string(), persistedPreference])), events: z.array(persistedEvent), changes: z.array(persistedChange),
  consents: z.array(z.strictObject({ purpose: z.enum(['personalization', 'evaluation', 'maintainer_summary', 'full_content']), granted: z.boolean(), timestamp: z.string() })),
  maintainer_consents: z.array(z.strictObject({ recipient: z.string(), purpose: z.string(), granted: z.boolean(), timestamp: z.string() })),
  shares: z.array(z.strictObject({ collaborator: z.string(), purpose: z.string(), active: z.boolean(), timestamp: z.string() })),
  audit: z.array(z.strictObject({ action: z.enum(['share', 'revoke_share', 'read', 'summary_prepared']), actor: z.string(), timestamp: z.string(), purpose: z.string() })),
  prepared_summaries: z.array(z.unknown()),
  reference_decisions: z.array(persistedReferenceDecision).default([]),
});

async function privateDirectory(directory: string): Promise<string> {
  const dir = resolve(required(directory, 'directory'));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Profile directory must be private');
  return dir;
}
function snapshotPath(dir: string, owner: string): string {
  return join(dir, `phoenix-profile-${createHash('sha256').update(owner).digest('hex').slice(0, 24)}.json`);
}
async function readSnapshot(path: string): Promise<z.infer<typeof persistedSnapshot> | null> {
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > 5_000_000) throw new Error('Invalid profile snapshot permissions or size');
    return persistedSnapshot.parse(JSON.parse(await handle.readFile('utf8')));
  } finally { await handle.close(); }
}

const copy = <T>(value: T): T => structuredClone(value);
const required = (v: string, name: string): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > 2000) throw new Error(`Invalid ${name}`);
  return v.trim();
};
const scopeKey = (scope: ProfileScope, key: string): string => JSON.stringify([scope.type, scope.id, key]);

/** Canonical origin is a comparison key, never an authorization or a fetch target. */
export function canonicalReferenceOrigin(value: string): string {
  const raw = required(value, 'reference origin');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid reference origin'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid reference origin');
  const hostname = url.hostname.toLowerCase();
  const pin = /^(?:\/pin\/)([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  if (!url.port && (hostname === 'pinterest.com' || hostname.endsWith('.pinterest.com')) && pin) return `https://www.pinterest.com/pin/${pin[1]}/`;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(?:fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

export class ProfileLedger {
  private readonly owner: string;
  private readonly now: () => string;
  private readonly preferences = new Map<string, Preference>();
  private readonly events = new Map<string, StoredEvent>();
  private readonly referenceDecisions = new Map<string, ReferenceDecision>();
  private readonly changes: ProfileChange[] = [];
  private readonly consents: Consent[] = [];
  private readonly shares: Access[] = [];
  private readonly maintainerConsents: MaintainerConsent[] = [];
  private readonly audit: Audit[] = [];
  private readonly sentSummaries: unknown[] = [];
  private persistenceRevision = 0;
  private persistencePath: string | null = null;
  private persistenceQueue: Promise<unknown> = Promise.resolve();

  private enqueuePersistence<T>(task: () => Promise<T>): Promise<T> {
    const run = this.persistenceQueue.then(task, task);
    this.persistenceQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  constructor(owner: string, now: () => string = () => new Date().toISOString()) {
    this.owner = required(owner, 'owner');
    this.now = now;
  }
  private ownerOnly(actor: string): void {
    if (actor !== this.owner) throw new Error('Access denied');
  }
  private isGranted(purpose: ProfilePurpose): boolean {
    return [...this.consents].reverse().find((c) => c.purpose === purpose)?.granted === true;
  }
  isPersonalizationActive(actor: string): boolean {
    this.ownerOnly(actor);
    return this.isGranted('personalization');
  }
  setConsent(actor: string, purpose: ProfilePurpose, granted: boolean): Consent {
    this.ownerOnly(actor);
    if (!['personalization', 'evaluation', 'maintainer_summary', 'full_content'].includes(purpose) || typeof granted !== 'boolean') throw new Error('Invalid consent');
    const consent = { purpose, granted, timestamp: this.now() };
    this.consents.push(consent);
    return copy(consent);
  }
  record(actor: string, signal: Signal, options?: { localVersionVerified: true }): { event: StoredEvent; change: ProfileChange | null; duplicate: boolean } {
    this.ownerOnly(actor);
    if (!this.isGranted('personalization')) throw new Error('Personalization consent required');
    required(signal.id, 'event id');
    required(signal.version_id, 'version');
    if (signal.piece_id !== undefined && (!/^piece_[0-9a-f]{32}$/u.test(signal.piece_id) || !/^v_[0-9a-f]{32}$/u.test(signal.version_id) || options?.localVersionVerified !== true)) throw new Error('Verified local piece and version required');
    required(signal.source, 'source');
    if (!['edit', 'choice', 'rejection', 'reaction', 'export', 'comment'].includes(signal.kind)) throw new Error('Invalid signal kind');
    if (!signal.scope || !['session', 'task', 'campaign', 'user'].includes(signal.scope.type)) throw new Error('Invalid scope');
    required(signal.scope.id, 'scope id');
    if (signal.person_statement !== undefined) required(signal.person_statement, 'statement');
    if (signal.agent_interpretation !== undefined) required(signal.agent_interpretation, 'interpretation');
    if (signal.preference) {
      required(signal.preference.key, 'preference key');
      required(signal.preference.value, 'preference value');
      if (!['ambiguous', 'confirmed'].includes(signal.preference.confidence)) throw new Error('Invalid confidence');
    }
    if (this.referenceDecisions.has(signal.id)) throw new Error('Conflicting duplicate event');
    const previousEvent = this.events.get(signal.id);
    if (previousEvent) {
      const { timestamp: _timestamp, ...existing } = previousEvent;
      if (!isDeepStrictEqual(existing, signal)) throw new Error('Conflicting duplicate event');
      return { event: copy(previousEvent), change: copy(this.changes.find((c) => c.event_id === signal.id && !c.undo_of) ?? null), duplicate: true };
    }
    const event = { ...copy(signal), timestamp: this.now() };
    this.events.set(signal.id, event);
    let change: ProfileChange | null = null;
    if (signal.preference) {
      const key = scopeKey(signal.scope, signal.preference.key);
      const previous = this.preferences.get(key) ?? null;
      const current: Preference = { ...copy(signal.preference), source_event_id: signal.id, scope: copy(signal.scope), version_id: signal.version_id };
      change = { id: randomUUID(), event_id: signal.id, previous: copy(previous), current: copy(current), timestamp: this.now() };
      this.preferences.set(key, current);
      this.changes.push(change);
    }
    return { event: copy(event), change: copy(change), duplicate: false };
  }
  recordReferenceDecision(actor: string, input: ReferenceDecisionInput): { event: ReferenceDecision; previous: ReferenceDecision | null; duplicate: boolean } {
    this.ownerOnly(actor);
    if (!this.isGranted('personalization')) throw new Error('Personalization consent required');
    const rawId = required(input.id, 'event id');
    const version = required(input.version_id, 'version');
    const campaign = required(input.campaign_id, 'campaign');
    if (rawId.length > 200 || version.length > 200 || campaign.length > 200 || !['select','reject','reconsider'].includes(input.action)) throw new Error('Invalid reference decision');
    const allowed = ['typography','composition','color','photography'];
    if (input.selected_attributes !== undefined && (!Array.isArray(input.selected_attributes) || input.selected_attributes.length < 1 || input.selected_attributes.length > 4 || input.selected_attributes.some(a=>!allowed.includes(a)) || new Set(input.selected_attributes).size !== input.selected_attributes.length)) throw new Error('Invalid reference attributes');
    if ((input.action === 'select') !== (input.selected_attributes !== undefined)) throw new Error('Only a selection requires selected attributes');
    const statement = input.person_statement === undefined ? undefined : required(input.person_statement, 'statement');
    const source = input.source_id == null ? null : required(input.source_id, 'source id');
    if (source !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(source)) throw new Error('Invalid source id');
    const normalized: ReferenceDecisionInput & {source_id:string|null} = { id:rawId, version_id:version, campaign_id:campaign, origin_url:canonicalReferenceOrigin(input.origin_url), source_id:source, action:input.action, ...(input.selected_attributes ? { selected_attributes:[...input.selected_attributes].sort() } : {}), ...(statement === undefined ? {} : {person_statement:statement}) };
    if (this.events.has(rawId)) throw new Error('Conflicting duplicate event');
    const existing = this.referenceDecisions.get(rawId);
    if (existing) {
      const { timestamp: _timestamp, ...original } = existing;
      if (!isDeepStrictEqual(original, normalized)) throw new Error('Conflicting duplicate event');
      const entries = [...this.referenceDecisions.values()];
      const position = entries.findIndex(entry=>entry.id===rawId);
      const previous = entries.slice(0,position).reverse().find(entry=>entry.campaign_id===campaign && entry.origin_url===normalized.origin_url) ?? null;
      return {event:copy(existing),previous:copy(previous),duplicate:true};
    }
    const previous = [...this.referenceDecisions.values()].reverse().find(entry=>entry.campaign_id===campaign && entry.origin_url===normalized.origin_url) ?? null;
    if (previous?.action === 'reject' && normalized.action === 'select') throw new Error('Explicit reconsideration required before selecting a rejected reference');
    const event: ReferenceDecision = {...normalized,timestamp:this.now()};
    this.referenceDecisions.set(rawId,event);
    return {event:copy(event),previous:copy(previous),duplicate:false};
  }
  /** Current campaign decisions are inactive when personalization is revoked. */
  activeReferenceDecisions(actor: string, campaignId: string): ReferenceDecision[] {
    this.ownerOnly(actor);
    const campaign = required(campaignId, 'campaign');
    if (campaign.length > 200) throw new Error('Invalid campaign');
    if (!this.isGranted('personalization')) return [];
    const latest = new Map<string, ReferenceDecision>();
    for (const decision of this.referenceDecisions.values()) if (decision.campaign_id === campaign) latest.set(decision.origin_url, decision);
    return copy([...latest.values()]);
  }
  undo(actor: string, changeId: string, correction: string): ProfileChange {
    this.ownerOnly(actor);
    const original = this.changes.find((c) => c.id === changeId);
    if (!original || !original.current || original.undo_of) throw new Error('Change not found');
    if (this.changes.some((c) => c.undo_of === changeId)) throw new Error('Change already undone');
    const key = scopeKey(original.current.scope, original.current.key);
    if (this.preferences.get(key)?.source_event_id !== original.current.source_event_id) throw new Error('Change is no longer current');
    const note = required(correction, 'correction');
    if (original.previous) this.preferences.set(key, copy(original.previous));
    else this.preferences.delete(key);
    const change: ProfileChange = { id: randomUUID(), event_id: original.event_id, previous: copy(original.current), current: copy(original.previous), timestamp: this.now(), correction: note, undo_of: original.id };
    this.changes.push(change);
    return copy(change);
  }
  read(actor: string) {
    this.ownerOnly(actor);
    this.audit.push({ action: 'read', actor, timestamp: this.now(), purpose: 'owner' });
    return copy({ id: this.owner, preferences: [...this.preferences.values()], events: [...this.events.values()], reference_decisions:[...this.referenceDecisions.values()], changes: this.changes, consents: this.consents, maintainer_consents: this.maintainerConsents, shares: this.shares, audit: this.audit });
  }
  setMaintainerConsent(actor: string, recipient: string, purpose: string, granted: boolean): void {
    this.ownerOnly(actor);
    if (typeof granted !== 'boolean') throw new Error('Invalid consent');
    this.maintainerConsents.push({ recipient: required(recipient, 'recipient'), purpose: required(purpose, 'purpose'), granted, timestamp: this.now() });
  }
  assertMaintainerConsent(actor: string, recipient: string, purpose: string): void {
    this.ownerOnly(actor);
    const consent = [...this.maintainerConsents].reverse().find((c) => c.recipient === recipient && c.purpose === purpose);
    if (!this.isGranted('maintainer_summary') || !consent?.granted) throw new Error('Maintainer summary consent required');
  }
  /** Build and retain a snapshot only when explicitly invoked; no network transmission. */
  maintainerSummary(actor: string, recipient: string, purpose: string) {
    this.assertMaintainerConsent(actor, recipient, purpose);
    const sources = [...this.events.values()].map(({ id, kind, source, version_id, scope }) => ({ id, kind, source, version_id, scope }));
    const changes = this.changes.map(({ correction, ...change }) => ({ ...change, correction_recorded: correction !== undefined }));
    const summary = copy({ id: this.owner, preferences: [...this.preferences.values()], changes, sources, recipient, purpose, generated_at: this.now() });
    this.sentSummaries.push(summary);
    this.audit.push({ action: 'summary_prepared', actor, timestamp: this.now(), purpose: 'maintainer_summary' });
    return summary;
  }
  preparedSummaries(actor: string): unknown[] { this.ownerOnly(actor); return copy(this.sentSummaries); }
  share(actor: string, collaborator: string, purpose: string): void {
    this.ownerOnly(actor);
    this.shares.push({ collaborator: required(collaborator, 'collaborator'), purpose: required(purpose, 'purpose'), active: true, timestamp: this.now() });
    this.audit.push({ action: 'share', actor, timestamp: this.now(), purpose });
  }
  revokeShare(actor: string, collaborator: string, purpose: string): void {
    this.ownerOnly(actor);
    this.shares.push({ collaborator: required(collaborator, 'collaborator'), purpose: required(purpose, 'purpose'), active: false, timestamp: this.now() });
    this.audit.push({ action: 'revoke_share', actor, timestamp: this.now(), purpose });
  }
  readShared(actor: string, purpose: string) {
    const access = [...this.shares].reverse().find((s) => s.collaborator === actor && s.purpose === purpose);
    if (!access?.active) throw new Error('Access denied');
    this.audit.push({ action: 'read', actor, timestamp: this.now(), purpose });
    return copy({ id: this.owner, preferences: [...this.preferences.values()], events: [...this.events.values()], changes: this.changes });
  }
  async syncMarkdown(actor: string, directory: string): Promise<string> {
    this.ownerOnly(actor);
    return this.enqueuePersistence(async () => {
      const dir = await privateDirectory(directory);
      const id = createHash('sha256').update(this.owner).digest('hex').slice(0, 24);
      const path = join(dir, `phoenix-profile-${id}.md`);
      const temporary = join(dir, `.phoenix-${randomUUID()}.tmp`);
      const contents = this.markdown(actor);
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(contents, 'utf8');
        await handle.close();
        await rename(temporary, path);
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
      return path;
    });
  }
  /** Load only the host-bound owner. Corrupt snapshots and stale writers fail closed. */
  static async restoreLocal(owner: string, directory: string): Promise<ProfileLedger> {
    const ledger = new ProfileLedger(owner);
    const dir = await privateDirectory(directory);
    const path = snapshotPath(dir, owner);
    const snapshot = await readSnapshot(path);
    ledger.persistencePath = path;
    if (!snapshot) return ledger;
    if (snapshot.owner !== owner) throw new Error('Profile owner mismatch');
    for (const [key, value] of snapshot.preferences) {
      if (key !== scopeKey(value.scope, value.key) || ledger.preferences.has(key)) throw new Error('Invalid profile preferences');
      ledger.preferences.set(key, value);
    }
    for (const event of snapshot.events) {
      if (ledger.events.has(event.id)) throw new Error('Duplicate profile event');
      ledger.events.set(event.id, event);
    }
    for (const decision of snapshot.reference_decisions) {
      if (ledger.referenceDecisions.has(decision.id) || ledger.events.has(decision.id) || canonicalReferenceOrigin(decision.origin_url) !== decision.origin_url || (decision.action === 'select') !== (decision.selected_attributes !== undefined) || (decision.selected_attributes && new Set(decision.selected_attributes).size !== decision.selected_attributes.length)) throw new Error('Invalid reference decisions');
      ledger.referenceDecisions.set(decision.id,decision);
    }
    ledger.changes.push(...snapshot.changes);
    ledger.consents.push(...snapshot.consents);
    ledger.maintainerConsents.push(...snapshot.maintainer_consents);
    ledger.shares.push(...snapshot.shares);
    ledger.audit.push(...snapshot.audit);
    ledger.sentSummaries.push(...snapshot.prepared_summaries);
    ledger.persistenceRevision = snapshot.revision;
    return ledger;
  }
  /** Atomic replacement with exclusive lock and revision check; stale locks fail closed. */
  async saveLocal(actor: string, directory: string): Promise<string> {
    this.ownerOnly(actor);
    return this.enqueuePersistence(async () => {
      const dir = await privateDirectory(directory);
      const path = snapshotPath(dir, this.owner);
      if (this.persistencePath && this.persistencePath !== path) throw new Error('Profile is bound to another store');
      const lockPath = `${path}.lock`;
      const lock = await open(lockPath, 'wx', 0o600);
      const temporary = join(dir, `.phoenix-state-${randomUUID()}.tmp`);
      try {
        const current = await readSnapshot(path);
        if ((current?.revision ?? 0) !== this.persistenceRevision || (current && current.owner !== this.owner)) throw new Error('Profile snapshot changed; reload before writing');
        const snapshot = persistedSnapshot.parse({
          format: 'compor-phoenix-profile-v1', owner: this.owner, revision: this.persistenceRevision + 1,
          preferences: [...this.preferences.entries()], events: [...this.events.values()], changes: this.changes,
          consents: this.consents, maintainer_consents: this.maintainerConsents, shares: this.shares, audit: this.audit, prepared_summaries: this.sentSummaries, reference_decisions:[...this.referenceDecisions.values()],
        });
        const payload = JSON.stringify(snapshot);
        if (Buffer.byteLength(payload) > 5_000_000) throw new Error('Profile snapshot too large');
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(payload, 'utf8'); } finally { await file.close(); }
        await rename(temporary, path);
        this.persistencePath = path;
        this.persistenceRevision = snapshot.revision;
        return path;
      } finally {
        await unlink(temporary).catch(() => undefined);
        await lock.close();
        await unlink(lockPath);
      }
    });
  }
  markdown(actor: string): string {
    this.ownerOnly(actor);
    // JSON fences keep the person's original statement distinct from agent interpretation.
    // Rendering the local file is a write, not a person reading the profile.
    const snapshot = { id: this.owner, preferences: [...this.preferences.values()], events: [...this.events.values()], reference_decisions:[...this.referenceDecisions.values()], changes: this.changes, consents: this.consents, maintainer_consents: this.maintainerConsents, shares: this.shares, audit: this.audit };
    const json = JSON.stringify(snapshot, null, 2).replace(/```/g, '\\u0060\\u0060\\u0060');
    return `# Perfil Phoenix — ${this.owner.replace(/[\r\n]/g, ' ')}\n\nProtótipo local; alterações e correções preservadas.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
  }
}
