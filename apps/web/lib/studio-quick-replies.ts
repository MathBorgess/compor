import { z } from 'zod';
import type { StudioMessage } from './studio-domain.ts';

/** Closed, versioned contract for structured replies in the studio chat.
 * The server builds it from the taste-reading turn; this module validates it
 * again before anything is rendered. Options map to two fixed behaviors only:
 * send a plain human message, or focus the composer. Nothing here executes
 * model-provided markup, code or tools. */
export const TASTE_REPLY_VERSION = 1;
const LIMITS = Object.freeze({ field: 1200, synthesis: 80, label: 40, description: 140 });
const secret = /sk-[^\s]+/i;
const longText = z.string().trim().min(1).max(LIMITS.field).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !secret.test(value));
// Mirrors the server: plain text without questions, links, Markdown/HTML punctuation or control characters.
const shortText = (limit: number) => z.string().trim().min(1).max(limit).refine(value => !/[\u0000-\u001f\u007f-\u009f<>*_`#[\]|\\?{}]/u.test(value) && !/https?:|www\.|sk-/i.test(value));
const optionSchema = z.discriminatedUnion('intent', [
  z.strictObject({ id: z.literal('agree'), intent: z.literal('agree'), label: z.literal('Concordo') }),
  z.strictObject({ id: z.enum(['prefer_1', 'prefer_2']), intent: z.literal('prefer'), label: shortText(LIMITS.label), description: shortText(LIMITS.description) }),
  z.strictObject({ id: z.literal('adjust'), intent: z.literal('adjust'), label: z.literal('Quero ajustar') }),
]);
export type QuickReplyOption = z.infer<typeof optionSchema>;
export type QuickReplyIntent = QuickReplyOption['intent'];
export const tasteReplySchema = z.strictObject({
  version: z.literal(TASTE_REPLY_VERSION),
  kind: z.literal('taste_reading'),
  reading: longText,
  recommendation: longText,
  question: longText,
  synthesis: shortText(LIMITS.synthesis).optional(),
  options: z.array(optionSchema).min(2).max(4),
}).superRefine((value, context) => {
  const ids = value.options.map(option => option.id), labels = value.options.map(option => option.label.toLocaleLowerCase('pt-BR'));
  const preferences = value.options.filter(option => option.intent === 'prefer').map(option => option.id);
  const ordered = ids[0] === 'agree' && ids[ids.length - 1] === 'adjust' && preferences.every((id, index) => id === `prefer_${index + 1}`) && ids.length === preferences.length + 2;
  if (!ordered || new Set(labels).size !== labels.length) context.addIssue({ code: 'custom', message: 'invalid options' });
});
export type TasteReply = z.infer<typeof tasteReplySchema>;
export function parseTasteReply(value: unknown): TasteReply | null {
  const parsed = tasteReplySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const entrySchema = z.strictObject({
  messageId: uuid,
  requestId: uuid,
  fingerprint: z.string().max(4000),
  context: z.string().regex(/^[0-9a-f]{64}$/),
  epoch: z.string().min(1).max(200),
  reply: tasteReplySchema,
  answer: z.strictObject({ optionId: z.enum(['agree', 'prefer_1', 'prefer_2']), userMessageId: uuid }).nullable(),
});
export type QuickReplyEntry = z.infer<typeof entrySchema>;
const MAX_ENTRIES = 12;
export const quickReplyKey = (userId: string, projectId: string, conversationId?:string) => `compor-quick-replies:v1:${userId}:${projectId}${conversationId?':'+conversationId:''}`;

/** Each entry is validated alone: a defective entry only falls back to the message text. */
export function readQuickReplies(storage: Pick<Storage, 'getItem'>, key: string): QuickReplyEntry[] {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw.length > 200_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('entries' in value) || !Array.isArray(value.entries)) return [];
    const entries: QuickReplyEntry[] = [];
    for (const item of value.entries.slice(-MAX_ENTRIES)) {
      const parsed = entrySchema.safeParse(item);
      if (parsed.success && !entries.some(entry => entry.messageId === parsed.data.messageId)) entries.push(parsed.data);
    }
    return entries;
  } catch { return []; }
}
function write(storage: Pick<Storage, 'setItem'>, key: string, entries: QuickReplyEntry[]) {
  storage.setItem(key, JSON.stringify({ version: 1, entries: entries.slice(-MAX_ENTRIES) }));
}
export function rememberQuickReply(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, entry: QuickReplyEntry) {
  const parsed = entrySchema.parse(entry);
  write(storage, key, [...readQuickReplies(storage, key).filter(item => item.messageId !== parsed.messageId), parsed]);
}
/** Records which option produced a human message. Only the first answer is kept. */
export function recordQuickReplyAnswer(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, messageId: string, answer: NonNullable<QuickReplyEntry['answer']>) {
  const entries = readQuickReplies(storage, key), index = entries.findIndex(item => item.messageId === messageId);
  if (index < 0 || entries[index].answer) return false;
  entries[index] = entrySchema.parse({ ...entries[index], answer });
  write(storage, key, entries);
  return true;
}

export type QuickReplyStatus =
  | { kind: 'active' }
  | { kind: 'checking' }
  | { kind: 'answered'; optionId: NonNullable<QuickReplyEntry['answer']>['optionId'] | null }
  | { kind: 'obsolete'; reason: 'superseded' | 'context_changed' };
/** Any later human message answers the question, as it does for the exploration pause.
 * A newer reading or a changed selection/context makes the options obsolete. */
export function quickReplyStatus(entry: QuickReplyEntry, messages: readonly Pick<StudioMessage, 'id' | 'role'>[], current: { fingerprint: string; epoch: string | null | undefined; context: string | null }): QuickReplyStatus {
  const index = messages.findIndex(message => message.id === entry.messageId);
  if (index < 0) return { kind: 'obsolete', reason: 'superseded' };
  const later = messages.slice(index + 1).filter(message => message.role !== 'system');
  const human = later.find(message => message.role === 'user');
  if (human) return { kind: 'answered', optionId: entry.answer?.userMessageId === human.id ? entry.answer.optionId : null };
  if (later.some(message => message.role === 'assistant')) return { kind: 'obsolete', reason: 'superseded' };
  if (entry.fingerprint !== current.fingerprint || entry.epoch !== current.epoch) return { kind: 'obsolete', reason: 'context_changed' };
  if (current.context === null) return { kind: 'checking' };
  return entry.context === current.context ? { kind: 'active' } : { kind: 'obsolete', reason: 'context_changed' };
}

const sentence = (value: string) => value.replace(/[\s.!…;:,]+$/u, '');
/** The human message recorded in the history. It names what was agreed or preferred,
 * so the answer stays meaningful without any hidden metadata. Adjust sends nothing. */
export function quickReplyMessage(reply: TasteReply, option: QuickReplyOption): string | null {
  if (option.intent === 'agree') return reply.synthesis ? `Concordo com a recomendação: ${sentence(reply.synthesis)}.` : 'Concordo com a sua recomendação.';
  if (option.intent === 'prefer') return `Prefiro esta alternativa: ${sentence(option.label)} — ${sentence(option.description)}.`;
  return null;
}
export const QUICK_REPLY_ADJUST_PREFIX = 'Quero ajustar a recomendação: ';
