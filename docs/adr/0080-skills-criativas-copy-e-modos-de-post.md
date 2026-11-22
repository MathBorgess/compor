# ADR 0080 — Skills criativas modulares, copy na imagem e quatro modos nativos de post

**Implementado localmente em 21/11/2026; migration remota não aplicada.** O estúdio web gerava apenas peças únicas `4:5` (`1024x1280`) com instruções genéricas de direção e sem contrato dedicado para voz da marca, copy de direct response na imagem, carrosséis, coleções fotográficas ou stories `9:16`.

## Decisão

### 1. Catálogo modular de skills em duas camadas (`packages/agents-api`)

Como o agente gerenciado executa na OpenAI Agents API com `environment: { type: 'none' }`, as skills curadas vivem em `packages/agents-api/src/creative-skills/` (`compor-creative-skills.v1`) e são resolvidas por `resolveCreativeSkillBundle({ format, surface })` para `chat` e `planner`:

- **Camada 1:** `creative-core.v1` (sempre ativa — legibilidade a 360 px, diversidade criativa, fidelidade factual e legenda separada).
- **Camada 2A:** `on-image-copy.v1` (sempre ativa — adequação ao perfil/`brandVoice`, níveis de consciência, ganchos de direct response, micro-copy de carrossel e proibição de clichês de IA em PT-BR).
- **Camada 2B:** exatamente uma skill do formato ativo (`post-feed-estatico.v1`, `carrossel-narrativo.v1`, `colecao-editorial.v1` ou `story-vertical.v1`).

A troca de `postFormat` invalida o reaproveitamento da sessão anterior no chat para impedir contaminação de instruções entre formatos. A telemetria operacional aceita somente vocabulário fechado `postFormat` e identificador versionado `skillVersion`.

### 2. Quatro modos nativos do Instagram e resolução `864x1536`

- `single` (*Post único*, `4:5`, `1024x1280`, 1 lâmina)
- `carousel` (*Carrossel*, `4:5`, `1024x1280`, 3–10 lâminas, padrão 5)
- `collection` (*Coleção*, `4:5`, `1024x1280`, 2–10 fotos editoriais, padrão 3)
- `story` (*Story*, `9:16`, `864x1536`, 1 lâmina — proporção exata 9:16 com área próxima a `1024x1280`)

`packages/images-api` e `packages/attempt-metrics` passam a aceitar `'864x1536'` além de `'1024x1280'` (padrão preservado quando omitido). A exploração em Referências adota `864x1536` quando aberta a partir de um post `story`. Regras de zonas seguras compatíveis com TikTok ficam na skill `story-vertical.v1`, sem adicionar seletor de rede social na interface.

### 3. Fluxo multi-lâmina com Capa Âncora e ferramentas do estúdio

Para `carousel` e `collection`, o fluxo preserva o início explícito de geração (ADR 0044) e evita desperdiçar múltiplas chamadas antes de alinhar o estilo:

1. Plano editável de lâminas (`frames[]` com `id`, `index`, `role`, `headline`, `body`, `visualNote`, `assetId` opcional) e `visualInvariants` definidos no chat ou na UI.
2. Geração inicial da **Lâmina 1 (Âncora Visual)** para validar estética, tipografia e copy.
3. Somente após clique explícito em **"Gerar demais lâminas (N)"** (ou pedido explícito no chat), o estúdio gera as lâminas `2..N` enviando a Lâmina 1 como imagem auxiliar `role: 'anchor'` junto das referências selecionadas. Edições em uma lâmina específica preservam os pixels das demais.

Foram adicionadas quatro ferramentas locais validadas em runtime em `studio-chat-tools.mjs`: `compor_editar_voz`, `compor_definir_formato`, `compor_definir_plano_laminas` e `compor_editar_lamina`. Nenhuma delas dispara geração de pixels por conta própria.

### 4. Persistência aditiva (SQL e IndexedDB) e voz da marca

- **Supabase:** a migration aditiva `20261121000047_post_formats_and_frames.sql` atualiza `public.save_piece_version_v2` (delegada por `v3`) para aceitar e validar campos opcionais `format`, `visualInvariants` e `frames[]` dentro de `piece_versions.content` (exigindo 2–10 itens quando `format` for `carousel` ou `collection`), mantendo 100% de compatibilidade com versões antigas sem esses campos. A tabela `piece_versions` continua guardando **uma versão por conjunto do post**; cada lâmina referencia seu próprio `assetId` já suportado por `packages/private-images`, preservando intacta a imagem canônica da versão (`piece_version_images`, ADR 0077).
- **IndexedDB e estado local:** `studio-storage.ts` aceita chave opcional por `frameId` sem migração destrutiva, mantendo intactas as chaves históricas sem `frameId`. `brandVoice` (`tone`, `examples`, `avoid`) é opcional em *Configurações do projeto → Marca e direção* e retrocompatível no schema local.

### 5. Interface simples, guia de áreas seguras e exportação

- Seletor de 4 modos em *Preparar post* e *Configurações do Post*; painel de voz da marca opcional; botão **"Refinar copy com IA"** no painel *Textos* (turno textual sem gerar imagem).
- Canvas respeita a proporção real `4:5` ou `9:16`. Em `story`, um controle opcional exibe o **Guia de áreas seguras** (CSS somente na UI: topo 15%, base 25%, lateral direita 16%) sem nunca gravar marcações no PNG exportado.
- Em `carousel` e `collection`, o estúdio oferece tira horizontal de lâminas, alternância **"Ver grade"** lado a lado para inspecionar coesão, reordenação/adição/remoção e botão explícito **"Gerar demais lâminas (N)"**.
- Em `StudioReview`, a exportação mantém a legenda separada e gera downloads numerados (`<título>-v<N>-01.png`, `-02.png`...) ou individuais sem acrescentar novas dependências npm no cliente (respeitando o orçamento de bundle do ADR 0033).

### 6. Evolução do Marco 5 (`--suite extended`)

A suíte legada (`--suite legacy`, 5 casos 4:5 em `scripts/evals/pr61/post/cases.json` e `rubrica.md`) permanece intocada para preservar comparabilidade com R0–R3. Foi adicionada `--suite extended` com 8 casos sintéticos (`casos-estendidos.json`: 5 de desenvolvimento e 3 reservados cobrindo os 4 formatos e `brandVoice`) e `rubrica-estendida.md` (incluindo `adequacaoAoPerfil`, `sinergiaLegenda`, `coesaoVisual`, `progressaoOuRitmo`, `zonasSeguras` com painel comparativo 360 px e falha crítica `cliche_ou_evitar`).

## Relação com decisões anteriores

- **Complementa** os ADRs [0012](0012-arte-integral-e-deliberacao-adaptativa.md) (arte integral com textos embutidos e legenda separada), [0029](0029-agente-opinativo-e-pergunta-unica.md) (fatos como ordem), [0030](0030-variante-retoque-e-cards-no-canvas.md) (variantes/retoques), [0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) (revisão e exportação PNG limpa), [0044](0044-preparacao-guiada-e-estudio-por-post.md) (início explícito da geração), [0046](0046-contexto-e-referencias-por-post.md) (contexto por post) e [0066](0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) (entradas visuais vinculadas ao pedido).
- **Não substitui** autorizações de credencial (ADR 0038), isolamento de conversas (ADR 0045), limites/pausas de exploração ou contratos de reconciliação (ADR 0069).

## Limites conhecidos

- A migration `20261121000047_post_formats_and_frames.sql` foi validada localmente via PGlite, mas **não foi aplicada** ao banco remoto.
- As rodadas pagas do Marco 5 `--suite extended` contra provedor real ainda não foram executadas e exigem autorização explícita.
- Ver curadoria completa em [Curadoria de skills criativas](../creative-skills-curation.md).
