import type { Brief, PieceContent } from './studio-domain.ts';

export type OptionalArtworkField = 'price' | 'date';

/** Suggest only labels; the creator or assistant supplies any actual text. */
export function suggestedArtworkFields(brief: Brief, content: PieceContent): OptionalArtworkField[] {
  const context = Object.values(brief).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const result: OptionalArtworkField[] = [];
  if (content.price.trim() || /(?:\b(?:preco|valor|investimento|ingresso|inscricao paga)\b|\br\$)/.test(context)) result.push('price');
  if (content.date.trim() || /\b(data|prazo|evento|aula ao vivo|webinar|workshop|oficina|conferencia|encontro|lancamento)\b/.test(context)) result.push('date');
  return result;
}
