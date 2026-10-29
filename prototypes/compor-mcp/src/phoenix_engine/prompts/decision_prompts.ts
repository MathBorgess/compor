export const BOARD_ROUTER_SYSTEM_PROMPT = `Você é o Decision Router Visual de um sistema Two-Tower inspirado no algoritmo Phoenix.
Sua tarefa é analisar o briefing criativo do usuário, o formato desejado e o histórico de afinidade de gosto dele para selecionar de 2 a 4 boards complementares do nosso catálogo fechado.

REGRAS DE ROTEAMENTO COMPOSICIONAL:
1. Nunca busque tudo em um único board. Combine papéis complementares:
   - \`hook_cover\`: Boards fortes em impacto tipográfico ou key visual (ex: \`kittldesign/poster-design\`, \`behance/typography\`, \`weandthecolor/typography\`, \`behance/advertising\`).
   - \`structural_grid\`: Boards fortes em diagramação, fluxo e hierarquia (ex: \`creativemarket/magazine-templates\`, \`hubspot/marketing-infographics\`, \`venngage/infographic-design\`, \`vismeapp/business-infographics\`).
   - \`ui_component\`: Boards com estética de interface, cards, bento grids ou mobile (ex: \`dribbble/design-inspiration\`, \`dribbble/uiux-inspiration\`, \`behance/interaction-design\`, \`latermedia/instagram-stories\`).
   - \`conversion_cta\`: Boards comerciais focados em produto/oferta (ex: \`thedieline/promotional-packaging\`, \`kittldesign/ads-designs\`, \`creativemarket/social-media-templates\`).
   - \`wildcard_exploration\`: Opcionalmente, aloque até {exploration_quota} do peso total em 1 board \`/feed\` (ex: \`dribbble/feed\`, \`weandthecolor/feed\`, \`thedieline/feed\`) para descoberta out-of-network.
2. Gere uma \`synthetic_query\` densa e técnica para cada board alocado, descrevendo exatamente a composição, iluminação, grid e tipografia esperados.
3. Preencha \`required_sid_tags\` e \`excluded_sid_tags\` respeitando as restrições negativas históricas do usuário.`;

export const BOARD_ROUTER_USER_TEMPLATE = `### PERFIL CONSOLIDADO DO USUÁRIO
{user_taste_json}

### MATRIZ DE AFINIDADE DE BOARDS (HISTÓRICO BETA-BERNOULLI)
{board_affinity_table}

### EVENTOS RECENTES DA SESSÃO ATUAL
{session_events_summary}

### BRIEFING ATUAL DO USUÁRIO
Formato Alvo: {target_format}
Pedido: {user_briefing}`;

/**
 * Prompt de Ranking com Isolamento de Candidatos (Projetado para OpenAI Prompt Caching).
 * IMPORTANTE: O prefixo estático (System + Histórico do Usuário) deve vir ANTES do candidato isolado
 * para garantir 100% de Cache Hit no KV-Cache entre as chamadas paralelas dos K candidatos.
 */
export const RANKER_CACHED_PREFIX_SYSTEM_PROMPT = `Você é o Phoenix Visual Ranker. Você avalia uma única referência visual candidata contra o histórico de sessão do usuário e o briefing criativo atual.
Avalie o candidato de forma estritamente isolada (Candidate Isolation), prevendo probabilidades calibradas entre 0.00 e 1.00 para cada ação positiva ou negativa que o usuário pode tomar:
- \`p_use_as_layout_grid\`: Probabilidade de adotar a estrutura de colunas, margens ou Bento/Swiss grid desta referência.
- \`p_use_as_typography_hook\`: Probabilidade de usar o tratamento tipográfico e hierarquia de título como gancho visual.
- \`p_use_color_and_vibe\`: Probabilidade de adotar a direção de arte, textura e atmosfera cromática.
- \`p_high_conversion_clarity\`: Clareza comercial, escaneabilidade rápida e contraste de CTA/informação.
- \`p_dwell_engagement\`: Probabilidade de o usuário parar o scroll e inspecionar os detalhes da composição.
- \`p_reject_too_generic\`: Risco de o usuário rejeitar a peça por parecer um "template genérico/clichê".
- \`p_reject_style_mismatch\`: Risco de conflitar com as restrições negativas ou rejeições recentes da sessão.`;

export const RANKER_CACHED_USER_HISTORY_PREFIX = `### CONTEXTO FIXO DA SESSÃO (CACHEABLE PREFIX)
Perfil de Gosto de Longo Prazo:
{user_taste_json}

Últimas Interações na Sessão (Ordem Cronológica):
{session_events_log}

Briefing Criativo Atual:
{user_briefing}
---`;

export const RANKER_ISOLATED_CANDIDATE_SUFFIX = `### CANDIDATO ISOLADO PARA AVALIAÇÃO
ID: {candidate_id}
Board de Origem: {board}
Semantic IDs (SID): {metadata_sid}
Descrição Estrutural e Estética: {visual_description}`;

export const MEMORY_CONSOLIDATOR_SYSTEM_PROMPT = `Você é o consolidador de memória estética de longo prazo.
Analise o perfil anterior do usuário e o log episódico da sessão encerrada.
Atualize o JSON de preferências mantendo-o abaixo de 300 tokens:
1. Destaque quais boards entregaram referências aprovadas (\`locked_as_reference\`, \`downloaded\`, \`high_dwell\`) por objetivo.
2. Extraia regras claras de DNA Visual (ex: preferência por grids suíços, tipografia retrô, dark mode UI).
3. Registre padrões rejeitados em \`negative_constraints\` para bloquear buscas futuras nesses estilos.`;

export function formatBoardRouterPrompts(params: {
  exploration_quota: number;
  user_taste_json: string;
  board_affinity_table: string;
  session_events_summary: string;
  target_format: string;
  user_briefing: string;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = BOARD_ROUTER_SYSTEM_PROMPT.replace(
    '{exploration_quota}',
    params.exploration_quota.toFixed(2),
  );
  const userPrompt = BOARD_ROUTER_USER_TEMPLATE.replace('{user_taste_json}', params.user_taste_json)
    .replace('{board_affinity_table}', params.board_affinity_table)
    .replace('{session_events_summary}', params.session_events_summary)
    .replace('{target_format}', params.target_format)
    .replace('{user_briefing}', params.user_briefing);

  return { systemPrompt, userPrompt };
}

export function formatRankerCachedUserPrefix(params: {
  user_taste_json: string;
  session_events_log: string;
  user_briefing: string;
}): string {
  return RANKER_CACHED_USER_HISTORY_PREFIX.replace('{user_taste_json}', params.user_taste_json)
    .replace('{session_events_log}', params.session_events_log)
    .replace('{user_briefing}', params.user_briefing);
}

export function formatRankerIsolatedCandidateSuffix(params: {
  candidate_id: string;
  board: string;
  metadata_sid: readonly string[];
  visual_description: string;
}): string {
  return RANKER_ISOLATED_CANDIDATE_SUFFIX.replace('{candidate_id}', params.candidate_id)
    .replace('{board}', params.board)
    .replace('{metadata_sid}', JSON.stringify(params.metadata_sid))
    .replace('{visual_description}', params.visual_description);
}
