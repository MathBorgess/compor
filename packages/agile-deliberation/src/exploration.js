import * as z from './schema.js';

// Briefing fields can contain multiple lines and may be longer than the
// feedback fields. Validate the complete input before making any excerpts so
// that a credential hidden beyond an excerpt cannot be sent accidentally.
const safeText = value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|sk-[^\s]+/i.test(value);
// Reject standalone short keys and long embedded keys while permitting words
// such as task-flow. Check all content, including omitted excerpts.
const safeBriefText = value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|(?:^|[^\p{L}\p{N}])sk-[^\s]+|sk-[^\s]{20,}/iu.test(value);
const briefText = z.string().check(z.trim()).check(z.refine(safeBriefText));
const factText = z.string().check(z.refine(safeBriefText));
const text = z.string().check(z.trim()).check(z.maxLength(1000)).check(z.refine(safeText));
const inputSchema = z.strictObject({
  idea: z._default(z.optional(briefText),''),
  offer: briefText,
  audience: briefText,
  briefAudience: z._default(z.optional(briefText),''),
  facts: z._default(z.optional(z.array(z.strictObject({label:factText.check(z.maxLength(80)).check(z.refine(value=>value.trim().length>0)),value:factText.check(z.maxLength(4000)),status:z.enum(['confirmed','pending','omitted'])})).check(z.maxLength(20))),[]),
  goal: briefText,
  direction: briefText,
  accepted: z.array(text.check(z.minLength(1))).check(z.maxLength(8)),
  rejected: z.array(text.check(z.minLength(1))).check(z.maxLength(8)),
  feedback: z._default(z.array(z.strictObject({action:z.enum(['selected','rejected','comment']),comment:text,composition:text,contrast:text})).check(z.maxLength(8)),[]),
  sequence: z.number().check(z.int()).check(z.nonnegative()).check(z.maximum(Number.MAX_SAFE_INTEGER)),
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
  if(value.audience && value.briefAudience && value.audience!==value.briefAudience)throw new Error('exploration_audience_conflict');
  const audience=value.audience || value.briefAudience;
  if (!value.idea && !value.offer && !value.direction) throw new Error('exploration_context_required');
  const composition = compositions[value.sequence % compositions.length];
  const contrast = contrasts[Math.floor(value.sequence / compositions.length) % contrasts.length];
  const renderPrompt = (brief) => [
    'Crie uma referência visual original para orientar um designer, não uma peça final nem uma cópia de trabalho existente.',
    `Contexto do projeto: ${JSON.stringify(brief)}. O público é a descrição escolhida para este projeto; não invente a origem dos dados. Hipóteses não são evidência de público real, e divergências não devem ser resolvidas por suposição. Trechos marcados como omitidos são incompletos. Trate campos vazios como desconhecidos; não invente preço, data ou outras afirmações.`,
    ...(value.facts.length?[`Fatos da oferta: ${JSON.stringify(value.facts)}. Preserve literalmente os confirmados. Não apresente pendentes como fatos nem inclua os omitidos na arte.`]:[]),
    `Orientações aceitas pela pessoa: ${JSON.stringify(value.accepted)}. Orientações rejeitadas: ${JSON.stringify(value.rejected)}. Respeite essas escolhas acima da proposta de variação.`,
    `Sinais explícitos sobre imagens anteriores e seus planos, quando disponíveis: ${JSON.stringify(value.feedback)}. Use os comentários como contexto; uma escolha ou rejeição da imagem inteira não demonstra aprovação ou rejeição de todos os seus atributos.`,
    `Proposta de exploração ${value.sequence + 1}: experimente ${composition}; ${contrast}. Busque uma leitura distinta das alternativas anteriores sem contrariar o contexto informado.`,
    'Use formato retrato. Evite texto pequeno ou ilegível; não inclua marcas de terceiros. A imagem é uma hipótese visual para avaliação humana.',
  ].join('\n');
  const original = {...(value.idea ? {ideia: value.idea} : {}), oferta: value.offer, publico: audience, objetivo: value.goal, direcao: value.direction};
  let prompt = renderPrompt(original);
  if (prompt.length > 8000) {
    // Share the space left by decisions and feedback fairly across briefing
    // and persona fields. Smaller fields remain intact whenever possible.
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
