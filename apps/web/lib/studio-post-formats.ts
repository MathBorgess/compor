import type { PieceFrame, PostFormat } from './studio-domain.ts';

export interface PostFormatOption {
  readonly id: PostFormat;
  readonly label: string;
  readonly ratioLabel: '4:5' | '9:16';
  readonly shortHint: string;
  readonly minFrames: number;
  readonly maxFrames: number;
  readonly defaultFrames: number;
  readonly multiFrame: boolean;
}

export const POST_FORMAT_OPTIONS: readonly PostFormatOption[] = Object.freeze([
  Object.freeze({ id: 'single', label: 'Post único', ratioLabel: '4:5', shortHint: 'Uma arte de feed pronta para parar a rolagem', minFrames: 1, maxFrames: 1, defaultFrames: 1, multiFrame: false }),
  Object.freeze({ id: 'carousel', label: 'Carrossel', ratioLabel: '4:5', shortHint: 'Sequência narrativa de 3 a 10 lâminas', minFrames: 3, maxFrames: 10, defaultFrames: 5, multiFrame: true }),
  Object.freeze({ id: 'collection', label: 'Coleção', ratioLabel: '4:5', shortHint: 'Série editorial de 2 ou mais fotos coesas', minFrames: 2, maxFrames: 10, defaultFrames: 3, multiFrame: true }),
  Object.freeze({ id: 'story', label: 'Story', ratioLabel: '9:16', shortHint: 'Vertical tela cheia com zonas seguras', minFrames: 1, maxFrames: 1, defaultFrames: 1, multiFrame: false }),
]);

export function postFormatOption(format: PostFormat | undefined): PostFormatOption {
  return POST_FORMAT_OPTIONS.find(option => option.id === format) ?? POST_FORMAT_OPTIONS[0];
}

export function clampFrameCount(format: PostFormat, count?: number): number {
  const option = postFormatOption(format);
  if (typeof count !== 'number' || !Number.isSafeInteger(count)) return option.defaultFrames;
  return Math.max(option.minFrames, Math.min(option.maxFrames, count));
}

export function defaultFrameRole(format: PostFormat, position: number, total: number): string {
  if (format === 'collection') {
    if (position === 1) return 'abertura';
    if (position === total) return 'fechamento';
    return position === 2 ? 'detalhe' : `cena ${position}`;
  }
  if (position === 1) return 'capa';
  if (position === total) return 'fechamento';
  if (position === 2) return 'problema';
  return `passo ${position - 2}`;
}

export function buildDefaultFrames(format: PostFormat, count?: number, seedHeadline = ''): PieceFrame[] | undefined {
  const option = postFormatOption(format);
  if (!option.multiFrame) return undefined;
  const total = clampFrameCount(format, count);
  return Array.from({ length: total }, (_, index) => ({
    id: crypto.randomUUID(),
    position: index + 1,
    role: defaultFrameRole(format, index + 1, total),
    headline: index === 0 ? seedHeadline : '',
    body: '',
    visualCue: '',
    assetId: null,
  }));
}

export function resizeFrames(format: PostFormat, existing: readonly PieceFrame[] | undefined, count: number, seedHeadline = ''): PieceFrame[] | undefined {
  const option = postFormatOption(format);
  if (!option.multiFrame) return undefined;
  const total = clampFrameCount(format, count);
  const current = [...(existing ?? [])].sort((a, b) => a.position - b.position);
  if (current.length === 0) return buildDefaultFrames(format, total, seedHeadline);
  const kept = current.slice(0, total).map((frame, index) => ({ ...frame, position: index + 1 }));
  while (kept.length < total) {
    const position = kept.length + 1;
    kept.push({
      id: crypto.randomUUID(),
      position,
      role: defaultFrameRole(format, position, total),
      headline: '',
      body: '',
      visualCue: '',
      assetId: null,
    });
  }
  return kept;
}
