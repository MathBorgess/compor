# ADR 0044 — Preparação guiada e estúdio por post

- Estado: decisão de produto aprovada; implementação local disponível para avaliação.
- Data: 15/11/2026.
- Fonte: fluxo de caixas e setas aprovado pela pessoa usuária nesta conversa, seguido de autorização para implementação completa e avaliação local ao final. Usabilidade é a prioridade; a identidade visual existente deve ser mantida. Nenhum envio ao remoto foi autorizado.

## Decisão

A criação apresenta projeto como contexto compartilhado de vários posts. O novo projeto passa por contexto progressivo, escolha de IA e referências opcionais antes do pedido específico do primeiro post. Voltar e recarregar preservam o preenchimento. Um estado validado de preparação determina a etapa, em vez de inferir a navegação pela presença de texto ou imagem.

Criar projeto, configurar contexto, conectar/escolher IA ou abrir referências não iniciam imagens. Explorar propostas visuais exige uma ação explícita na área de referências. O pedido de criação do post é uma intenção separada da ideia geral; a ideia não fica aguardando reenvio no compositor. A preferência de IA não armazena chave nem substitui autorização. A IA do Compor continua condicionada à disponibilidade real; BYOK continua restrita à OpenAI.

O estúdio identifica projeto/post, apresenta conversa à esquerda e criação à direita e permite expandir/recolher cada área e ajustar a divisão por ponteiro ou teclado. Em largura compacta, Conversa e Post alternam sem apagar rascunhos. A arte atual tem prioridade; variantes, versões e edição de textos ficam acessíveis junto dela. A prévia ampliada permite zoom; marcações continuam vinculadas à versão de origem.

Configurações do projeto reúne contexto, IA, referências, marca/persona, direção, critérios e materiais. A navegação de posts é explícita. As operações de salvar, aprovar, revisar e exportar mantêm contratos distintos. Alterar contexto não modifica pixels já criados; exportar não publica nem aprova.

## Substituições delimitadas

Substitui a chegada automática às referências e o gatilho ideia+chave do ADR 0037, incluindo a aplicação anterior da autonomia do ADR 0021. A ideia continua podendo orientar o primeiro lote depois do pedido explícito. Mantém três imagens sequenciais, intervalo de 15 segundos, duas rodadas sem retorno, pergunta pendente, fontes, reservas, limites e recuperação.

Substitui a faixa de contexto permanentemente exposta do ADR 0031 pela configuração acessível sob demanda; fatos e suas procedências permanecem iguais. Substitui a conversa flutuante do editor do ADR 0023 pelo estúdio dividido. A área dedicada de referências/configurações substitui a disposição de referências/conversa do ADR 0041 na aplicação atual; a leitura estruturada e as respostas rápidas do ADR 0042 permanecem na conversa de referências.

Preserva os contratos de credenciais do ADR 0038: disponibilidade e recarga não são intenção de gerar, BYOK inválida não usa fallback e trocar fonte não autoriza repetir resultado incerto. Não altera o runtime gerenciado nem o contrato próprio do MCP externo. O ADR 0045 descreve conversas, vínculos e compatibilidade.

## Verificação

Usar o roteiro do plano de usabilidade com fornecedores simulados e navegador real. Verificar zero geração na preparação/conexão/recarga, exploração somente por pedido explícito, retorno das configurações sem perda e teclado/compacto. Resultados de gates e avaliação humana serão registrados ao concluir a implementação; este ADR não afirma CI ou deployment aprovado.

Os resultados e limites da verificação local estão no [registro de usabilidade](../quality/frontend-usability-2026-11-15.md). A avaliação manual ainda está pendente e o gate agregado de contratos não foi aprovado no Windows.

## Adendo (23/11/2026) — Funil ultralinear de 2 telas com IA padrão disponível

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, item 1, em conjunto com os adendos dos [ADRs 0058](0058-referencias-focadas-e-aprendizados-do-perfil.md) e [0073](0073-referencias-e-primeiro-pedido.md)):

### O que muda ou é substituído

- Na seção *Decisão* (1º parágrafo), a exigência de percorrer etapas separadas (`"O novo projeto passa por contexto progressivo, escolha de IA e referências opcionais antes do pedido específico do primeiro post"`) e a parada intermediária obrigatória (`prepare-post` / estado inicial `intro` no estúdio que ocultava a criação) são substituídas **quando `defaultAvailable === true`** em `GET /api/ai/credential-status` ([ADR 0038](0038-chave-padrao-openai-no-vault.md)) pelo **funil ultralinear de 2 telas** sob `<JourneyStepper>` de 3 macro-fases (`1. Projeto e contexto` → `2. Criar no estúdio` → `3. Salvar e postar`):
  - **Tela 1 (`Projeto e contexto`)**: reúne o contexto unificado em `<ProjectContextUnified>` e a barra inline de IA (`"IA do Compor pronta · incluída"`, alternativa `"Usar minha chave OpenAI"` e `<ReviewDisclosureBadge compact />` do [ADR 0075](0075-revisao-de-candidatas-a-imagem.md)), mantendo Referências opcionais e o botão `"Ir para o primeiro post →"`, que confirma o 1º post em `/api/posts` (com nome organizacional distinto do título do projeto, conforme o [ADR 0073](0073-referencias-e-primeiro-pedido.md)) e conduz diretamente à **Tela 2 (`Estúdio`)** com conversa e criação visíveis.

### O que permanece inalterado

- **Zero geração automática** de imagem ou IA ao criar projeto, editar contexto, receber `defaultAvailable === true`, conectar/escolher IA, abrir referências, recarregar a página, escolher sugestões em `POST_ANGLE_STARTERS` ou entrar na Tela 2 (`Estúdio`); qualquer geração exige pedido explícito.
- **Fallback explícito quando `defaultAvailable === false`**: permanece o fluxo explícito de escolha e conexão de IA (BYOK) antes da geração.
- **Credenciais e preferência de IA**: conexão explícita de BYOK mantém prioridade e **nenhum fallback** para a chave padrão em caso de chave inválida ou falha ([ADR 0038](0038-chave-padrao-openai-no-vault.md)); novos projetos continuam inicializando `workflow.aiPreference='default'` sem armazenar chave nem autorizar geração ([ADR 0052](0052-ia-inicial-e-jornada-unica-no-estudio.md)).
- Navegação guiada por estado validado, preservação de preenchimento em voltar/recarregar, divisão conversa/criação e alternância compacta sem descarte de rascunho, zoom, Configurações em modal, contratos distintos de salvar/aprovar/revisar/exportar, isolamento de conversas por post ([ADR 0045](0045-conversas-isoladas-por-post.md)) e lotes/intervalos/pausas/recuperação.

### Verificação

- Conferir em testes de navegador os dois caminhos (`defaultAvailable === true` em funil de 2 telas e `defaultAvailable === false` no fallback explícito de IA), atestando ausência de geração automática na entrada, na edição de contexto, na abertura de referências e na recarga (implementação da UI em curso na etapa correspondente).
