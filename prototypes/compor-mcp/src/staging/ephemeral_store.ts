import { createHash, randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ExternalMetadataContextEnvelope,
  UntrustedExternalCaptionPayload,
} from '../security/text_sanitizer.js';
import { STAGING_ROOT_DIR } from '../security/image_sanitizer.js';

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
  private readonly sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private proceedWithoutReferencesFlag = false;
  private lastSessionId: string;

  constructor(options: {
    ttlMs?: number;
    stagingRoot?: string;
    nowFn?: () => number;
    defaultSessionId?: string;
  } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.stagingRoot = resolve(options.stagingRoot ?? STAGING_ROOT_DIR);
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.lastSessionId = options.defaultSessionId ?? `sid_${randomBytes(4).toString('hex')}`;
  }

  getActiveSessionId(explicitSessionId?: string): string {
    if (explicitSessionId && /^[A-Za-z0-9_-]{1,80}$/.test(explicitSessionId)) {
      this.lastSessionId = explicitSessionId;
    }
    return this.lastSessionId;
  }

  getStagingRoot(): string {
    return this.stagingRoot;
  }

  getSessionDir(sessionId?: string): string {
    const sid = this.getActiveSessionId(sessionId);
    return resolve(this.stagingRoot, sid);
  }

  private scheduleSessionCleanup(sessionId: string): void {
    const existing = this.sessionTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.cleanupSession(sessionId);
    }, this.ttlMs);
    timer.unref?.();
    this.sessionTimers.set(sessionId, timer);
  }

  pruneExpired(): void {
    const now = this.nowFn();
    for (const [refId, entry] of this.candidates.entries()) {
      if (now >= entry.expires_at_ms) {
        this.candidates.delete(refId);
        for (const alias of entry.aliases) {
          if (this.aliasToRefId.get(alias) === refId) {
            this.aliasToRefId.delete(alias);
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
    this.proceedWithoutReferencesFlag = false;

    const now = this.nowFn();
    const expiresAt = now + this.ttlMs;
    const registered: EphemeralCandidateReference[] = [];

    items.forEach((item, index) => {
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

      this.candidates.set(primaryId, record);
      for (const alias of aliases) {
        this.aliasToRefId.set(alias, primaryId);
      }
      registered.push(record);
    });

    this.scheduleSessionCleanup(sid);
    return registered;
  }

  getCandidate(refIdOrAlias: string): EphemeralCandidateReference | undefined {
    this.pruneExpired();
    const primaryId = this.aliasToRefId.get(refIdOrAlias) ?? refIdOrAlias;
    const entry = this.candidates.get(primaryId);
    if (!entry) return undefined;
    if (this.nowFn() >= entry.expires_at_ms) {
      this.candidates.delete(primaryId);
      return undefined;
    }
    return entry;
  }

  listCandidates(sessionId?: string): EphemeralCandidateReference[] {
    this.pruneExpired();
    const all = Array.from(this.candidates.values());
    if (!sessionId) return all;
    return all.filter((c) => c.session_id === sessionId);
  }

  recordStagedReference(record: Pr9CompatibleStagedReference, aliases: string[] = []): void {
    this.staged.set(record.ref_id, record);
    for (const alias of aliases) {
      this.staged.set(alias, record);
    }
  }

  async replaceStagedReferences(
    entries: Array<{ record: Pr9CompatibleStagedReference; aliases?: string[] }>,
  ): Promise<void> {
    const previousRecords = this.listStagedReferences();
    const nextPaths = new Set(entries.map((entry) => resolve(entry.record.local_path)));

    this.staged.clear();
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
    return this.staged.get(refId);
  }

  listStagedReferences(): Pr9CompatibleStagedReference[] {
    const unique = new Map<string, Pr9CompatibleStagedReference>();
    for (const item of this.staged.values()) {
      unique.set(item.ref_id, item);
    }
    return Array.from(unique.values());
  }

  setProceedWithoutReferences(value: boolean): void {
    this.proceedWithoutReferencesFlag = value;
  }

  didProceedWithoutReferences(): boolean {
    return this.proceedWithoutReferencesFlag;
  }

  async clearSearchAndStaging(sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.lastSessionId;
    for (const [key, candidate] of this.candidates.entries()) {
      if (!sessionId || candidate.session_id === sid) {
        this.candidates.delete(key);
        for (const alias of candidate.aliases) {
          if (this.aliasToRefId.get(alias) === key) {
            this.aliasToRefId.delete(alias);
          }
        }
      }
    }
    this.staged.clear();
    await this.cleanupSessionFiles(sid);
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

  async cleanupSession(sessionId: string): Promise<void> {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(sessionId);
    }
    await this.clearSearchAndStaging(sessionId);
  }
}

export const defaultEphemeralReferenceStore = new EphemeralReferenceStore();
