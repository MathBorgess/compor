# ADR 0031 — Faixa de contexto, público único e revisão simplificada

- Estado: accepted
- Data: 09/11/2026
- Fonte: revisão do estúdio web por Matheus e decisões dele numa sessão do Claude Code em 09/11/2026.

## Contexto

Na revisão, Matheus relatou que "fatos e direção estão perdidos na tela" e que informar quem vai usar a oferta é "contra intuitivo". Sobre a revisão, disse que ela "não deveria precisar de imagem base, ou qualquer outro dado", só baixar, ver o título e copiar a legenda.

Hoje o resumo do briefing fica no fim da coluna e some quando já existe texto ou versão. Os fatos ficam na gaveta Marca, sem edição, e só mudam pelo chat. O público aparece em dois campos que nunca se sincronizam. Um é o "Público" do briefing, que a entrevista trata como fato. O outro é "Quem você quer alcançar?", da persona.

A tela de revisão mostra o editor inteiro, o envio de imagem-base, o salvamento do PNG no projeto, um passo "Preparar PNG" antes do download e um segundo botão de download no topo. O título não aparece.

## Decisão

**Público único.** O projeto tem um campo Público, que registra quem a pessoa criadora quer alcançar com a oferta. Ele é o ponto de partida da persona compradora, cujos demais detalhes continuam opcionais. O planejador da exploração recebe um único público. Em estados locais antigos, um valor vazio cede ao outro e valores iguais se fundem. Quando os valores diferem, a tela mostra os dois e a pessoa escolhe uma vez. Nada é resolvido por suposição.

**Faixa de contexto.** Oferta, fatos, público e direção ficam numa faixa sempre visível no estúdio, editável no lugar. Cada fato mostra se está confirmado, pendente ou omitido. A gaveta Marca continua para os detalhes da persona e para os critérios com exemplos e contraexemplos. Conexão e controles de exploração continuam recolhidos. O layout exato, faixa no topo ou coluna lateral, sai de um protótipo descartável que também considera os cards do [ADR 0030](0030-variante-retoque-e-cards-no-canvas.md), no computador e no celular.

**Escolha do layout em 09/11/2026.** Na continuação desta sessão do Codex, Matheus orientou “Não me peça nada” e delegou as escolhas a um subagente com personalidade de diretor de publicidade e crítico de Agent Experience, voltado a pessoas leigas em IA. O diretor comparou as alternativas no computador e no celular e escolheu a **faixa no topo**: preserva mais largura para as artes e mantém o mesmo modelo de navegação nos dois tamanhos. Esta revisão delegada substitui a espera anterior pela escolha pessoal de Matheus, sem afirmar que houve teste com pessoas reais.

As [capturas do topo no computador](../quality/layout-2026-11-09/top-desktop.png), [topo no celular](../quality/layout-2026-11-09/top-mobile.png), [coluna no computador](../quality/layout-2026-11-09/side-desktop.png) e [coluna no celular](../quality/layout-2026-11-09/side-mobile.png) conservam os dois protótipos descartáveis. As telas usam dados e artes sintéticos. O HTML do protótipo não integra o aplicativo. A faixa implementada usa quatro grupos acionáveis: oferta, público, direção e fatos; corpo de 14 px, apoio de pelo menos 12 px, alvos de 44 px e rolagem vertical no celular. A conversa não substitui a edição desses campos.

**Revisão.** A tela de revisão mostra a imagem, o título do projeto, a legenda com "Copiar legenda" e o botão "Baixar PNG". O download compõe o PNG no clique, sem passo prévio, e o nome do arquivo usa o título e a versão. O formato continua PNG, e PDF fica fora.

Saem da revisão:

- o editor;
- o envio de imagem-base, que passa para o estúdio;
- o salvamento do PNG no projeto, com sua autorização, que passa para a lista de versões;
- o botão de download do topo.

Aprovar continua no editor do estúdio.

## O que muda e o que continua

Esta decisão substitui:

- no [guia de arquitetura](../architecture.md), a regra de manter separados o público do briefing e o da persona, e o teste que verifica essa separação;
- no [ADR 0023](0023-referencias-e-conversa-flutuante.md), o recolhimento do contexto do pedido. Conexão e controles de exploração continuam recolhidos;
- no [ADR 0020](0020-layout-pr17-e-conversa-adaptativa.md), a dependência dos painéis sobre o quadro para ver fatos e direção.

Continuam valendo:

- a conferência de fatos, grafia e legibilidade de cada imagem, do [ADR 0012](0012-arte-integral-e-deliberacao-adaptativa.md). Ela acontece olhando a arte, com os fatos visíveis na faixa, e não por uma lista na tela de revisão;
- exportar, aprovar e publicar como ações distintas, do [ADR 0015](0015-backend-dados-e-autorizacao.md) e do glossário. O PNG continua sem camadas de texto acrescentadas pelo app;
- a persona simulada como hipótese.

## Verificação e limites

Testes de navegador com dados sintéticos cobrem a edição na faixa, a fusão e a escolha do público, e a revisão com download e cópia. Os fixtures que hoje anexam imagem pela tela de revisão passam a usar o envio no estúdio. O orçamento de JavaScript tem 4,7 KB de folga, então a implementação remove código antes de acrescentar. Qualquer aumento do limite é uma proposta separada. Nenhum desses testes mede a compreensão de pessoas reais.

## Adendo (23/11/2026) — Aposentadoria do fluxo manual redundante em `StudioAssets`, aprovação e conferência de fatos no `<StudioReview>`

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, itens 2 e 3, em alinhamento com os [ADRs 0080](0080-skills-criativas-copy-e-modos-de-post.md)–[0084](0084-arte-raster-por-lamina.md)):

### O que muda ou é substituído

1. **Aposentadoria do fluxo manual redundante em `StudioAssets` (item 2):** Quando o vínculo canônico de versão (`piece_version_images`, [ADR 0077](0077-imagem-canonica-da-versao.md)) está ativo, fica substituído o item `"o salvamento do PNG no projeto, com sua autorização, que passa para a lista de versões"` (seção *Decisão*) como interface primária em *Materiais e versões* (`StudioAssets`). O componente passa a exibir confirmação passiva (`Arte da versão {v} salva automaticamente com este post.`) e move a listagem e a recuperação manual de arquivos (`AssetRecovery` e recuperação de versões legadas ou sem vínculo) para a seção recolhida `<details>Recuperação avançada de arquivos</details>`.
2. **Aprovação humana explícita no `<StudioReview>` (item 3a):** Fica ampliada a cláusula `"Aprovar continua no editor do estúdio."` (seção *Decisão*) para permitir também a aprovação explícita dentro do `<StudioReview>`, para versões já salvas e sem alterações pendentes, por meio de `★ Marcar como pronto para postar` (`PATCH /api/pieces` com `approval.status === 'approved'`, exibido como `★ Pronto para postar · v{N}`), mantendo o acionamento equivalente no editor.
3. **Conferência humana de fatos no `<StudioReview>` (item 3b):** Como a faixa permanente de contexto foi substituída pela configuração sob demanda no [ADR 0044](0044-preparacao-guiada-e-estudio-por-post.md), fica substituída a restrição `"e não por uma lista na tela de revisão"` (seção *O que muda e o que continua*). O `<StudioReview>` renderiza uma lista interativa com controles `<input type="checkbox">` exclusivamente para `confirmedFacts` (`offerFacts` com `status === 'confirmed'`), iniciados sempre **desmarcados** (zero `✓` automático e sem sintetizar fatos novos).
4. **Identificação do post e coexistência multi-formato:** Na revisão (*Kit Pronto para Postar*), o cabeçalho e o prefixo dos arquivos exportados priorizam `postTitle` (com fallback ao título do projeto quando ausente), coexistindo integralmente com os modos `single`, `carousel`, `collection` e `story` ([ADRs 0080](0080-skills-criativas-copy-e-modos-de-post.md)–[0084](0084-arte-raster-por-lamina.md)), incluindo `Compor lâminas`, `FrameReviewCard`, prévia da capa 3:4, `Salvar versão` na revisão e exportação ZIP com `legenda.txt` e `alt-text.json` (JPEGs validados em carrosséis compostos pelo renderizador; PNG limpo nos demais casos; PDF permanece fora).

### O que permanece inalterado

- A conferência humana de fatos, grafia e legibilidade olhando a arte ([ADR 0012](0012-arte-integral-e-deliberacao-adaptativa.md)).
- A separação estrita entre contratos e intenções ([ADR 0015](0015-backend-dados-e-autorizacao.md)): **salvar** (`POST /api/pieces`), **aprovar** (`PATCH /api/pieces` com `approval.status === 'approved'`), **exportar** (PNG, ZIP ou compartilhamento via Web Share API quando suportado) e a marcação local opcional **`Postado ✓`** continuam ações distintas; exportar ou marcar checkboxes de conferência de fatos não salva, não aprova, não altera `offerFacts` nem publica.
- A ausência do editor e do envio de imagem-base dentro da revisão, a ausência de textos sobrepostos pelo app na arte exportada, o público único do projeto, a persona simulada como hipótese, o funcionamento autônomo de `StudioAssets` quando o vínculo canônico está inativo e os contratos de Storage imutável/RLS/idempotência do [ADR 0077](0077-imagem-canonica-da-versao.md).

### Verificação

- Verificação documental do alinhamento com os ADRs `0044`, `0077` e `0080`–`0084` e validação em testes de navegador cobrindo aprovação na revisão, checkboxes de fatos iniciados desmarcados, status passivo/recuperação recolhida em `StudioAssets` e fluxos multi-formato (implementação da UI em curso na etapa correspondente).
