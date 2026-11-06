import test from "node:test";
import assert from "node:assert/strict";
import { answerPrompt, answerWithReuse, artFacts, briefRecordSchema, nextPrompt, recordFromStudio, skipPrompt } from "../lib/brief-interview.ts";

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
