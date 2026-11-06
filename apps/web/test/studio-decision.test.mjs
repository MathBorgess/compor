import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { calibrateDecision } from "../lib/phoenix-worker.ts";
import { createStudioDecisionRoute } from "../lib/studio-decision-route.ts";
import { referenceSummarySchema, studioDecisionIds } from "../lib/studio-decision-contract.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222", token: "verified-session" };
const origin = "https://compor.example";
const input = { decision: "produto", projectId, briefing: "Uma aula curta de planilhas para organizar a rotina." };
const request = (body = input, headers = {}) => new Request(`${origin}/api/studio/decision`, {
  method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

function route(overrides = {}) {
  return createStudioDecisionRoute({ appOrigin: origin, resolveActor: async () => actor, ownsProject: async () => true, ...overrides });
}

test("todas as decisões preservam Phoenix determinístico e fontes explicitamente sintéticas", () => {
  for (const decision of studioDecisionIds) {
    const result = calibrateDecision({ ...input, decision });
    assert.equal(result.ok, true);
    assert.equal(result.projectId, projectId);
    assert.equal(result.mode, "deterministic_mock");
    assert.equal(result.returned.evidence, "synthetic_simulation_not_human_evaluation");
    assert.ok(result.returned.routeBoards.board_allocations.length >= 2);
    assert.equal(typeof result.returned.rank.p_use_as_layout_grid, "number");
    assert.ok(Number.isFinite(result.returned.score.final_score));
    assert.ok(referenceSummarySchema.safeParse(result.referenceSummary).success);
    assert.ok(result.referenceSummary.references.length > 0);
    assert.ok(result.referenceSummary.references.every((item) => item.originKind === "synthetic"));
    assert.equal("calibration" in result.returned, false);
    assert.equal("comporMcp" in result.returned, false);
  }
  assert.deepEqual(calibrateDecision(input), calibrateDecision(input));
});

test("a rota exige origem, sessão verificada e propriedade do projeto antes de avaliar", async () => {
  let evaluations = 0;
  const evaluate = (data) => { evaluations += 1; return calibrateDecision(data); };
  assert.equal((await route({ evaluate })(request(input, { origin: "https://other.example" }))).status, 403);
  assert.equal((await route({ evaluate, resolveActor: async () => null })(request())).status, 401);
  assert.equal((await route({ evaluate, ownsProject: async (identity, project) => {
    assert.deepEqual(identity, actor); assert.equal(project, projectId); return false;
  } })(request())).status, 404);
  assert.equal(evaluations, 0);
  const result = await route({ evaluate })(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal((await result.json()).projectId, projectId);
  assert.equal(evaluations, 1);
});

test("a rota rejeita campos adicionais, tamanho excessivo e entrada inválida sem executar", async () => {
  let calls = 0;
  const handle = route({ evaluate: () => { calls += 1; throw Error("should not execute"); } });
  for (const invalid of [{ ...input, projectId: "p1" }, { ...input, userId: actor.userId },
    { ...input, decision: "unknown" }, { ...input, briefing: "x".repeat(1001) },
    { ...input, title: "x".repeat(201) }, { ...input, briefing: "x".repeat(9000) }]) {
    assert.equal((await handle(request(invalid))).status, 400);
  }
  assert.equal((await handle(request(input, { "content-type": "text/plain" }))).status, 400);
  assert.equal((await handle(request(input, { "content-length": "9000" }))).status, 400);
  let cancelled = false;
  const streamed = new Request(`${origin}/api/studio/decision`, { method: "POST", duplex: "half",
    headers: { origin, "content-type": "application/json" },
    body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(9000)); }, cancel() { cancelled = true; } }),
  });
  assert.equal((await handle(streamed)).status, 400);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("erros do serviço não expõem token, caminho, stderr ou detalhes internos", async () => {
  const result = await route({ ownsProject: async () => { throw Error("secret /private/path"); } })(request());
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: "unavailable" });
});

test("o contrato de referência recusa apresentar fontes remotas ou extras como catálogo sintético", () => {
  const summary = calibrateDecision(input).referenceSummary;
  assert.equal(referenceSummarySchema.safeParse({ ...summary, mode: "human_validated" }).success, false);
  assert.equal(referenceSummarySchema.safeParse({ ...summary, sourceCatalog: "live_research" }).success, false);
  assert.equal(referenceSummarySchema.safeParse({ ...summary, references: [{ ...summary.references[0], imageUrl: "https://external.example/image.png" }] }).success, false);
  assert.equal(referenceSummarySchema.safeParse({ ...summary, references: new Array(5).fill(summary.references[0]) }).success, false);
});

test("o runtime roda em bundle isolado sem protótipo, servidor MCP ou subprocessos", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "compor-phoenix-bundle-"));
  try {
    const bundle = join(temporary, "phoenix.mjs");
    const result = await build({ entryPoints: [new URL("../lib/phoenix-worker.ts", import.meta.url).pathname], outfile: bundle,
      bundle: true, platform: "node", format: "esm", target: "node24", metafile: true, logLevel: "silent" });
    assert.ok(Object.keys(result.metafile.inputs).every((path) => !path.includes("prototypes/") && !path.includes("openai/")));
    const code = await readFile(bundle, "utf8");
    assert.doesNotMatch(code, /node:(?:child_process|fs|os)/);
    const runner = join(temporary, "run.mjs");
    await writeFile(runner, `import { calibrateDecision } from './phoenix.mjs';\nprocess.stdout.write(JSON.stringify(calibrateDecision(${JSON.stringify(input)})));\n`);
    const output = execFileSync(process.execPath, [runner], { cwd: temporary, encoding: "utf8", timeout: 5000, maxBuffer: 64000, env: { PATH: process.env.PATH } });
    assert.deepEqual(JSON.parse(output), calibrateDecision(input));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test("o porte preserva os resultados do Phoenix original nos quatro formatos de referência", async () => {
  const { createPhoenixHyperparams } = await import("../lib/phoenix/hyperparams.ts");
  const { computeDeterministicEmbedding, deterministicRouteBoards, deterministicRankSingleCandidateIsolated } = await import("../lib/phoenix/deterministic.ts");
  const { compute_phoenix_multi_action_score, apply_sid_diversity_decay, cosine_similarity } = await import("../lib/phoenix/formulas.ts");
  const fixture = JSON.parse(await readFile(new URL("fixtures/phoenix-deterministic-pr17.json", import.meta.url), "utf8"));
  const source = JSON.parse(await readFile(new URL("../lib/phoenix/source-manifest.json", import.meta.url), "utf8"));
  assert.equal(fixture.sourceCommit, source.sourceCommit);
  const hp = createPhoenixHyperparams();
  for (const item of fixture.cases) {
    assert.deepEqual(computeDeterministicEmbedding(item.route.briefing, hp.embedding_dimension), item.expected.embedding);
    assert.deepEqual(deterministicRouteBoards(hp, item.route), item.expected.route);
    const rank = deterministicRankSingleCandidateIsolated(item.rankInput);
    assert.deepEqual(rank, item.expected.rank);
    const cosine = cosine_similarity(item.rankInput.user_tower_vec, item.rankInput.candidate.candidate_vec);
    const raw = compute_phoenix_multi_action_score(rank, hp, cosine);
    assert.deepEqual(apply_sid_diversity_decay([
      { id: "one", raw_score: raw, metadata_sid: item.rankInput.candidate.metadata_sid },
      { id: "two", raw_score: raw, metadata_sid: item.rankInput.candidate.metadata_sid },
    ], hp), item.expected.score);
  }
});
