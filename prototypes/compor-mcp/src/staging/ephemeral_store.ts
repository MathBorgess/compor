import { createHash, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ExternalMetadataContextEnvelope,
  UntrustedExternalCaptionPayload,
} from '../security/text_sanitizer.js';
import { STAGING_ROOT_DIR } from '../security/image_sanitizer.js';
import { canonicalReferenceOrigin } from '../phoenix_engine/services/profile_ledger.js';
import type { RankedCandidate } from '../phoenix_engine/domain/models.js';

function referenceKey(origin: string): string {
  try { return canonicalReferenceOrigin(origin); } catch { return origin; }
}

export type ReferenceAttribute = 'typography' | 'composition' | 'color' | 'photography';
export type Pr9MoodboardAspect = 'color' | 'typography' | 'texture' | 'composition' | 'shape' | 'icon' | 'other';

export interface AspectRationaleMap {
  typography?: string;
  composition?: string;
  color?: string;
  photography?: string;
}

export interface EphemeralCandidateReference {
  ref_id: string;
  aliases: string[];
  session_id: string;
  source_id: string;
  provenance_occurrences?: RankedCandidate['provenance_occurrences'];
  origin_url: string;
  preview_url: string;
  media_url: string;
  aspect_rationale: AspectRationaleMap;
  untrusted_external_caption: UntrustedExternalCaptionPayload;
  license_scope: 'inspiration_only';
  thumbnail_base64: string | null;
  thumbnail_mime_type: 'image/webp' | 'image/png' | 'image/jpeg' | null;
  created_at_ms: number;
  expires_at_ms: number;
}

/**
 * Exact contract compatible with PR 9 `prepare_moodboard` reference elements,
 * enriched with external curation lineage and inspiration-only license scope.
 */
export interface Pr9CompatibleStagedReference {
  // PR 9 opaque reference contract fields
  id: string;
  ref_id: string;
  kind: 'reference';
  value: string | null;
  asset_ref: string;
  label: string;
  meaning: string;
  aspects: Pr9MoodboardAspect[];
  intent: 'inspire';
  priority: number | null;
  origin_claim: string;
  geometry: null;
  visual_role: 'client_described';

  // Lineage & staging fields required by SCRUM-51 / Curated References spec
  origin_url: string;
  source_id: string;
  provenance_occurrences?: RankedCandidate['provenance_occurrences'];
  selected_attributes: ReferenceAttribute[];
  user_notes: string | null;
  license_scope: 'inspiration_only';
  direct_publication_allowed: false;
  local_path: string;
  mime_type: 'image/webp';
  width_px: number;
  height_px: number;
  byte_length: number;
  sha256: string;
  exif_stripped: true;
  magic_bytes_verified: true;
  stripped_metadata_segments: string[];
  untrusted_external_caption: UntrustedExternalCaptionPayload;
  external_metadata_envelope: ExternalMetadataContextEnvelope;
}

export const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function mapAttributesToPr9Aspects(attributes: ReferenceAttribute[]): Pr9MoodboardAspect[] {
  const mapped = new Set<Pr9MoodboardAspect>();
  for (const attr of attributes) {
    if (attr === 'typography') mapped.add('typography');
    else if (attr === 'composition') mapped.add('composition');
    else if (attr === 'color') mapped.add('color');
    else if (attr === 'photography') mapped.add('other');
  }
  return Array.from(mapped);
}

export function generateOpaqueRefId(seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 6);
  return `ref_ext_${digest}`;
}

export class EphemeralReferenceStore {
  private readonly ttlMs: number;
  private readonly stagingRoot: string;
  private readonly nowFn: () => number;
  private readonly candidates = new Map<string, EphemeralCandidateReference>();
  private readonly aliasToRefId = new Map<string, string>();
  private readonly staged = new Map<string, Pr9CompatibleStagedReference>();
  private readonly sessionRejectedOrigins = new Map<string, Set<string>>();
  private readonly profileRejectedOrigins = new Map<string, Set<string>>();
  private activeContext = 'session';
  private readonly requestContext = new AsyncLocalStorage<string>();
  private readonly sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly proceedWithoutReferences = new Map<string, boolean>();
  private readonly sessionIds = new Map<string, string>();
  private readonly sessionOwners = new Map<string, string>();

  constructor(options: {
    ttlMs?: number;
    stagingRoot?: string;
    nowFn?: () => number;
    defaultSessionId?: string;
  } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.stagingRoot = resolve(options.stagingRoot ?? STAGING_ROOT_DIR);
    this.nowFn = options.nowFn ?? (() => Date.now());
    const initialSessionId = options.defaultSessionId ?? `sid_${randomBytes(4).toString('hex')}`;
    this.sessionIds.set(this.referenceContext,initialSessionId);
    this.sessionOwners.set(initialSessionId,this.referenceContext);
  }

  private scoped(context: string, value: string): string { return `${context}\0${value}`; }
  private get referenceContext(): string { return this.requestContext.getStore() ?? this.activeContext; }
  private isRejected(context: string, origin: string): boolean {
    const key = referenceKey(origin);
    return this.sessionRejectedOrigins.get(context)?.has(key) === true || this.profileRejectedOrigins.get(context)?.has(key) === true;
  }
  /** Host selects a context; a supplied profile set replaces only profile-derived blocks. */
  setReferenceContext(context: string | null, profileRejectedOrigins?: readonly string[]): void {
    if (context !== null && (!context.trim() || context.length > 400 || context.includes('\0'))) throw new Error('Invalid reference context');
    const key = context === null ? 'session' : `campaign:${context}`;
    this.activeContext = key;
    if (profileRejectedOrigins !== undefined) this.profileRejectedOrigins.set(key,new Set(profileRejectedOrigins.map(referenceKey)));
  }

  /** Bind the entire asynchronous operation to the selected host context. */
  runWithReferenceContext<T>(context: string | null, callback: () => T): T {
    if (context !== null && (!context.trim() || context.length > 400 || context.includes('\0'))) throw new Error('Invalid reference context');
    return this.requestContext.run(context === null ? 'session' : `campaign:${context}`,callback);
  }

  getActiveSessionId(explicitSessionId?: string): string {
    if (explicitSessionId && /^[A-Za-z0-9_-]{1,80}$/.test(explicitSessionId)) {
      const owner = this.sessionOwners.get(explicitSessionId);
      if (owner && owner !== this.referenceContext) throw new Error('Session belongs to another reference context');
      this.sessionOwners.set(explicitSessionId,this.referenceContext);
      this.sessionIds.set(this.referenceContext,explicitSessionId);
    }
    let current = this.sessionIds.get(this.referenceContext);
    if (!current) {
      current = `sid_${randomBytes(8).toString('hex')}`;
      this.sessionIds.set(this.referenceContext,current);
      this.sessionOwners.set(current,this.referenceContext);
    }
    return current;
  }

  getStagingRoot(): string {
    return this.stagingRoot;
  }

  getSessionDir(sessionId?: string): string {
    const sid = this.getActiveSessionId(sessionId);
    return resolve(this.stagingRoot, sid);
  }

  private scheduleSessionCleanup(sessionId: string): void {
    const context = this.referenceContext, timerKey = this.scoped(context,sessionId);
    const existing = this.sessionTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.cleanupSession(sessionId,context);
    }, this.ttlMs);
    timer.unref?.();
    this.sessionTimers.set(timerKey, timer);
  }

  pruneExpired(): void {
    const now = this.nowFn();
    for (const [entryKey, entry] of this.candidates.entries()) {
      if (now >= entry.expires_at_ms) {
        const context = entryKey.slice(0,entryKey.indexOf('\0'));
        this.candidates.delete(entryKey);
        for (const alias of entry.aliases) {
          const aliasKey = this.scoped(context,alias);
          if (this.aliasToRefId.get(aliasKey) === entry.ref_id) {
            this.aliasToRefId.delete(aliasKey);
          }
        }
      }
    }
  }

  registerSearchCandidates(
    sessionId: string,
    items: Array<{
      preferred_ref_id?: string;
      source_id: string;
      provenance_occurrences?: RankedCandidate['provenance_occurrences'];
      origin_url: string;
      preview_url: string;
      media_url: string;
      aspect_rationale: AspectRationaleMap;
      untrusted_external_caption: UntrustedExternalCaptionPayload;
      thumbnail_base64: string | null;
      thumbnail_mime_type?: 'image/webp' | 'image/png' | 'image/jpeg' | null;
    }>,
  ): EphemeralCandidateReference[] {
    const sid = this.getActiveSessionId(sessionId);
    this.pruneExpired();
    this.proceedWithoutReferences.set(this.referenceContext,false);

    const now = this.nowFn();
    const expiresAt = now + this.ttlMs;
    const registered: EphemeralCandidateReference[] = [];

    items.forEach((item, index) => {
      if (this.isRejected(this.referenceContext,item.origin_url)) return;
      const positionalAlias = `ref_${String(index + 1).padStart(2, '0')}`;
      const extPositionalAlias = `ref_ext_${String(index + 1).padStart(2, '0')}`;
      const generatedId = generateOpaqueRefId(`${sid}:${item.source_id}:${item.origin_url}:${index}`);
      const primaryId =
        item.preferred_ref_id && /^[A-Za-z0-9_-]{1,80}$/.test(item.preferred_ref_id)
          ? item.preferred_ref_id
          : generatedId;

      const aliases = Array.from(new Set([primaryId, generatedId, positionalAlias, extPositionalAlias]));
      const record: EphemeralCandidateReference = {
        ref_id: primaryId,
        aliases,
        session_id: sid,
        source_id: item.source_id,
        ...(item.provenance_occurrences ? { provenance_occurrences: structuredClone(item.provenance_occurrences) } : {}),
        origin_url: item.origin_url,
        preview_url: item.preview_url,
        media_url: item.media_url,
        aspect_rationale: item.aspect_rationale,
        untrusted_external_caption: item.untrusted_external_caption,
        license_scope: 'inspiration_only',
        thumbnail_base64: item.thumbnail_base64,
        thumbnail_mime_type: item.thumbnail_base64 ? (item.thumbnail_mime_type ?? 'image/webp') : null,
        created_at_ms: now,
        expires_at_ms: expiresAt,
      };

      this.candidates.set(this.scoped(this.referenceContext,primaryId), record);
      for (const alias of aliases) {
        this.aliasToRefId.set(this.scoped(this.referenceContext,alias), primaryId);
      }
      registered.push(record);
    });

    this.scheduleSessionCleanup(sid);
    return registered;
  }

  getCandidate(refIdOrAlias: string): EphemeralCandidateReference | undefined {
    this.pruneExpired();
    const primaryId = this.aliasToRefId.get(this.scoped(this.referenceContext,refIdOrAlias)) ?? refIdOrAlias;
    const entry = this.candidates.get(this.scoped(this.referenceContext,primaryId));
    if (!entry || this.isRejected(this.referenceContext,entry.origin_url)) return undefined;
    if (this.nowFn() >= entry.expires_at_ms) {
      this.candidates.delete(this.scoped(this.referenceContext,primaryId));
      return undefined;
    }
    return entry;
  }

  listCandidates(sessionId?: string): EphemeralCandidateReference[] {
    this.pruneExpired();
    const prefix = `${this.referenceContext}\0`;
    const all = Array.from(this.candidates.entries()).filter(([key,c]) => key.startsWith(prefix) && !this.isRejected(this.referenceContext,c.origin_url)).map(([,c]) => c);
    if (!sessionId) return all;
    return all.filter((c) => c.session_id === sessionId);
  }

  recordStagedReference(record: Pr9CompatibleStagedReference, aliases: string[] = []): void {
    this.staged.set(this.scoped(this.referenceContext,record.ref_id), record);
    for (const alias of aliases) {
      this.staged.set(this.scoped(this.referenceContext,alias), record);
    }
  }

  async replaceStagedReferences(
    entries: Array<{ record: Pr9CompatibleStagedReference; aliases?: string[] }>,
  ): Promise<void> {
    const previousRecords = this.listStagedReferences();
    const nextPaths = new Set(entries.map((entry) => resolve(entry.record.local_path)));

    const prefix = `${this.referenceContext}\0`;
    for (const key of this.staged.keys()) if (key.startsWith(prefix)) this.staged.delete(key);
    for (const { record, aliases = [] } of entries) {
      this.recordStagedReference(record, aliases);
    }

    for (const prev of previousRecords) {
      const prevPath = resolve(prev.local_path);
      if (!nextPaths.has(prevPath) && prevPath.startsWith(this.stagingRoot + '/')) {
        try {
          await rm(prevPath, { force: true });
        } catch {
          // Ignore missing file on cleanup
        }
      }
    }
  }

  getStagedReference(refId: string): Pr9CompatibleStagedReference | undefined {
    const entry = this.staged.get(this.scoped(this.referenceContext,refId));
    return entry && !this.isRejected(this.referenceContext,entry.origin_url) ? entry : undefined;
  }

  /** Hide a rejected origin immediately, including old aliases, without deleting evidence. */
  rejectOrigin(originUrl: string): void {
    if (!originUrl) return;
    const rejected = this.sessionRejectedOrigins.get(this.referenceContext) ?? new Set<string>();
    rejected.add(referenceKey(originUrl));
    this.sessionRejectedOrigins.set(this.referenceContext,rejected);
  }

  /** Call only after an explicit reconsideration in this same context. */
  reconsiderOrigin(originUrl: string): void {
    const key = referenceKey(originUrl);
    this.sessionRejectedOrigins.get(this.referenceContext)?.delete(key);
    this.profileRejectedOrigins.get(this.referenceContext)?.delete(key);
  }

  /** Context keys are host-generated JSON [actor, scope, id]; ignore opaque keys. */
  clearProfileReferenceRejections(actor: string): void {
    for (const [context,origins] of this.profileRejectedOrigins) {
      if (!context.startsWith('campaign:')) continue;
      try {
        const parsed: unknown = JSON.parse(context.slice('campaign:'.length));
        if (Array.isArray(parsed) && parsed[0] === actor) origins.clear();
      } catch { /* Other context keys are not attributed to this actor. */ }
    }
  }

  listStagedReferences(): Pr9CompatibleStagedReference[] {
    const unique = new Map<string, Pr9CompatibleStagedReference>();
    const prefix = `${this.referenceContext}\0`;
    for (const [key,item] of this.staged.entries()) {
      if (key.startsWith(prefix) && !this.isRejected(this.referenceContext,item.origin_url)) unique.set(item.ref_id, item);
    }
    return Array.from(unique.values());
  }

  setProceedWithoutReferences(value: boolean): void {
    this.proceedWithoutReferences.set(this.referenceContext,value);
  }

  didProceedWithoutReferences(): boolean {
    return this.proceedWithoutReferences.get(this.referenceContext) ?? false;
  }

  async clearSearchAndStaging(sessionId?: string, context = this.referenceContext): Promise<void> {
    const sid = sessionId ?? this.sessionIds.get(context);
    const prefix = `${context}\0`;
    for (const [key, candidate] of this.candidates.entries()) {
      if (key.startsWith(prefix) && (!sessionId || candidate.session_id === sid)) {
        this.candidates.delete(key);
        for (const alias of candidate.aliases) {
          const aliasKey = this.scoped(context,alias);
          if (this.aliasToRefId.get(aliasKey) === candidate.ref_id) {
            this.aliasToRefId.delete(aliasKey);
          }
        }
      }
    }
    for (const key of this.staged.keys()) if (key.startsWith(prefix)) this.staged.delete(key);
    if (sid) await this.cleanupSessionFiles(sid);
  }

  async cleanupSessionFiles(sessionId: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionId)) return;
    const sessionDir = resolve(this.stagingRoot, sessionId);
    if (!sessionDir.startsWith(this.stagingRoot + '/')) return;
    try {
      await rm(sessionDir, { recursive: true, force: true });
    } catch {
      // Ignore missing temp directory on cleanup
    }
  }

  async cleanupSession(sessionId: string, context = this.referenceContext): Promise<void> {
    const timerKey = this.scoped(context,sessionId);
    const timer = this.sessionTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(timerKey);
    }
    await this.clearSearchAndStaging(sessionId,context);
  }
}

export const defaultEphemeralReferenceStore = new EphemeralReferenceStore();
