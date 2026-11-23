# ADR 0073 — Referências visíveis e primeiro pedido a partir do projeto

Decisão de Matheus em 18/11/2026, após revisar o fluxo de Referências e a preparação do primeiro post.

**Enviar imagem** e **Pedir 3 propostas** aparecem ao abrir Referências. O envio de arquivos independe da credencial de IA. A interface explica bloqueios de seleção ou de disponibilidade junto à ação e permite consultar a seleção ou a intenção novamente. A autoridade da seleção, a resolução explícita de divergências e o consentimento externo mantêm os contratos dos ADRs 0067 e 0072.

Ao concluir as referências da preparação inicial, o nome do projeto sugere o nome organizacional do primeiro post e a descrição da oferta sugere a mensagem. Ambos são editáveis. O público já compõe o contexto compartilhado, e a pessoa informa objetivo e, se houver, a chamada para ação no mesmo formulário. A sugestão é aplicada uma vez no início da preparação. Reabrir preserva as edições e os campos antigos. **Criar novo post** em projeto preparado inicia nome, objetivo, mensagem e chamada vazios, usando o contexto compartilhado.

**Gerar primeiro post** confirma o catálogo e envia um único pedido explícito pelo fluxo de conversa, com a revisão aprovada no clique. Recarregar ou abrir o post não repete essa intenção. **Continuar para criação** mantém o caminho de edição sem pedir geração. A candidata de referências segue o contrato de transferência para a v0.

Esta decisão substitui a preparação inicial vazia e a necessidade de um segundo pedido no compositor descritas nos ADRs 0046, 0051 e 0058. A preparação guarda a indicação opcional de primeiro post no estado local. O catálogo remoto continua armazenando somente o nome organizacional.

## Adendo (23/11/2026) — Nome inicial distinto do 1º post e entrada direta no Estúdio

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, itens 1 e 5, em alinhamento com os adendos dos [ADRs 0044](0044-preparacao-guiada-e-estudio-por-post.md) e [0058](0058-referencias-focadas-e-aprendizados-do-perfil.md)):

### O que muda ou é substituído

1. **Nome sugerido distinto do projeto para o 1º post (item 5):** No 2º parágrafo, fica substituída a regra `"o nome do projeto sugere o nome organizacional do primeiro post"` (clonagem de `projectDetails.title`). O primeiro post passa a receber um **nome organizacional sugerido distinto do nome do projeto** (`"Post 1 · Abertura"`), aplicado uma única vez no início.
2. **Entrada direta no Estúdio no funil de 2 telas (item 1, referência cruzada):** Nos 2º e 3º parágrafos, **quando `defaultAvailable === true`** ([ADR 0038](0038-chave-padrao-openai-no-vault.md)), fica substituída a passagem obrigatória pela tela intermediária de pedido (`prepare-post`) após Referências. Na Tela 1 (`Projeto e contexto`, sob `<JourneyStepper>` `1. Projeto e contexto` → `2. Criar no estúdio` → `3. Salvar e postar`), o botão `"Ir para o primeiro post →"` confirma o catálogo em `/api/posts` com o nome distinto sugerido e abre diretamente a Tela 2 (`Estúdio`) sem disparar geração automática (semântica de `"Continuar para criação"`).

### O que permanece inalterado

- A editabilidade do nome do post (`<= 200` caracteres), sua independência do texto da arte, a persistência em `project_posts` sob RLS somente após recibo de `/api/posts` ([ADR 0051](0051-nome-confirmacao-e-exclusao-de-posts.md)) e a preservação de edições em reabertura ou recarga.
- **`"Criar novo post"` em projeto já preparado** continua iniciando `nome`, `objetivo`, `mensagem` e `chamada` vazios a partir do contexto compartilhado — salvo seleção explícita pela pessoa de um ponto de partida opcional (`POST_ANGLE_STARTERS`), que apenas pré-preenche campos locais sem iniciar geração de imagem ou IA.
- **Zero geração automática** ao criar projeto, editar contexto, receber `defaultAvailable === true`, abrir referências, recarregar, escolher `POST_ANGLE_STARTERS` ou entrar no Estúdio; visibilidade de **Enviar imagem** e **Pedir 3 propostas** em Referências, envio independente da credencial de IA, autoridade/consentimento dos [ADRs 0067](0067-autoridade-de-referencias-com-cas.md) e [0072](0072-triagem-visual-no-post-e-lote.md), transferência condicional da candidata à v0 ([ADR 0054](0054-bancada-de-referencias-e-rascunho-v0.md)), fallback de escolha de IA quando `defaultAvailable === false` e prioridade BYOK sem fallback ([ADR 0038](0038-chave-padrao-openai-no-vault.md)).

### Verificação

- Verificar em testes de navegador que o 1º post é sugerido como `"Post 1 · Abertura"` (distinto do título do projeto), permanece editável dentro do limite e não dispara geração automática nem pré-preenche novos posts em `"Criar novo post"` (implementação em curso na etapa correspondente).
