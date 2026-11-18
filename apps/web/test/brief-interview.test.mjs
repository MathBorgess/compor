import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { answerPrompt, answerWithReuse, artFacts, briefDecisions, briefPatch, briefRecordSchema, chooseOption, confirmMentionedClaims, nextPrompt, recordFromStudio, showsMarketProof, skipPrompt } from "../lib/brief-interview.ts";

test("a entrevista reaproveita o brief e pergunta opcionais somente quando solicitados", () => {
  let record = recordFromStudio({ brief: { offer: "Aula de planilhas", action: "Conhecer a aula" }, persona: { audience: "Quem estuda após o trabalho" } });
  assert.equal(nextPrompt(record), null);
  assert.equal(nextPrompt(record, ["personalidade"]).id, "personalidade");
  record = skipPrompt(record, "personalidade");
  assert.equal(nextPrompt(record, ["personalidade"]), null);
  assert.equal(nextPrompt(record, ["preco"]).id, "preco");
  assert.equal(nextPrompt({}).id, "produto");
});

test("selecionar uma sugestão ou informar a oferta não cria uma headline factual", () => {
  let record = answerPrompt({}, "produto", "Aula fictícia", "sugerido");
  assert.deepEqual(artFacts(record), { headline: "", price: "", date: "" });
  record = answerPrompt(record, "produto", "Aula informada pelo criador");
  record = answerPrompt(record, "preco", "R$ 49");
  record = answerPrompt(record, "data", "10 de novembro", "sugerido");
  assert.deepEqual(artFacts(record), { headline: "", price: "R$ 49", date: "" });
});

test("a reutilização preserva as palavras do criador, não o exemplo sugerido", () => {
  const answer = "Uma aula para pessoas interessadas em aprender. O post deve pedir para conhecer a aula.";
  const { record, reused } = answerWithReuse({}, "produto", answer);
  assert.deepEqual(reused, ["persona", "objetivo"]);
  assert.equal(record.persona.text, answer);
  assert.equal(record.objetivo.text, answer);
  assert.equal(nextPrompt(record), null);
  const unchanged = answerWithReuse(answerPrompt({}, "persona", "Público já informado"), "produto", answer);
  assert.equal(unchanged.record.persona.text, "Público já informado");
});

test("a persistência rejeita campos, origens e tipos desconhecidos", () => {
  for (const invalid of [null, [], { headline: { text: "x", origin: "informado" } },
    { produto: { text: "x", origin: "observado" } }, { produto: { text: 3, origin: "informado" } },
    { produto: { text: "x", origin: "informado", admin: true } },
    { produto: { text: "x".repeat(4001), origin: "informado" } }, { produto: { text: "x", origin: "informado", skipped: "yes" } }]) {
    assert.equal(briefRecordSchema.safeParse(invalid).success, false);
  }
  assert.deepEqual(briefRecordSchema.parse({ produto: { text: "Oferta", origin: "informado" } }), { produto: { text: "Oferta", origin: "informado" } });
  assert.deepEqual(recordFromStudio({ brief: { offer: { text: "untrusted" } }, persona: { audience: 12 } }), {});
});


test("mencionar preço ou data no briefing não os confirma como fatos literais", () => {
  const { record } = answerWithReuse({}, "produto", "Uma aula, sem preço e sem data do evento no post.");
  assert.equal(record.preco, undefined);
  assert.equal(record.data, undefined);
  assert.deepEqual(artFacts(record), { headline: "", price: "", date: "" });
});


test("o registro rejeita credenciais copiadas e respeita o limite da persona", () => {
  const syntheticKey = "sk-" + "test_fixture_not_a_real_key";
  for (const id of ["produto", "persona", "fatos", "referencias"]) {
    assert.equal(briefRecordSchema.safeParse({ [id]: { text: syntheticKey, origin: "informado" } }).success, false);
    assert.throws(() => answerPrompt({}, id, syntheticKey));
  }
  assert.equal(briefRecordSchema.safeParse({ persona: { text: "a".repeat(2001), origin: "informado" } }).success, false);
  assert.equal(briefRecordSchema.safeParse({ persona: { text: "a".repeat(2000), origin: "informado" } }).success, true);
  assert.deepEqual(recordFromStudio({ brief: { offer: syntheticKey }, persona: { audience: "a".repeat(2001) } }), {});
  const answer = "Para pessoas interessadas em aprender. " + "a".repeat(2100);
  const reused = answerWithReuse({}, "produto", answer);
  assert.equal(reused.record.produto.text, answer);
  assert.equal(reused.record.persona, undefined);
  assert.equal(nextPrompt(reused.record).id, "persona");
});

test("Escolher não promove alegações embutidas na opção", () => {
  const option = briefDecisions.find((item) => item.id === "produto").options[0];
  const chosen = chooseOption({}, "produto", option);
  assert.equal(chosen.produto.direction, "Aula curta");
  assert.equal(chosen.produto.text, "Aula curta");
  assert.equal(chosen.produto.origin, "informado");
  assert.ok(chosen.produto.claims.length >= 2);
  assert.ok(chosen.produto.claims.every((claim) => claim.origin === "sugerido"));
  assert.deepEqual(artFacts(chosen), { headline: "", price: "", date: "" });
  assert.deepEqual(briefPatch(chosen), { offer: "Aula curta", action: "", direction: "", persona: "" });
  const confirmed = confirmMentionedClaims(chosen, "A rotina fica organizada.");
  assert.equal(confirmed.produto.claims.find((claim) => claim.kind === "result").origin, "informado");
  assert.equal(confirmed.produto.claims.find((claim) => claim.kind === "offer").origin, "sugerido");
  assert.equal(briefPatch(confirmed).offer, "Aula curta");
  assert.deepEqual(artFacts(confirmed), { headline: "", price: "", date: "" });
  const rejected = answerWithReuse(chosen, "persona", "Pessoas ocupadas. Não é verdade que a rotina fica organizada.");
  assert.equal(rejected.record.persona.text, "Pessoas ocupadas. Não é verdade que a rotina fica organizada.");
  assert.equal(rejected.record.produto.claims.find((claim) => claim.kind === "result").origin, "sugerido");
  const asked = confirmMentionedClaims(chosen, "A rotina fica organizada?");
  assert.equal(asked.produto.claims.find((claim) => claim.kind === "result").origin, "sugerido");
  const offerConfirmed = confirmMentionedClaims(chosen, "Uma aula curta para organizar a rotina.");
  assert.equal(offerConfirmed.produto.claims.find((claim) => claim.kind === "offer").origin, "informado");
  assert.equal(artFacts(offerConfirmed).headline, "");
  assert.equal(briefPatch(offerConfirmed).offer.includes("organizada"), false);
  assert.equal(JSON.stringify(artFacts(offerConfirmed)).includes("organizada"), false);
});

async function uiSources(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await uiSources(path)));
    else if (/\.(tsx|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test("a interface não apresenta Phoenix, nota ou validação", async () => {
  const forbidden = /\b(Phoenix|validado|comprovado|NDCG|ndcg|probabilidade|probabilidades|calibrado)\b|\bscores?\b/i;
  const hits = [];
  for (const path of await uiSources(fileURLToPath(new URL("../studio/", import.meta.url)))) {
    const lines = (await readFile(path, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (forbidden.test(line)) hits.push(`${path}:${index + 1}:${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
  const interview = await readFile(new URL("../studio/brief-interview.tsx", import.meta.url), "utf8");
  assert.match(interview, /role="status">calibrando…/);
  assert.match(interview, /calibrating \? "calibrando…"/);
  assert.match(interview, /BRIEF · \{step\} DE \{briefDecisions\.length\}/);
  assert.match(interview, /figcaption>exploração · IA</);
  assert.equal(showsMarketProof("Board especializado em tipografia expressiva e gancho visual de capa."), false);
  assert.equal(showsMarketProof("Phoenix validou com NDCG e score alto"), true);
});
