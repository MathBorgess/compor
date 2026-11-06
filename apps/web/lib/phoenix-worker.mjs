import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../prototypes/compor-mcp/", import.meta.url));
const dist = (path) => pathToFileURL(join(root, "dist", path)).href;

const { createPhoenixHyperparams } = await import(dist("phoenix_engine/config/hyperparams.js"));
const { PhoenixDecisionApiService, computeDeterministicEmbedding } = await import(
  dist("phoenix_engine/services/decision_api.js")
);
const { compute_phoenix_multi_action_score, apply_sid_diversity_decay, cosine_similarity } =
  await import(dist("phoenix_engine/math/formulas.js"));
const { PhoenixMemoryStore } = await import(dist("phoenix_engine/services/memory_store.js"));
const { executeDiscoverVisualReferences } = await import(dist("phoenix_engine/mcp/dual_adapter.js"));
const { EphemeralReferenceStore } = await import(dist("staging/ephemeral_store.js"));
const { executeComposeCreativeDirection } = await import(dist("tools/compose_direction.js"));
const { comporSkillCatalog, comporSkillVersion } = await import(dist("server.js"));
const { evaluateOne, session } = await import(
  pathToFileURL(join(root, "scripts/calibration/phoenix-calibration.mjs")).href
);

const decisions = {
  "layout-b": {
    skill: "entender-intencao",
    text: "Barra única no topo e chat aberto à esquerda, ao lado do quadro.",
    sid: ["format", "swiss_grid", "editorial", "clean"],
  },
  "layout-c": {
    skill: "entender-intencao",
    text: "Chat recolhido: quadro em largura total e entrada flutuante no rodapé.",
    sid: ["format", "bento_grid", "minimal", "clean"],
  },
  bases: {
    skill: "explorar-moodboards",
    text: "Abrir a gaveta Bases sobre o chat, com referências e versões, sem empurrar o quadro.",
    sid: ["format", "swiss_grid", "reference", "paper"],
    research: true,
  },
  marca: {
    skill: "traduzir-direcao",
    text: "Abrir a gaveta Marca sobre o chat, com fatos, direção e identidade.",
    sid: ["format", "bold_display_hook", "brand", "cream"],
    direction: true,
  },
  "ver-arte": {
    skill: "criar-piloto",
    text: "Ver arte em tela cheia, com o chat no modo mínimo flutuante.",
    sid: ["format", "hero_product_d2c", "portrait", "contrast"],
  },
  baixar: {
    skill: "criar-piloto",
    text: "Baixar o PNG retrato. Esta é a única ação amarela.",
    sid: ["format", "high_contrast_cta", "export", "yellow"],
  },
  produto: {
    skill: "entender-intencao",
    text: "Delimitar o produto que a pessoa compra antes de sugerir opções.",
    sid: ["format", "hero_product_d2c", "offer", "clean"],
    research: true,
  },
  persona: {
    skill: "entender-intencao",
    text: "Delimitar quem compra o infoproduto antes de sugerir personas.",
    sid: ["format", "bold_display_hook", "audience", "editorial"],
    research: true,
  },
  objetivo: {
    skill: "traduzir-direcao",
    text: "Delimitar a ação esperada depois do post antes de sugerir objetivos.",
    sid: ["format", "high_contrast_cta", "action", "contrast"],
    research: true,
  },
  personalidade: {
    skill: "traduzir-direcao",
    text: "Delimitar o tom de voz antes de sugerir personalidades.",
    sid: ["format", "kinetic_retro_type", "tone", "paper"],
    research: true,
  },
};

function actor(projectId) {
  const raw = String(projectId || "studio").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return raw || "studio";
}

function taste(userId) {
  return {
    user_id: userId,
    preferred_boards_by_goal: {},
    visual_dna_rules: ["creme #F4F0E5", "grafite #2C2D2F", "azul #123EAB", "DM Sans"],
    negative_constraints: ["roxo", "gradiente"],
    updated_at: "2026-11-06T00:00:00.000Z",
  };
}

function candidate(spec, description) {
  return {
    candidate_id: spec && decisions[spec] ? spec : "opcao",
    board: "behance/editorial",
    metadata_sid: decisions[spec]?.sid ?? ["format", "swiss_grid", "layout", "clean"],
    visual_description: description,
    preview_url: "synthetic:layout",
    origin_url: "synthetic:layout",
    staging_path: "não preparada",
  };
}

async function skillRecord(id) {
  const skill = comporSkillCatalog.find((item) => item.id === id);
  if (!skill) return null;
  const instructions = await readFile(new URL(`../skills/${skill.file}`, pathToFileURL(join(root, "src/server.ts"))), "utf8");
  return {
    id: skill.id,
    name: skill.name,
    version: comporSkillVersion,
    sha256: createHash("sha256").update(instructions).digest("hex"),
  };
}

export async function calibrateDecision(input) {
  const decision = decisions[input?.decision] ? input.decision : null;
  if (!decision) {
    return { ok: false, error: "unknown_decision" };
  }
  const spec = decisions[decision];
  const userId = actor(input.projectId);
  const briefing = String(input.briefing || input.title || spec.text).slice(0, 1000);
  const hp = createPhoenixHyperparams();
  const service = new PhoenixDecisionApiService({ hp, forceDeterministicMock: true });
  const userTaste = taste(userId);
  const received = {
    decision,
    createPhoenixHyperparams: {},
    routeBoards: {
      user_id: userId,
      briefing,
      target_format: "single_feed",
      user_taste: userTaste,
      board_affinities: [],
      board_affinity_table: "nenhuma afinidade observada",
      session_events_summary: spec.text,
      source: "deterministic_mock",
    },
    rank: {
      briefing,
      user_taste: userTaste,
      candidate: candidate(decision, spec.text),
    },
    calibrationSessionSeed: 30000 + Object.keys(decisions).indexOf(decision),
  };
  const tower = computeDeterministicEmbedding(briefing, hp.embedding_dimension);
  received.rank.user_tower_vec_dimensions = tower.length;
  const routed = await service.routeBoards(received.routeBoards);
  const ranked = service.deterministicRankSingleCandidateIsolated({
    briefing,
    user_taste: userTaste,
    user_tower_vec: tower,
    candidate: { ...received.rank.candidate, candidate_vec: computeDeterministicEmbedding(`${spec.text} ${spec.sid.join(" ")}`, tower.length) },
  });
  const cosine = cosine_similarity(tower, computeDeterministicEmbedding(spec.text, tower.length));
  const raw = compute_phoenix_multi_action_score(ranked, hp, cosine);
  const [scored] = apply_sid_diversity_decay(
    [{ id: decision, raw_score: raw, metadata_sid: spec.sid, actions: ranked }],
    hp,
  );
  const calibration = evaluateOne(session(received.calibrationSessionSeed), hp);
  const pieces = { skill: await skillRecord(spec.skill) };
  if (spec.research) {
    const stagingRoot = await mkdtemp(join(tmpdir(), "compor-refs-"));
    const discovery = await executeDiscoverVisualReferences(
      {
        briefing,
        target_format: "single_feed",
        user_id: userId,
        client_mode: "web",
        decision_fallback_mode: "deterministic_mock",
        consent_external_search: false,
        consent_model: false,
      },
      {
        hp,
        memoryStore: new PhoenixMemoryStore({ hp }),
        decisionService: service,
        referenceStore: new EphemeralReferenceStore({ stagingRoot, defaultSessionId: "sid_layout" }),
      },
    );
    const structured = discovery.structuredContent ?? {};
    const found = Array.isArray(structured.candidates) ? structured.candidates : [];
    pieces.discoverVisualReferences = {
      isError: Boolean(discovery.isError),
      status: structured.status ?? null,
      candidateCount: found.length,
      references: found.slice(0, 2).map((item) => ({
        id: item.candidate_id,
        board: item.board,
        description: String(item.visual_description || item.composition_guideline || "").slice(0, 180),
      })),
    };
  }
  if (spec.direction) {
    const stagingRoot = await mkdtemp(join(tmpdir(), "compor-marca-"));
    const composed = await executeComposeCreativeDirection(
      {
        briefing_summary: briefing,
        target_format: "single_feed",
        brand_identity: {
          palette_hex: ["#F4F0E5", "#123EAB", "#2C2D2F", "#F6D550"],
          tone_of_voice: "Direto, claro e sem gradiente.",
        },
        proceed_without_references: true,
      },
      { store: new EphemeralReferenceStore({ stagingRoot, defaultSessionId: "sid_marca" }) },
    );
    const structured = composed.structuredContent ?? {};
    pieces.composeCreativeDirection = {
      isError: Boolean(composed.isError),
      status: structured.status ?? null,
    };
  }
  return {
    ok: true,
    decision,
    received,
    returned: {
      routeBoards: routed,
      rank: ranked,
      score: scored,
      calibration: {
        ndcg: calibration.ndcg,
        hit: calibration.hit,
        uniqueSids: calibration.uniqueSids,
        recallGold: calibration.recallGold,
        label: "synthetic_simulation_not_human_evaluation",
      },
      comporMcp: pieces,
      imageGeneration: "compor-mcp não gera imagens; a geração permanece na rota existente do estúdio.",
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const result = await calibrateDecision(input);
  process.stdout.write(JSON.stringify(result));
}
