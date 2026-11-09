export const briefPromptIds = ["produto", "persona", "objetivo", "personalidade", "fatos", "referencias", "preco", "data"] as const;
export type BriefPromptId = typeof briefPromptIds[number];
export type BriefDecisionId = "produto" | "persona" | "objetivo" | "personalidade";
export const briefClaimKinds = ["promise", "result", "offer", "fact"] as const;
export type BriefClaimKind = typeof briefClaimKinds[number];
export interface BriefClaim { id: string; text: string; origin: "informado" | "sugerido"; kind: BriefClaimKind }
export interface BriefEntry {
  text: string;
  origin: "informado" | "sugerido";
  skipped?: boolean;
  /** Chosen preference. Embedded claims stay on `claims` and are not this text. */
  direction?: string;
  claims?: BriefClaim[];
}
export type BriefRecord = Partial<Record<BriefPromptId, BriefEntry>>;
export interface BriefOptionClaim { id: string; text: string; kind: BriefClaimKind }
export interface BriefOption { id: string; title: string; direction: string; text: string; claims: readonly BriefOptionClaim[] }
export interface BriefDecision {
  id: BriefDecisionId; required: boolean; field: "offer" | "persona" | "action" | "direction";
  question: string; limit: string; options: readonly BriefOption[];
}
export interface BriefOptionalPrompt {
  id: Exclude<BriefPromptId, BriefDecisionId>; required?: false; field?: "audience";
  skip: string; question: string;
}
export type BriefPrompt = ({ kind: "decision" } & BriefDecision) | ({ kind: "optional" } & BriefOptionalPrompt);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validBriefText(value: unknown, id: string): value is string {
  return typeof value === "string" && value.length <= (id === "persona" ? 2000 : 4000) && !/sk-[A-Za-z0-9_-]{20,}/.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function parseClaims(value: unknown, id: string): BriefClaim[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error("Registro de briefing inválido");
  return value.map((claim) => {
    if (!object(claim) || !exactKeys(claim, ["id", "text", "origin", "kind"])) throw new Error("Registro de briefing inválido");
    if (typeof claim.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(claim.id)) throw new Error("Registro de briefing inválido");
    if (!validBriefText(claim.text, id) || !claim.text.trim()) throw new Error("Registro de briefing inválido");
    if (claim.origin !== "informado" && claim.origin !== "sugerido") throw new Error("Registro de briefing inválido");
    const kind = briefClaimKinds.find((item) => item === claim.kind);
    if (!kind) throw new Error("Registro de briefing inválido");
    return { id: claim.id, text: claim.text, origin: claim.origin, kind };
  });
}

/** Small storage boundary: importing the interview in the client does not import server schemas. */
export const briefRecordSchema = {
  parse(value: unknown): BriefRecord {
    if (!object(value)) throw new Error("Registro de briefing inválido");
    const record: BriefRecord = {};
    for (const [id, entry] of Object.entries(value)) {
      if (!briefPromptIds.some((key) => key === id) || !object(entry) ||
          Object.keys(entry).some((key) => !["text", "origin", "skipped", "direction", "claims"].includes(key)) ||
          !validBriefText(entry.text, id) ||
          (entry.origin !== "informado" && entry.origin !== "sugerido") ||
          (entry.skipped !== undefined && typeof entry.skipped !== "boolean") ||
          (entry.direction !== undefined && (!validBriefText(entry.direction, id) || !entry.direction.trim()))) throw new Error("Registro de briefing inválido");
      const claims = entry.claims === undefined ? undefined : parseClaims(entry.claims, id);
      record[id as BriefPromptId] = {
        text: entry.text,
        origin: entry.origin,
        ...(entry.skipped === undefined ? {} : { skipped: entry.skipped }),
        ...(entry.direction === undefined ? {} : { direction: entry.direction }),
        ...(claims === undefined ? {} : { claims }),
      };
    }
    return record;
  },
  safeParse(value: unknown): { success: true; data: BriefRecord } | { success: false; error: Error } {
    try { return { success: true, data: this.parse(value) }; }
    catch { return { success: false, error: new Error("Registro de briefing inválido") }; }
  },
};

/** Chat-first brief. Suggested text is not a fact and must not be copied into the art. */
export const briefDecisions: readonly BriefDecision[] = [
  {
    id: "produto",
    required: true,
    field: "offer",
    question: "O que você quer divulgar?",
    limit: "Produto é o que a pessoa compra, não o texto do post.",
    options: [
      { id: "aula", title: "Aula curta", direction: "Aula curta", text: "Uma aula curta para organizar a rotina.", claims: [{ id: "aula-oferta", kind: "offer", text: "Uma aula curta para organizar a rotina." }, { id: "aula-resultado", kind: "result", text: "A rotina fica organizada." }] },
      { id: "mentoria", title: "Mentoria", direction: "Mentoria", text: "Uma mentoria em encontros para quem está começando.", claims: [{ id: "mentoria-promessa", kind: "promise", text: "Quem começa sai do zero." }] },
      { id: "material", title: "Material prático", direction: "Material prático", text: "Um material prático com exercícios guiados.", claims: [{ id: "material-oferta", kind: "offer", text: "Os exercícios já vêm guiados." }] },
    ],
  },
  {
    id: "persona",
    required: true,
    field: "persona",
    question: "Para quem é essa oferta?",
    limit: "Persona é quem compra, não quem usa o Compor.",
    options: [
      { id: "inicio", title: "Pessoas interessadas em aprender", direction: "Pessoas interessadas em aprender", text: "Pessoas interessadas em aprender", claims: [{ id: "inicio-fato", kind: "fact", text: "Elas começam sem método." }] },
      { id: "rotina", title: "Quem tenta criar uma rotina", direction: "Quem tenta criar uma rotina", text: "Quem tenta criar uma rotina e perde o fio da meada.", claims: [{ id: "rotina-fato", kind: "fact", text: "Perde o fio da meada." }] },
      { id: "trabalho", title: "Quem estuda depois do trabalho", direction: "Quem estuda depois do trabalho", text: "Quem só consegue estudar depois do trabalho.", claims: [{ id: "trabalho-fato", kind: "fact", text: "Só estuda depois do expediente." }] },
    ],
  },
  {
    id: "objetivo",
    required: true,
    field: "action",
    question: "Depois de ver o post, o que a pessoa deve fazer?",
    limit: "Objetivo é a ação esperada, não um slogan.",
    options: [
      { id: "conhecer", title: "Pedir para conhecer", direction: "Pedir para conhecer", text: "Pedir para conhecer a aula.", claims: [{ id: "conhecer-promessa", kind: "promise", text: "A aula responde na hora." }] },
      { id: "lista", title: "Entrar na lista", direction: "Entrar na lista", text: "Entrar na lista da próxima turma.", claims: [{ id: "lista-resultado", kind: "result", text: "A vaga fica garantida." }] },
      { id: "comecar", title: "Começar hoje", direction: "Começar hoje", text: "Começar o primeiro exercício hoje.", claims: [{ id: "comecar-resultado", kind: "result", text: "O primeiro exercício sai no mesmo dia." }] },
    ],
  },
  {
    id: "personalidade",
    required: false,
    field: "direction",
    question: "Como você costuma falar com esse público?",
    limit: "Personalidade é o tom, não um fato da oferta.",
    options: [
      { id: "direto", title: "Direto e calmo", direction: "Direto e calmo", text: "Direto, calmo e sem pressa.", claims: [{ id: "direto-fato", kind: "fact", text: "O texto não usa pressa." }] },
      { id: "proximo", title: "Próximo", direction: "Próximo", text: "Próximo, como quem explica para um amigo.", claims: [{ id: "proximo-fato", kind: "fact", text: "O texto fala como um amigo." }] },
      { id: "firme", title: "Firme", direction: "Firme", text: "Firme, com poucas palavras e um convite claro.", claims: [{ id: "firme-promessa", kind: "promise", text: "O convite cabe em uma frase." }] },
    ],
  },
];

export const optionalPrompts: readonly BriefOptionalPrompt[] = [
  { id: "fatos", field: "audience", skip: "fatos", question: "Tem algum fato que precisa entrar?" },
  { id: "referencias", skip: "referências", question: "Tem uma referência para guardar?" },
  { id: "preco", skip: "preço", question: "Quer informar um preço?" },
  { id: "data", skip: "data", question: "Quer informar uma data?" },
];

export function emptyBriefRecord(): BriefRecord {
  return {};
}

export const adjustmentQuestion = "Qual se aproxima do que você quer, e o que mudaria?";

const promptCues: Partial<Record<BriefPromptId, string[]>> = {
  persona: ["para quem", "pessoas interessadas", "publico", "público", "quem compra"],
  objetivo: ["deve fazer", "pedir para conhecer", "entrar na lista", "começar hoje", "comecar hoje"],
  personalidade: ["tom de voz", "falar com", "direto e calmo", "sem pressa"],
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function coveredText(answer: string, prompt: BriefDecision | BriefOptionalPrompt) {
  const haystack = normalize(answer);
  const option = ("options" in prompt ? prompt.options : []).find((item) => {
    const title = normalize(item.title);
    const body = normalize(item.text);
    return (title.length >= 8 && haystack.includes(title)) || (body.length >= 16 && haystack.includes(body));
  });
  if (option) return answer.trim();
  const cues = promptCues[prompt.id] ?? [];
  if (cues.some((cue) => haystack.includes(normalize(cue)))) return answer.trim();
  return "";
}

export function chooseOption(record: BriefRecord, id: BriefDecisionId, option: BriefOption): BriefRecord {
  return briefRecordSchema.parse({
    ...record,
    [id]: {
      text: option.direction,
      origin: "informado",
      direction: option.direction,
      claims: option.claims.map((claim) => ({ id: claim.id, text: claim.text, origin: "sugerido", kind: claim.kind })),
    },
  });
}

function clauses(text: string) {
  const parts = text.match(/[^!?.\n;]+[!?.\n;]?/g) ?? [];
  return parts.map((piece) => piece.trim()).filter(Boolean).map((body) => ({ body, question: body.endsWith("?") }));
}

/** A claim becomes informed only when a clause states it without denying or asking. */
export function affirmsClaim(message: string, claim: string) {
  const needle = normalize(claim);
  if (needle.length < 8) return false;
  return clauses(message).some((clause) => {
    if (clause.question) return false;
    const body = normalize(clause.body);
    if (!body.includes(needle)) return false;
    const outside = body.replace(needle, " ");
    return !/\b(?:nao|nunca|jamais|nem|discordo|falso|errado|duvido)\b/.test(outside);
  });
}

export function confirmMentionedClaims(record: BriefRecord, text: string): BriefRecord {
  let changed = false;
  const next: BriefRecord = { ...record };
  for (const [id, field] of Object.entries(record) as [BriefPromptId, BriefEntry][]) {
    if (!field?.claims?.length) continue;
    const claims = field.claims.map((claim) => {
      if (claim.origin === "sugerido" && affirmsClaim(text, claim.text)) {
        changed = true;
        return { ...claim, origin: "informado" as const };
      }
      return claim;
    });
    next[id] = { ...field, claims };
  }
  return changed ? briefRecordSchema.parse(next) : record;
}

export function answerWithReuse(record: BriefRecord, id: BriefPromptId, text: string) {
  let next = confirmMentionedClaims(answerPrompt(record, id, text), text);
  const prompts = [...briefDecisions, ...optionalPrompts];
  const start = prompts.findIndex((item) => item.id === id);
  const reused: BriefPromptId[] = [];
  for (const prompt of prompts.slice(start + 1)) {
    if (next[prompt.id]) continue;
    const covered = coveredText(text, prompt);
    if (!covered || !validBriefText(covered, prompt.id)) continue;
    next = answerPrompt(next, prompt.id, covered);
    reused.push(prompt.id);
  }
  return { record: next, reused };
}

/** Optional details are asked only when a caller identifies an ambiguity or the creator requests them. */
export function nextPrompt(record: BriefRecord, requested: readonly BriefPromptId[] = []): BriefPrompt | null {
  const decision = briefDecisions.find((item) => !record[item.id] && (item.required || requested.includes(item.id)));
  if (decision) return { kind: "decision", ...decision };
  const optional = optionalPrompts.find((item) => !record[item.id] && requested.includes(item.id));
  return optional ? { kind: "optional", ...optional } : null;
}

export function informedText(entry: BriefEntry | undefined) {
  return entry?.origin === "informado" && entry.text.trim() ? entry.text.trim() : "";
}

/** Only informed price and date may be treated as art facts. Direction and embedded claims stay out. */
export function artFacts(record: BriefRecord) {
  return {
    headline: "",
    price: informedText(record.preco),
    date: informedText(record.data),
  };
}

/** Preference written to the project. Embedded claims stay out of these fields. */
export function briefPatch(record: BriefRecord) {
  const preference = (entry: BriefEntry | undefined) => {
    if (!entry || entry.skipped || entry.origin !== "informado") return "";
    return (entry.direction ?? entry.text).trim();
  };
  return {
    offer: preference(record.produto),
    action: preference(record.objetivo),
    direction: preference(record.personalidade),
    persona: preference(record.persona),
  };
}

const marketProof = /phoenix|ndcg|validado|comprovado|probabilid|\bscores?\b/i;

/** User-facing reference copy. Calibration status stays the neutral "calibrando…". */
export function showsMarketProof(value: string) {
  return marketProof.test(value);
}

export function answerPrompt(record: BriefRecord, id: BriefPromptId, text: string, origin: BriefEntry["origin"] = "informado"): BriefRecord {
  const value = String(text ?? "").trim();
  if (origin !== "informado" && origin !== "sugerido") throw Error("origem inválida");
  return briefRecordSchema.parse({ ...record, [id]: { text: value, origin } });
}

export function skipPrompt(record: BriefRecord, id: BriefPromptId): BriefRecord {
  return briefRecordSchema.parse({ ...record, [id]: { text: "", origin: "informado", skipped: true } });
}

export function recordFromStudio(state: unknown): BriefRecord {
  const record: BriefRecord = {};
  if (!object(state)) return record;
  const brief = object(state.brief) ? state.brief : {};
  const persona = object(state.persona) ? state.persona : {};
  const entries: [BriefPromptId, unknown][] = [
    ["produto", brief.offer], ["persona", persona.audience], ["objetivo", brief.action],
    ["personalidade", brief.direction], ["fatos", brief.audience],
  ];
  for (const [id, text] of entries) {
    if (validBriefText(text, id) && text.trim()) record[id] = { text, origin: "informado" };
  }
  return record;
}

export function previewImage(option: BriefOption) {
  const title = option.title.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400"><rect width="320" height="400" fill="#F4F0E5"/><rect x="28" y="28" width="264" height="344" rx="12" fill="#ffffff" stroke="#123EAB" stroke-width="3"/><text x="44" y="88" fill="#123EAB" font-family="sans-serif" font-size="22" font-weight="700">${title}</text><text x="44" y="140" fill="#2C2D2F" font-family="sans-serif" font-size="16">exploração · IA</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
