/** Chat-first brief. Suggested text is not a fact and must not be copied into the art. */
export const briefDecisions = [
  {
    id: "produto",
    required: true,
    field: "offer",
    question: "O que você quer divulgar?",
    limit: "Produto é o que a pessoa compra, não o texto do post.",
    options: [
      { id: "aula", title: "Aula curta", text: "Uma aula curta para organizar a rotina." },
      { id: "mentoria", title: "Mentoria", text: "Uma mentoria em encontros para quem está começando." },
      { id: "material", title: "Material prático", text: "Um material prático com exercícios guiados." },
    ],
  },
  {
    id: "persona",
    required: true,
    field: "persona",
    question: "Para quem é essa oferta?",
    limit: "Persona é quem compra, não quem usa o Compor.",
    options: [
      { id: "inicio", title: "Pessoas interessadas em aprender", text: "Pessoas interessadas em aprender" },
      { id: "rotina", title: "Quem tenta criar uma rotina", text: "Quem tenta criar uma rotina e perde o fio da meada." },
      { id: "trabalho", title: "Quem estuda depois do trabalho", text: "Quem só consegue estudar depois do trabalho." },
    ],
  },
  {
    id: "objetivo",
    required: true,
    field: "action",
    question: "Depois de ver o post, o que a pessoa deve fazer?",
    limit: "Objetivo é a ação esperada, não um slogan.",
    options: [
      { id: "conhecer", title: "Pedir para conhecer", text: "Pedir para conhecer a aula." },
      { id: "lista", title: "Entrar na lista", text: "Entrar na lista da próxima turma." },
      { id: "comecar", title: "Começar hoje", text: "Começar o primeiro exercício hoje." },
    ],
  },
  {
    id: "personalidade",
    required: false,
    field: "direction",
    question: "Como você costuma falar com esse público?",
    limit: "Personalidade é o tom, não um fato da oferta.",
    options: [
      { id: "direto", title: "Direto e calmo", text: "Direto, calmo e sem pressa." },
      { id: "proximo", title: "Próximo", text: "Próximo, como quem explica para um amigo." },
      { id: "firme", title: "Firme", text: "Firme, com poucas palavras e um convite claro." },
    ],
  },
];

export const optionalPrompts = [
  { id: "fatos", field: "audience", skip: "fatos", question: "Tem algum fato que precisa entrar?" },
  { id: "referencias", skip: "referências", question: "Tem uma referência para guardar?" },
  { id: "preco", skip: "preço", question: "Quer informar um preço?" },
  { id: "data", skip: "data", question: "Quer informar uma data?" },
];

export function emptyBriefRecord() {
  return {};
}

export const adjustmentQuestion = "Qual se aproxima do que você quer, e o que mudaria?";

const promptCues = {
  persona: ["para quem", "pessoas interessadas", "publico", "público", "quem compra"],
  objetivo: ["deve fazer", "pedir para conhecer", "entrar na lista", "começar hoje", "comecar hoje"],
  personalidade: ["tom de voz", "falar com", "direto e calmo", "sem pressa"],
  preco: ["r$", "preço", "preco"],
  data: ["data do", "em novembro", "no dia"],
};

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function coveredText(answer, prompt) {
  const haystack = normalize(answer);
  const option = prompt.options?.find((item) => {
    const title = normalize(item.title);
    const body = normalize(item.text);
    return (title.length >= 8 && haystack.includes(title)) || (body.length >= 16 && haystack.includes(body));
  });
  if (option) return option.text;
  const cues = promptCues[prompt.id] ?? [];
  if (cues.some((cue) => haystack.includes(normalize(cue)))) return answer.trim();
  return "";
}

export function answerWithReuse(record, id, text) {
  let next = answerPrompt(record, id, text);
  const prompts = [...briefDecisions, ...optionalPrompts];
  const start = prompts.findIndex((item) => item.id === id);
  const reused = [];
  for (const prompt of prompts.slice(start + 1)) {
    if (next[prompt.id]) continue;
    const covered = coveredText(text, prompt);
    if (!covered) continue;
    next = answerPrompt(next, prompt.id, covered);
    reused.push(prompt.id);
  }
  return { record: next, reused };
}

export function nextPrompt(record) {
  const decision = briefDecisions.find((item) => !record[item.id]);
  if (decision) return { kind: "decision", ...decision };
  return optionalPrompts.find((item) => !record[item.id]) ?? null;
}

export function informedText(entry) {
  return entry?.origin === "informado" && entry.text.trim() ? entry.text.trim() : "";
}

/** Only informed text may be treated as a fact. Suggested text stays out of the art. */
export function artFacts(record) {
  return {
    headline: informedText(record.produto),
    price: informedText(record.preco),
    date: informedText(record.data),
  };
}

export function answerPrompt(record, id, text, origin = "informado") {
  const value = String(text ?? "").trim();
  if (origin !== "informado" && origin !== "sugerido") throw Error("origem inválida");
  return { ...record, [id]: { text: value, origin } };
}

export function skipPrompt(record, id) {
  return { ...record, [id]: { text: "", origin: "informado", skipped: true } };
}

export function recordFromStudio(state) {
  const record = {};
  if (state?.brief?.offer) record.produto = { text: state.brief.offer, origin: "informado" };
  if (state?.persona?.audience) record.persona = { text: state.persona.audience, origin: "informado" };
  if (state?.brief?.action) record.objetivo = { text: state.brief.action, origin: "informado" };
  if (state?.brief?.direction) record.personalidade = { text: state.brief.direction, origin: "informado" };
  if (state?.brief?.audience) record.fatos = { text: state.brief.audience, origin: "informado" };
  return record;
}

export function previewImage(option) {
  const title = option.title.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400" viewBox="0 0 320 400"><rect width="320" height="400" fill="#F4F0E5"/><rect x="28" y="28" width="264" height="344" rx="12" fill="#ffffff" stroke="#123EAB" stroke-width="3"/><text x="44" y="88" fill="#123EAB" font-family="sans-serif" font-size="22" font-weight="700">${title}</text><text x="44" y="140" fill="#2C2D2F" font-family="sans-serif" font-size="16">Prévia da opção</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
