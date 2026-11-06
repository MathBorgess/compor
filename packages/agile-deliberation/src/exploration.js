import { z } from 'zod';

// Briefing fields can contain multiple lines and may be longer than the
// feedback fields. Validate the complete input before making any excerpts so
// that a credential hidden beyond an excerpt cannot be sent accidentally.
const safeText = value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|sk-[^\s]+/i.test(value);
const briefText = z.string().trim().refine(safeText);
const text = z.string().trim().max(1000).refine(safeText);
const inputSchema = z.strictObject({
  offer: briefText,
  audience: briefText,
  goal: briefText,
  direction: briefText,
  accepted: z.array(text.min(1)).max(8),
  rejected: z.array(text.min(1)).max(8),
  feedback: z.array(z.strictObject({action:z.enum(['selected','rejected','comment']),comment:text,composition:text,contrast:text})).max(8).default([]),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

const compositions = [
  'uma composição editorial assimétrica com foco único',
  'um conjunto modular com hierarquia nítida',
  'uma imagem principal ampla e áreas de respiro',
  'uma composição tipográfica com ritmo e contraste',
  'um arranjo em camadas com profundidade sutil',
  'uma abordagem geométrica de poucos elementos',
  'uma cena tátil com materiais e iluminação suaves',
  'uma ilustração conceitual com formas orgânicas',
];

const omitted = ' [trecho omitido]';

// Limit the JSON representation, including escaped newlines and quotes, rather
// than the source string length. Never split a Unicode code point.
function excerpt(value, limit) {
  if (JSON.stringify(value).length <= limit) return value;
  const characters = Array.from(value);
  let low = 0, high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JSON.stringify(characters.slice(0, middle).join('') + omitted).length <= limit) low = middle;
    else high = middle - 1;
  }
  return characters.slice(0, low).join('') + omitted;
}
const contrasts = [
  'concentre o contraste no ponto principal',
  'priorize um ritmo calmo e espaço negativo',
  'explore uma relação de escala inesperada',
  'experimente uma divisão dinâmica do espaço',
  'crie profundidade por sobreposição e transparência',
  'trabalhe com repetição, quebra de ritmo e alinhamento',
  'explore uma perspectiva próxima do cotidiano',
  'contraponha uma área densa a outra simples',
  'encontre um gesto visual claro e memorável',
];

/** Returns a prompt proposal, not a claim about learned preferences or audience response. */
export function createExplorationPrompt(input) {
  const value = inputSchema.parse(input);
  if (!value.offer && !value.direction) throw new Error('exploration_context_required');
  const composition = compositions[value.sequence % compositions.length];
  const contrast = contrasts[Math.floor(value.sequence / compositions.length) % contrasts.length];
  const renderPrompt = (brief) => [
    'Crie uma referência visual original para orientar um designer, não uma peça final nem uma cópia de trabalho existente.',
    `Contexto fornecido pela pessoa: ${JSON.stringify(brief)}. Trechos marcados como omitidos são incompletos. Trate campos vazios como desconhecidos; não invente preço, data ou outras afirmações.`,
    `Orientações aceitas pela pessoa: ${JSON.stringify(value.accepted)}. Orientações rejeitadas: ${JSON.stringify(value.rejected)}. Respeite essas escolhas acima da proposta de variação.`,
    `Sinais explícitos sobre imagens anteriores e seus planos, quando disponíveis: ${JSON.stringify(value.feedback)}. Use os comentários como contexto; uma escolha ou rejeição da imagem inteira não demonstra aprovação ou rejeição de todos os seus atributos.`,
    `Proposta de exploração ${value.sequence + 1}: experimente ${composition}; ${contrast}. Busque uma leitura distinta das alternativas anteriores sem contrariar o contexto informado.`,
    'Use formato retrato. Evite texto pequeno ou ilegível; não inclua marcas de terceiros. A imagem é uma hipótese visual para avaliação humana.',
  ].join('\n');
  const original = {oferta: value.offer, publico: value.audience, objetivo: value.goal, direcao: value.direction};
  let prompt = renderPrompt(original);
  if (prompt.length > 8000) {
    // Share the space left by decisions and feedback fairly across the four
    // briefing fields. Smaller fields remain intact whenever possible.
    const renderWithLimit = limit => renderPrompt(Object.fromEntries(Object.entries(original).map(([key, field]) => [key, excerpt(field, limit)])));
    let low = JSON.stringify(omitted).length, high = 8000;
    if (renderWithLimit(low).length > 8000) throw new Error('exploration_context_too_large');
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (renderWithLimit(middle).length <= 8000) low = middle;
      else high = middle - 1;
    }
    prompt = renderWithLimit(low);
  }
  if (prompt.length > 8000) throw new Error('exploration_context_too_large');
  return {prompt, composition, contrast};
}
