import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PhoenixHyperparams } from '../config/hyperparams.js';
import { CANONICAL_BOARD_SLUGS } from '../domain/catalog.js';
import type {
  BoardAffinityEntry,
  FeedbackAction,
  SessionEvent,
  UserTasteProfile,
} from '../domain/models.js';
import {
  compute_board_affinity_score,
  compute_ema_session_vector,
  l2_normalize,
} from '../math/formulas.js';
import type { EmbeddingSpaceId } from './decision_api.js';
import { canonicalReferenceOrigin } from './profile_ledger.js';

function referenceKey(origin: string): string {
  try { return canonicalReferenceOrigin(origin); } catch { return origin; }
}

export interface DiscoveredCandidateMemoryEntry {
  candidate_id: string;
  board: string;
  metadata_sid: string[];
  visual_description: string;
  origin_url?: string;
  embedding_text: string;
  vec: number[];
  space: EmbeddingSpaceId;
}

export interface UserMemoryRecord {
  user_id: string;
  session_token: string;
  embedding_space: EmbeddingSpaceId;
  pos_session_vecs: number[][];
  pos_session_texts: string[];
  neg_session_vecs: number[][];
  neg_session_texts: string[];
  session_events: SessionEvent[];
  board_bandit: Map<string, { positive_actions: number; total_impressions: number }>;
  user_taste: UserTasteProfile;
  long_term_vec: number[] | null;
  compaction_count: number;
  discovered_candidates: Map<string, DiscoveredCandidateMemoryEntry>;
  exposed_candidates: Set<string>;
  positive_candidates: Set<string>;
  rejected_origins: Set<string>;
  session_rejected_origins: Set<string>;
  profile_rejected_origins: Set<string>;
  event_signatures: Map<string, string>;
}

export interface MemoryConsolidatorCallback {
  (params: {
    user_id: string;
    previous_taste: UserTasteProfile;
    session_events: SessionEvent[];
    embedding_space: EmbeddingSpaceId;
  }): Promise<{
    updated_taste: UserTasteProfile;
    long_term_vec?: number[] | null;
    embedding_space?: EmbeddingSpaceId;
  }>;
}

export class PhoenixMemoryStore {
  private readonly hp: PhoenixHyperparams;
  private readonly users = new Map<string, UserMemoryRecord>();
  private readonly activeContexts = new Map<string, string>();
  private readonly requestContext = new AsyncLocalStorage<{actor:string; context:string}>();
  private readonly nowFn: () => number;

  constructor(options: { hp: PhoenixHyperparams; nowFn?: () => number }) {
    this.hp = options.hp;
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  getOrCreateUser(userId: string): UserMemoryRecord {
    const cleanId = userId.trim() || 'default_user';
    const local = this.requestContext.getStore();
    const context = local?.actor === cleanId ? local.context : this.activeContexts.get(cleanId) ?? 'session';
    const userKey = JSON.stringify([cleanId,context]);
    let existing = this.users.get(userKey);
    if (!existing) {
      const bandit = new Map<string, { positive_actions: number; total_impressions: number }>();
      for (const slug of CANONICAL_BOARD_SLUGS) {
        bandit.set(slug, { positive_actions: 0, total_impressions: 0 });
      }
      existing = {
        user_id: cleanId,
        session_token: `phx_sess_${randomBytes(6).toString('hex')}`,
        embedding_space: 'local_deterministic_sha256',
        pos_session_vecs: [],
        pos_session_texts: [],
        neg_session_vecs: [],
        neg_session_texts: [],
        session_events: [],
        board_bandit: bandit,
        user_taste: {
          user_id: cleanId,
          preferred_boards_by_goal: {},
          visual_dna_rules: [],
          negative_constraints: [],
          updated_at: new Date(this.nowFn()).toISOString(),
        },
        long_term_vec: null,
        compaction_count: 0,
        discovered_candidates: new Map<string, DiscoveredCandidateMemoryEntry>(),
        exposed_candidates: new Set(),
        positive_candidates: new Set(),
        rejected_origins: new Set(),
        session_rejected_origins: new Set(),
        profile_rejected_origins: new Set(),
        event_signatures: new Map(),
      };
      this.users.set(userKey, existing);
    }
    return existing;
  }

  /** Host-bound context only; snapshots and transient interactions never cross contexts. */
  setReferenceContext(userId: string, context: string | null, profileRejectedOrigins?: readonly string[]): UserMemoryRecord {
    const cleanId = userId.trim() || 'default_user';
    if (context !== null && (!context.trim() || context.length > 400 || context.includes('\0'))) throw new Error('Invalid reference context');
    const key = context === null ? 'session' : `campaign:${context}`;
    this.activeContexts.set(cleanId,key);
    const record = this.requestContext.run({actor:cleanId,context:key},()=>this.getOrCreateUser(cleanId));
    if (profileRejectedOrigins !== undefined) {
      record.profile_rejected_origins = new Set(profileRejectedOrigins.map(referenceKey));
      record.rejected_origins = new Set([...record.session_rejected_origins,...record.profile_rejected_origins]);
    }
    return record;
  }

  /** Bind the entire asynchronous operation to its own actor and context. */
  runWithReferenceContext<T>(userId: string, context: string | null, callback: () => T): T {
    const actor = userId.trim() || 'default_user';
    if (context !== null && (!context.trim() || context.length > 400 || context.includes('\0'))) throw new Error('Invalid reference context');
    return this.requestContext.run({actor,context:context === null ? 'session' : `campaign:${context}`},callback);
  }

  /** Immediate rejection applies to the current context, independent of saved profile. */
  rejectReference(userId: string, origin: string): void {
    const record = this.getOrCreateUser(userId), key = referenceKey(origin);
    record.session_rejected_origins.add(key);
    record.rejected_origins.add(key);
  }

  /** Call only after explicit reconsideration; it affects this context and this origin. */
  reconsiderReference(userId: string, origin: string): void {
    const record = this.getOrCreateUser(userId), key = referenceKey(origin);
    record.session_rejected_origins.delete(key);
    record.profile_rejected_origins.delete(key);
    record.rejected_origins.delete(key);
  }

  /** Revocation drops only profile-derived rejections, across this actor's contexts. */
  clearProfileReferenceRejections(userId: string): void {
    const actor = userId.trim() || 'default_user';
    for (const [key,record] of this.users) {
      const parsed = JSON.parse(key) as [string,string];
      if (parsed[0] !== actor) continue;
      record.profile_rejected_origins.clear();
      record.rejected_origins = new Set(record.session_rejected_origins);
      record.user_taste.visual_dna_rules = [];
      record.long_term_vec = null;
    }
  }

  registerDiscoveredCandidates(
    userId: string,
    entries: readonly DiscoveredCandidateMemoryEntry[],
  ): void {
    const record = this.getOrCreateUser(userId);
    for (const entry of entries) {
      record.discovered_candidates.set(entry.candidate_id, {
        ...entry,
        vec: l2_normalize(entry.vec),
      });
    }
  }

  recordExposures(userId: string, entries: readonly DiscoveredCandidateMemoryEntry[]): void {
    const record = this.getOrCreateUser(userId);
    for (const entry of entries) {
      if (record.exposed_candidates.has(entry.candidate_id)) continue;
      record.exposed_candidates.add(entry.candidate_id);
      const stats = record.board_bandit.get(entry.board) ?? { positive_actions: 0, total_impressions: 0 };
      stats.total_impressions += 1;
      record.board_bandit.set(entry.board, stats);
    }
  }

  getDiscoveredCandidate(
    userId: string,
    candidateId: string,
  ): DiscoveredCandidateMemoryEntry | undefined {
    const record = this.getOrCreateUser(userId);
    return record.discovered_candidates.get(candidateId);
  }

  /**
   * Garante que todos os vetores históricos da User Tower (`pos_session_vecs`, `neg_session_vecs`
   * e `long_term_vec`) estejam no mesmo espaço vetorial (`targetSpace`) do vetor de consulta e dos candidatos.
   */
  async ensureConsistentEmbeddingSpace(
    userId: string,
    targetSpace: EmbeddingSpaceId,
    embedBatchFn: (
      texts: readonly string[],
      forceSpace: EmbeddingSpaceId,
    ) => Promise<number[][]>,
  ): Promise<UserMemoryRecord> {
    const record = this.getOrCreateUser(userId);
    if (record.embedding_space === targetSpace) {
      return record;
    }

    const posCount = record.pos_session_texts.length;
    const negCount = record.neg_session_texts.length;
    const hasLongTerm = record.long_term_vec !== null;
    const longTermText = hasLongTerm ? JSON.stringify(record.user_taste) : null;

    const allTexts: string[] = [
      ...record.pos_session_texts,
      ...record.neg_session_texts,
      ...(longTermText ? [longTermText] : []),
    ];

    if (allTexts.length > 0) {
      const reembedded = await embedBatchFn(allTexts, targetSpace);
      record.pos_session_vecs = reembedded
        .slice(0, posCount)
        .map((v) => l2_normalize(v));
      record.neg_session_vecs = reembedded
        .slice(posCount, posCount + negCount)
        .map((v) => l2_normalize(v));
      if (hasLongTerm) {
        const ltVec = reembedded[posCount + negCount];
        record.long_term_vec = ltVec ? l2_normalize(ltVec) : null;
      }
    }

    record.embedding_space = targetSpace;
    return record;
  }

  getBoardAffinities(userId: string): BoardAffinityEntry[] {
    const record = this.getOrCreateUser(userId);
    const entries: BoardAffinityEntry[] = [];
    for (const [board, stats] of record.board_bandit.entries()) {
      const affinity = compute_board_affinity_score(
        stats.positive_actions,
        stats.total_impressions,
        this.hp,
      );
      entries.push({
        board,
        positive_actions: stats.positive_actions,
        total_impressions: stats.total_impressions,
        affinity_score: Math.round(affinity * 10000) / 10000,
      });
    }
    return entries.sort((a, b) => b.affinity_score - a.affinity_score);
  }

  formatBoardAffinityTable(userId: string, limit = 16): string {
    const entries = this.getBoardAffinities(userId).slice(0, limit);
    return entries
      .map(
        (e) =>
          `- ${e.board}: affinity=${e.affinity_score.toFixed(4)} (S=${e.positive_actions}, N=${e.total_impressions})`,
      )
      .join('\n');
  }

  formatSessionEventsSummary(userId: string, maxEvents = 12): string {
    const record = this.getOrCreateUser(userId);
    if (record.session_events.length === 0) {
      return 'Nenhuma interação registrada na sessão atual.';
    }
    return record.session_events
      .slice(-maxEvents)
      .map(
        (ev, idx) =>
          `${idx + 1}. [${ev.action}] candidate=${ev.candidate_id} board=${ev.board} sid=${JSON.stringify(ev.metadata_sid)} dwell_ms=${ev.dwell_time_ms}`,
      )
      .join('\n');
  }

  setLongTermTaste(
    userId: string,
    taste: Partial<UserTasteProfile>,
    longTermVec?: number[] | null,
    space?: EmbeddingSpaceId,
  ): UserMemoryRecord {
    const record = this.getOrCreateUser(userId);
    record.user_taste = {
      ...record.user_taste,
      ...taste,
      user_id: record.user_id,
      updated_at: new Date(this.nowFn()).toISOString(),
    };
    if (longTermVec !== undefined) {
      record.long_term_vec = longTermVec ? l2_normalize(longTermVec) : null;
    }
    if (space) {
      record.embedding_space = space;
    }
    return record;
  }

  async recordFeedback(params: {
    user_id: string;
    event_id?: string;
    candidate_id: string;
    board: string;
    metadata_sid: string[];
    action: FeedbackAction;
    dwell_time_ms: number;
    candidate_vec: number[];
    candidate_text?: string;
    embedding_space?: EmbeddingSpaceId;
    consolidator?: MemoryConsolidatorCallback;
  }): Promise<{
    event: SessionEvent;
    board_affinity: BoardAffinityEntry;
    positive_session_count: number;
    negative_session_count: number;
    compaction_triggered: boolean;
    user_taste: UserTasteProfile;
    embedding_space: EmbeddingSpaceId;
    duplicate?: boolean;
  }> {
    const record = this.getOrCreateUser(params.user_id);
    const signature = JSON.stringify([params.candidate_id, params.board, params.metadata_sid, params.action, params.dwell_time_ms]);
    if (params.event_id && record.event_signatures.has(params.event_id)) {
      if (record.event_signatures.get(params.event_id) !== signature) throw new Error('event_id já utilizado com outro conteúdo.');
      const board_affinity = this.getBoardAffinities(params.user_id).find((x) => x.board === params.board)!;
      const event = record.session_events.find((x) => (x as SessionEvent & { event_id?: string }).event_id === params.event_id)!;
      return { event, board_affinity, positive_session_count: record.pos_session_vecs.length, negative_session_count: record.neg_session_vecs.length, compaction_triggered: false, user_taste: record.user_taste, embedding_space: record.embedding_space, duplicate: true };
    }
    if (params.event_id) record.event_signatures.set(params.event_id, signature);
    const now = this.nowFn();
    const normVec = l2_normalize(params.candidate_vec);
    const candidateText =
      params.candidate_text ??
      `${params.board} ${params.metadata_sid.join(' ')} ${params.candidate_id}`;
    if (params.embedding_space) {
      record.embedding_space = params.embedding_space;
    }

    const event: SessionEvent = {
      ...(params.event_id ? { event_id: params.event_id } : {}),
      candidate_id: params.candidate_id,
      board: params.board,
      metadata_sid: params.metadata_sid,
      action: params.action,
      dwell_time_ms: Math.max(0, Math.trunc(params.dwell_time_ms)),
      timestamp_ms: now,
    };
    record.session_events.push(event);

    const currentBoardStats = record.board_bandit.get(params.board) ?? {
      positive_actions: 0,
      total_impressions: 0,
    };

    const isPositiveLock = params.action === 'locked_as_reference';
    const isNegative =
      params.action === 'discard_generic' || params.action === 'style_mismatch';

    if (isPositiveLock && !record.positive_candidates.has(params.candidate_id)) {
      record.positive_candidates.add(params.candidate_id);
      record.pos_session_vecs.push(normVec);
      record.pos_session_texts.push(candidateText);
      currentBoardStats.positive_actions += 1;
    } else if (isNegative) {
      record.neg_session_vecs.push(normVec);
      record.neg_session_texts.push(candidateText);
      const origin = record.discovered_candidates.get(params.candidate_id)?.origin_url;
      if (origin) this.rejectReference(params.user_id,origin);
    }

    record.board_bandit.set(params.board, currentBoardStats);

    const newAffinityScore = compute_board_affinity_score(
      currentBoardStats.positive_actions,
      currentBoardStats.total_impressions,
      this.hp,
    );

    const boardAffinity: BoardAffinityEntry = {
      board: params.board,
      positive_actions: currentBoardStats.positive_actions,
      total_impressions: currentBoardStats.total_impressions,
      affinity_score: Math.round(newAffinityScore * 10000) / 10000,
    };

    let compactionTriggered = false;
    if (
      record.session_events.length > 0 &&
      record.session_events.length % this.hp.memory_compaction_threshold === 0
    ) {
      compactionTriggered = true;
      record.compaction_count += 1;
      if (params.consolidator) {
        const consolidated = await params.consolidator({
          user_id: record.user_id,
          previous_taste: record.user_taste,
          session_events: record.session_events,
          embedding_space: record.embedding_space,
        });
        record.user_taste = consolidated.updated_taste;
        if (consolidated.long_term_vec) {
          record.long_term_vec = l2_normalize(consolidated.long_term_vec);
        }
        if (consolidated.embedding_space) {
          record.embedding_space = consolidated.embedding_space;
        }
      }
    }

    return {
      event,
      board_affinity: boardAffinity,
      positive_session_count: record.pos_session_vecs.length,
      negative_session_count: record.neg_session_vecs.length,
      compaction_triggered: compactionTriggered,
      user_taste: record.user_taste,
      embedding_space: record.embedding_space,
    };
  }

  private defaultLocalConsolidation(record: UserMemoryRecord): void {
    const preferredByGoal: Record<string, string[]> = {
      ...record.user_taste.preferred_boards_by_goal,
    };
    const dnaRules = new Set<string>(record.user_taste.visual_dna_rules);
    const negConstraints = new Set<string>(record.user_taste.negative_constraints);

    for (const ev of record.session_events) {
      const isPositive =
        ev.action === 'locked_as_reference' ||
        (ev.action === 'expand_zoom' && ev.dwell_time_ms >= this.hp.high_dwell_threshold_ms);
      const goalKey = ev.metadata_sid[0] ?? 'general';
      if (isPositive) {
        const list = preferredByGoal[goalKey] ?? [];
        if (!list.includes(ev.board)) {
          list.push(ev.board);
        }
        preferredByGoal[goalKey] = list;
        if (ev.metadata_sid.length >= 2) {
          dnaRules.add(`Preferência por ${ev.metadata_sid.slice(0, 3).join(' + ')}`);
        }
      } else if (ev.action === 'discard_generic' || ev.action === 'style_mismatch') {
        const prefix = ev.metadata_sid.slice(0, this.hp.sid_prefix_depth).join('/');
        if (prefix) {
          negConstraints.add(prefix);
        }
      }
    }

    record.user_taste = {
      user_id: record.user_id,
      preferred_boards_by_goal: preferredByGoal,
      visual_dna_rules: Array.from(dnaRules).slice(0, 12),
      negative_constraints: Array.from(negConstraints).slice(0, 20),
      updated_at: new Date(this.nowFn()).toISOString(),
    };

    if (record.pos_session_vecs.length > 0) {
      const sessionPosEma = compute_ema_session_vector(
        record.pos_session_vecs,
        this.hp.ema_session_decay,
      );
      if (record.long_term_vec && record.long_term_vec.length === sessionPosEma.length) {
        const blended = record.long_term_vec.map(
          (val, i) => 0.7 * val + 0.3 * sessionPosEma[i]!,
        );
        record.long_term_vec = l2_normalize(blended);
      } else {
        record.long_term_vec = sessionPosEma;
      }
    }
  }
}
