import { randomBytes } from 'node:crypto';
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

export interface UserMemoryRecord {
  user_id: string;
  session_token: string;
  pos_session_vecs: number[][];
  neg_session_vecs: number[][];
  session_events: SessionEvent[];
  board_bandit: Map<string, { positive_actions: number; total_impressions: number }>;
  user_taste: UserTasteProfile;
  long_term_vec: number[] | null;
  compaction_count: number;
}

export interface MemoryConsolidatorCallback {
  (params: {
    user_id: string;
    previous_taste: UserTasteProfile;
    session_events: SessionEvent[];
  }): Promise<{
    updated_taste: UserTasteProfile;
    long_term_vec?: number[] | null;
  }>;
}

export class PhoenixMemoryStore {
  private readonly hp: PhoenixHyperparams;
  private readonly users = new Map<string, UserMemoryRecord>();
  private readonly nowFn: () => number;

  constructor(options: { hp: PhoenixHyperparams; nowFn?: () => number }) {
    this.hp = options.hp;
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  getOrCreateUser(userId: string): UserMemoryRecord {
    const cleanId = userId.trim() || 'default_user';
    let existing = this.users.get(cleanId);
    if (!existing) {
      const bandit = new Map<string, { positive_actions: number; total_impressions: number }>();
      for (const slug of CANONICAL_BOARD_SLUGS) {
        bandit.set(slug, { positive_actions: 0, total_impressions: 0 });
      }
      existing = {
        user_id: cleanId,
        session_token: `phx_sess_${randomBytes(6).toString('hex')}`,
        pos_session_vecs: [],
        neg_session_vecs: [],
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
      };
      this.users.set(cleanId, existing);
    }
    return existing;
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
    return record;
  }

  async recordFeedback(params: {
    user_id: string;
    candidate_id: string;
    board: string;
    metadata_sid: string[];
    action: FeedbackAction;
    dwell_time_ms: number;
    candidate_vec: number[];
    consolidator?: MemoryConsolidatorCallback;
  }): Promise<{
    event: SessionEvent;
    board_affinity: BoardAffinityEntry;
    positive_session_count: number;
    negative_session_count: number;
    compaction_triggered: boolean;
    user_taste: UserTasteProfile;
  }> {
    const record = this.getOrCreateUser(params.user_id);
    const now = this.nowFn();
    const normVec = l2_normalize(params.candidate_vec);

    const event: SessionEvent = {
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
    const isHighDwellZoom =
      params.action === 'expand_zoom' &&
      params.dwell_time_ms >= this.hp.high_dwell_threshold_ms;
    const isNegative =
      params.action === 'discard_generic' || params.action === 'style_mismatch';

    currentBoardStats.total_impressions += 1;

    if (isPositiveLock || isHighDwellZoom) {
      record.pos_session_vecs.push(normVec);
      currentBoardStats.positive_actions += 1;
    } else if (isNegative) {
      record.neg_session_vecs.push(normVec);
      const rejectedSidTag = params.metadata_sid
        .slice(0, this.hp.sid_prefix_depth)
        .join('/');
      if (
        rejectedSidTag &&
        !record.user_taste.negative_constraints.includes(rejectedSidTag)
      ) {
        record.user_taste.negative_constraints.push(rejectedSidTag);
      }
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
        });
        record.user_taste = consolidated.updated_taste;
        if (consolidated.long_term_vec) {
          record.long_term_vec = l2_normalize(consolidated.long_term_vec);
        }
      } else {
        this.defaultLocalConsolidation(record);
      }
    }

    return {
      event,
      board_affinity: boardAffinity,
      positive_session_count: record.pos_session_vecs.length,
      negative_session_count: record.neg_session_vecs.length,
      compaction_triggered: compactionTriggered,
      user_taste: record.user_taste,
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
