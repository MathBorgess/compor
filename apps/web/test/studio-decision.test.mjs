import test from "node:test";
import assert from "node:assert/strict";
import { calibrateDecision } from "../lib/phoenix-worker.mjs";

const decisions = ["layout-b", "layout-c", "bases", "marca", "ver-arte", "baixar"];

test("cada decisão de layout passa pelo Phoenix e pelas peças do compor-mcp", async () => {
  for (const decision of decisions) {
    const result = await calibrateDecision({
      decision,
      projectId: "project-planilhas",
      title: "Planilhas para a rotina",
      briefing: "Aula curta de planilhas para organizar a rotina.",
    });
    assert.equal(result.ok, true, decision);
    assert.equal(result.received.routeBoards.source, "deterministic_mock");
    assert.equal(result.received.routeBoards.target_format, "single_feed");
    assert.ok(Array.isArray(result.returned.routeBoards.board_allocations));
    assert.equal(typeof result.returned.rank.p_use_as_layout_grid, "number");
    assert.equal(typeof result.returned.score.final_score, "number");
    assert.equal(result.returned.calibration.label, "synthetic_simulation_not_human_evaluation");
    assert.equal(typeof result.returned.comporMcp.skill.sha256, "string");
    assert.match(result.returned.imageGeneration, /não gera imagens/);
  }
  const bases = await calibrateDecision({ decision: "bases", projectId: "p1", briefing: "Referências de composição." });
  assert.equal(bases.returned.comporMcp.discoverVisualReferences.status, "ok");
  assert.equal(bases.returned.comporMcp.skill.id, "explorar-moodboards");
  const marca = await calibrateDecision({ decision: "marca", projectId: "p1", briefing: "Marca em creme e azul." });
  assert.equal(marca.returned.comporMcp.composeCreativeDirection.isError, false);
  assert.equal(marca.returned.comporMcp.skill.id, "traduzir-direcao");
  const produto = await calibrateDecision({ decision: "produto", projectId: "p1", briefing: "Delimitar o produto antes de gerar." });
  assert.equal(produto.returned.comporMcp.discoverVisualReferences.status, "ok");
  assert.ok(produto.returned.comporMcp.discoverVisualReferences.references.length > 0);
});
