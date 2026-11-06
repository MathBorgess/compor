import test from "node:test";
import assert from "node:assert/strict";
import {
  answerPrompt,
  artFacts,
  nextPrompt,
  skipPrompt,
} from "../lib/brief-interview.mjs";

test("a entrevista faz uma pergunta por vez e não leva sugestão para a arte", () => {
  let record = {};
  assert.equal(nextPrompt(record).id, "produto");
  record = answerPrompt(record, "produto", "Uma aula curta", "sugerido");
  assert.equal(artFacts(record).headline, "");
  assert.equal(nextPrompt(record).id, "persona");
  record = answerPrompt(record, "persona", "Pessoas interessadas em aprender");
  record = answerPrompt(record, "objetivo", "Pedir para conhecer a aula");
  assert.equal(nextPrompt(record).id, "personalidade");
  record = skipPrompt(record, "personalidade");
  assert.equal(nextPrompt(record).id, "fatos");
  for (const id of ["fatos", "referencias", "preco", "data"]) record = skipPrompt(record, id);
  assert.equal(nextPrompt(record), null);
  assert.deepEqual(artFacts(record), { headline: "", price: "", date: "" });
  record = answerPrompt(record, "produto", "Aula fictícia");
  record = answerPrompt(record, "preco", "R$ 49");
  assert.deepEqual(artFacts(record), { headline: "Aula fictícia", price: "R$ 49", date: "" });
});
