import { z } from "zod";
import { studioDecisionIds, referenceSummarySchema, type StudioDecisionId, type StudioDecisionInput } from "./studio-decision-contract.ts";
import { createPhoenixHyperparams } from "./phoenix/hyperparams.ts";
import { computeDeterministicEmbedding, deterministicRouteBoards, deterministicRankSingleCandidateIsolated } from "./phoenix/deterministic.ts";
import { compute_phoenix_multi_action_score, apply_sid_diversity_decay, cosine_similarity } from "./phoenix/formulas.ts";
import { actionProbabilitiesSchema, type UserTasteProfile } from "./phoenix/models.ts";

export const studioDecisionInputSchema = z.strictObject({
  decision: z.enum(studioDecisionIds),
  projectId: z.uuid(),
  briefing: z.string().trim().max(1000).optional(),
  title: z.string().trim().max(200).optional(),
});

const decisions: Record<StudioDecisionId, { skill: string; text: string; sid: string[]; research?: boolean; direction?: boolean }> = {
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

/** In-process deterministic exploration. No network, subprocess, filesystem or audience measurements. */
export function calibrateDecision(input: StudioDecisionInput) {
  const request = studioDecisionInputSchema.parse(input);
  const spec = decisions[request.decision];
  const briefing = request.briefing || request.title || spec.text;
  const hp = createPhoenixHyperparams();
  const userTaste: UserTasteProfile = {
    user_id: "synthetic-exploration",
    preferred_boards_by_goal: {},
    visual_dna_rules: [],
    negative_constraints: [],
    updated_at: "2026-11-06T00:00:00.000Z",
  };
  const tower = computeDeterministicEmbedding(briefing, hp.embedding_dimension);
  const routeBoards = deterministicRouteBoards(hp, {
    briefing, target_format: "single_feed", user_taste: userTaste, board_affinities: [],
  });
  const candidate = {
    candidate_id: request.decision,
    board: "behance/editorial",
    metadata_sid: spec.sid,
    visual_description: spec.text,
    candidate_vec: computeDeterministicEmbedding(`${spec.text} ${spec.sid.join(" ")}`, tower.length),
  };
  const rank = actionProbabilitiesSchema.parse(deterministicRankSingleCandidateIsolated({
    briefing, user_taste: userTaste, user_tower_vec: tower, candidate,
  }));
  const cosine = cosine_similarity(tower, computeDeterministicEmbedding(spec.text, tower.length));
  const raw = compute_phoenix_multi_action_score(rank, hp, cosine);
  const [score] = apply_sid_diversity_decay([{ id: request.decision, raw_score: raw, metadata_sid: spec.sid, actions: rank }], hp);
  const referenceSummary = referenceSummarySchema.parse({
    mode: "deterministic_mock",
    sourceCatalog: "compor_phoenix_static",
    label: "Exploração sintética de catálogo; sem consulta externa, imagem gerada ou evidência de público.",
    references: routeBoards.board_allocations.slice(0, 2).map((allocation, index) => ({
      id: `exploration-${request.decision}-${index + 1}`,
      board: allocation.board,
      description: allocation.rationale,
      originKind: "synthetic",
    })),
  });
  return {
    ok: true as const,
    decision: request.decision,
    projectId: request.projectId,
    mode: "deterministic_mock" as const,
    referenceSummary,
    returned: {
      routeBoards,
      rank,
      score,
      evidence: "synthetic_simulation_not_human_evaluation" as const,
      imageGeneration: "A exploração não gera imagens. A arte integral continua na geração confirmada do estúdio.",
    },
  };
}
