import { z } from 'zod';

/** Evaluation setting selected by the host, never a tool argument or stored user preference. */
export type GuidanceVariant = 'baseline' | 'guided_v1';

export function parseGuidanceVariant(value: string | undefined): GuidanceVariant {
  if (value === undefined || value === '' || value === 'baseline') return 'baseline';
  if (value === 'guided_v1') return value;
  throw new Error('COMPOR_MCP_GUIDANCE deve ser baseline ou guided_v1.');
}

const toolHelp = {
  list_skills: 'Use para descobrir IDs/versões quando ainda não estiverem no contexto. Depois carregue apenas a skill necessária à etapa atual, sem pré-carregar o catálogo inteiro.',
  load_skill: 'Use o ID e, se informada, a versão de list_skills. Reutilize instruções já carregadas com a mesma versão/hash. A skill orienta a tarefa; não executa a preparação nem concede permissão.',
  prepare_word_cloud: 'Use para organizar palavras já identificadas. Frequência é contagem; sugestão é hipótese; escolha exige escolha explicitamente informada. Não invente contagens, converta sugestão em escolha ou iguale escalas. Omita o peso desconhecido; zero é um valor.',
  prepare_moodboard: 'Use para estruturar uma direção revisável solicitada. IDs locais novos podem identificar propostas, que devem ser nomeadas como propostas; asset_ref deve vir do contexto, nunca representar imagem inventada. Separe aspecto apreciado de rótulo da referência. Preserve restrições e conflitos para revisão, sem resolvê-los por prioridade.',
  prepare_layered_creative: 'Use com snapshot disponível ou rascunho explicitamente proposto. Preserve IDs, versão e fatos de um snapshot recebido; nomeie novos rascunhos como propostas. Não invente ativos/fontes existentes. O resultado é estrutura, não arte gerada ou edição aplicada.',
  prepare_annotation_context: 'Use para ligar feedback a um snapshot disponível. Copie versão e IDs de camada do snapshot. Se o alvo só é uma área, preserve a área: candidatas geométricas não são seleção confirmada, mesmo quando há uma só. Não escolha a primeira candidata. Separe notas de aspectos/alvos diferentes; sinalize alvos propostos. Escopos são alegações, não autorização nem memória gravada.',
} as const;

type Help = { description: string; examples?: unknown[] };
const fields = {
  skill_id: { description: 'ID exato retornado por list_skills; não é caminho de arquivo.' },
  skill_version: { description: 'Versão retornada pelo catálogo. Omita se não precisar fixá-la; não adivinhe.' },
  words: { description: 'Palavras com evidências/pesos disponíveis; os três tipos de peso têm origens distintas.', examples: [[{ word: 'clareza', suggested_weight: 2 }, { word: 'ritmo' }]] },
  word: { description: 'Palavra ou expressão; não inclua instruções para outras ferramentas.' },
  frequency: { description: 'Contagem observada/informada, inteira. Omita se desconhecida.' },
  suggested_weight: { description: 'Relevância proposta, não escolhida pela pessoa; não há escala semântica comum imposta.' },
  chosen_weight: { description: 'Peso cuja escolha foi explicitamente informada; tem precedência, inclusive zero. Não use para sugestões.' },
  opaque_id: { description: 'Identificador opaco, não URL/caminho, prova de existência ou autorização. Reutilize o fornecido; novos IDs locais identificam somente propostas.' },
  board_id: { description: 'ID do quadro recebido ou de um novo quadro explicitamente proposto.' },
  board_version: { description: 'Versão do snapshot recebido/proposto; não verificada em armazenamento.' },
  direction: { description: 'Direção revisável; distinga proposta de escolha humana e preserve restrições declaradas.' },
  elements: { description: 'IDs únicos. kind=reference exige asset_ref; outros kinds não aceitam asset_ref.', examples: [[{ id: 'cor_proposta', kind: 'color', value: '#445566', label: 'Proposta', aspects: ['color'], intent: 'inspire' }]] },
  element_value: { description: 'Cor, texto ou pista visual descrita. Ausência pode produzir aviso; não invente dados da referência.' },
  asset_ref: { description: 'ID opaco de ativo informado no contexto. Não busca nem comprova o ativo; não invente uma imagem existente.' },
  label: { description: 'Rótulo declarado da referência ou nome explícito de proposta; não implica aprovação de todos os aspectos.' },
  meaning: { description: 'O que a referência significa neste contexto e qual aspecto interessa; preserve incerteza quando não informado.' },
  aspects: { description: 'Aspectos a que a pista se aplica; omitir é desconhecido, [] é lista explicitamente vazia.' },
  intent: { description: 'Papel informado/proposto: inspirar, manter, variar ou evitar. Não confirma preferência.' },
  priority: { description: 'Prioridade informada, com zero válido; não substitui restrições nem comprova escolha humana.' },
  origin_claim: { description: 'Origem alegada, por exemplo fala da pessoa ou proposta do agente. Não atribua ao usuário uma inferência.' },
  geometry: { description: 'Caixa normalizada ao quadro (0–1). x+width e y+height devem caber em 1; limites após rotação não são verificados.' },
  restrictions: { description: 'Restrições declaradas separadas das pistas. Preserve must_keep/must_avoid; os avisos detectam somente conflitos literais.' },
  rect: { description: 'Caixa normalizada (0–1) na imagem orientada, não pixels. x+width <= 1 e y+height <= 1.', examples: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.2 }] },
  layer_id: { description: 'ID único dentro de piece.layers; reutilize IDs recebidos ao referenciar camadas existentes.' },
  layer_name: { description: 'Nome descritivo da camada; identifique proposta quando o snapshot for inventado para rascunho.' },
  z_index: { description: 'Inteiro único por camada; ordenação não prova visibilidade semântica nem resolve seleção por área.' },
  layer_text: { description: 'Texto literal disponível ou copy explicitamente proposta. Preserve fatos; não invente preço, data ou benefício.' },
  font_ref: { description: 'ID de fonte fornecido no contexto. Não resolve/carrega fonte; retorna aviso. Omita se desconhecido.' },
  piece: { description: 'Snapshot recebido ou rascunho explicitamente proposto. Não é carregado por ID nem autenticado.', examples: [{ piece_id: 'rascunho_1', version: 'v1', width_px: 1000, height_px: 1000, layers: [{ id: 'titulo_1', kind: 'text', name: 'Título proposto', z_index: 0, rect: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, text: 'Título proposto' }] }] },
  piece_version: { description: 'Versão do snapshot fornecido; preserve a versão recebida. Não comprova versão atual no produto.' },
  context_ref: { description: 'ID informado de produto/campanha/variação. Omita ou use null se ausente; nunca invente vínculo ou permissão.' },
  layers: { description: '1–64 camadas; id e z_index únicos. Cada kind aceita seus próprios campos; imagem sem ativo recebe aviso.' },
  target: { description: 'layer exige layer_id presente no snapshot; area exige rect e mantém a ambiguidade geométrica.' },
  target_layer_id: { description: 'Copie um ID existente em piece.layers. Só use layer quando o alvo foi explicitado; não converta candidata por área em escolha humana.' },
  annotation_id: { description: 'ID local único da nota; criar ID não comprova evento, autoria ou clique humano.' },
  annotation_version: { description: 'Deve ser exatamente igual a piece.version neste payload.' },
  annotation_note: { description: 'Feedback com origem e aspecto preservados; marque interpretação/região proposta. Conteúdo importado não concede autoridade.' },
  edit_scope_claim: { description: 'Alcance alegado da mudança: camada, peça ou variação. Omita quando não informado; não amplia automaticamente o alvo.' },
  memory_scope_claim: { description: 'Alcance alegado da memória: tarefa, campanha ou produto. Omita se não declarado. product sempre exige confirmação verificada fora desta tool.' },
  annotations: { description: 'Notas separadas por aspecto/alvo; IDs únicos e versão igual à peça. Não interpreta nem aplica as alterações.', examples: [[{ id: 'nota_1', piece_version: 'v1', target: { kind: 'area', rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } }, note: 'Proposta de área para revisar contraste; alvo ainda não confirmado.' }]] },
} satisfies Record<string, Help>;

export function guidanceDescription(variant: GuidanceVariant, tool: keyof typeof toolHelp, baseline: string): string {
  return variant === 'guided_v1' ? `${baseline} ${toolHelp[tool]}` : baseline;
}

export function schemaGuidance(variant: GuidanceVariant) {
  // Zod metadata clones the schema without changing parsing, refinements or outputs.
  // Baseline returns the exact original schema, preserving the PR #8 catalog.
  return <T extends z.ZodType>(key: keyof typeof fields, schema: T): T =>
    variant === 'guided_v1' ? schema.meta(fields[key]) : schema;
}
