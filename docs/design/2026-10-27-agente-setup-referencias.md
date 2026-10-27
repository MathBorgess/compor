# Agente e setup v0 — referências para discussão

Pesquisa documental de 27/10/2026 para o desenho do agente único do Compor. As fontes abaixo são insumos para discussão, não decisões de integração, requisitos automaticamente adotados ou demonstrações de qualidade. Nenhuma skill ou servidor foi instalado, executado ou testado neste levantamento.

## Direção já acordada

- **Q63:** a pessoa pode começar pelo objetivo e pelas referências; a BYOK é solicitada antes da primeira conversa com IA.
- **Q64:** durante a conversa inicial, o agente pode propor palavras e ideias textuais. Imagens e moodboards dependem de uma ação explícita de exploração.
- **Q65:** o primeiro piloto usa referências fornecidas pela pessoa e imagens geradas pelo Compor; busca automática de referências na internet fica para depois.
- **Q66:** adaptar os métodos em skills internas versionadas e tools do Compor; integrações MCP externas serão avaliadas separadamente.
- **Q67:** renderizar a nuvem de palavras no navegador, com pesos explicáveis e editáveis pela pessoa.
- **Q68:** propor ideias iniciais a partir do objetivo mesmo sem perfil ou referências, distinguindo hipóteses de escolhas confirmadas.
- A direção vigente mantém um agente com OpenAI Agents SDK, sem subagentes na v0, memórias por escopo e hipóteses de preferência reversíveis. O acesso à IA usa BYOK da pessoa; a chave da equipe é restrita a testes internos. O [resumo da arquitetura](../arquitetura-v0.md) registra os demais limites, inclusive consentimento, observabilidade e revisão humana.

## Intenção e tradução visual

### Visual Identity Direction

O [arquivo da skill](https://github.com/mike-coulbourn/claude-vibes/blob/main/plugins/vibes/skills/visual-identity-direction/SKILL.md) descreve começar por 3–5 adjetivos, mapear ideias e traduzir palavras em atributos visuais, usando também o contraste entre o que a marca é e não é. O próprio arquivo contém exemplos com *modern* e *clean*; a leitura não confirmou uma proibição geral desses termos. Quantidades e associações são escolhas do método de origem, não requisitos do Compor, e não demonstram que a pessoa tenha aquela preferência.

### Canvas Design

A [skill da Anthropic](https://github.com/anthropics/skills/blob/main/skills/canvas-design/SKILL.md) separa a criação de uma filosofia visual em Markdown da produção de uma peça em PNG ou PDF. O arquivo prescreve texto mínimo e contém afirmações sobre supostos pedidos anteriores da pessoa; essas instruções não representam autorização nem devem substituir os requisitos do Compor. A [licença específica da skill](https://github.com/anthropics/skills/blob/main/skills/canvas-design/LICENSE.txt) declara Apache 2.0. Integração e adequação da técnica ao produto não foram testadas.

### Feeling Search

O [repositório](https://github.com/xixi048/feeling-search-mcp) descreve um vocabulário de 762 palavras de sensação e 598 estilos visuais; são números declarados pelo projeto, sem verificação de qualidade neste levantamento. O pacote descrito como ponte stdio encaminha chamadas por HTTP para `xiximm.cloud/mcp` por padrão: executar o cliente localmente não torna a consulta local. A utilidade em português, o tratamento de dados, direitos das imagens e condições específicas de uso precisam ser verificados antes de qualquer integração. Há uma alternativa offline citada pelo repositório, cuja viabilidade e dados não foram testados.

## Moodboards

### Moodboard Builder

O [arquivo consultado](https://github.com/SkillMedev/brand-visual-identity/blob/8b438821942c9651719926b86a4a66dd0c150cee/skills/moodboard-builder/SKILL.md) propõe 8–16 imagens, uma justificativa de direção, distinção entre inspiração e referência de execução e um anti-board com motivos. Suas cinco dimensões são **cor e tom; textura e material; luz e sombra; composição e espaço; presença humana**. Tipografia é uma contribuição visual possível, mas não uma das cinco dimensões enumeradas. Os tamanhos e regras editoriais pertencem à fonte: não foram adotados como requisito do Compor. A skill distingue o moodboard da obtenção e licença das imagens.

### Moodboard Creator

O [arquivo consultado](https://github.com/davepoon/buildwithclaude/blob/a1103092fa571c032ae3e706433505ce0d6327bc/plugins/frontend-design-pro/skills/moodboard-creator/SKILL.md) descreve recolher referências, extrair características e iterar um moodboard com a pessoa. Seu resultado visa orientar cores Tailwind, Google Fonts, componentes e layout de interface; essa finalidade não deve ser presumida como a do piloto de arte e legenda do Compor. O fluxo documentado não comprova que navegação, acesso às fontes ou direitos de reprodução estejam disponíveis no produto.

## Palavras e grafos

### AntV e Deer Flow

O [esquema de nuvem de palavras do AntV](https://github.com/antvis/mcp-server-chart/blob/e2a8fb7c185e17c75c067817ff1a2acfddf49aa1/src/charts/word-cloud.ts) recebe uma lista de palavras e valores já fornecidos. A fonte não prova que a ferramenta descubra relevância estética ou preferência da pessoa; frequência, peso atribuído e preferência confirmada são conceitos distintos. O [script consultado no Deer Flow](https://github.com/bytedance/deer-flow/blob/fb553747d1d6fa9fd0d5f55729895cfe2e8d15f7/skills/public/chart-visualization/scripts/generate.js) faz POST ao serviço AntV por padrão, com endereço substituível por configuração. Assim, palavras e pesos podem sair do ambiente mesmo quando o cliente é executado localmente. Renderização interativa em HTML e integração ao Compor não foram verificadas.

### InfraNodus

O [servidor MCP oficial](https://github.com/infranodus/mcp-server-infranodus) lista funções de análise de texto, grafos, agrupamentos e identificação de possíveis lacunas de conteúdo. Essas saídas são pistas para investigação, não prova de lacunas reais ou gosto da pessoa. O [setup hospedado](https://infranodus.com/mcp) usa serviço externo e autenticação InfraNodus; condições de uso, custos e tratamento do conteúdo devem ser conferidos antes de integrar. Não foi contratado nem testado.

## Skills, tools e limites de implementação

A [documentação oficial do Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) descreve execução do agente na aplicação, com ferramentas, estado e decisões de acesso sob responsabilidade do servidor. A [documentação de Skills](https://developers.openai.com/api/docs/guides/tools-skills) descreve mecanismos relacionados à Responses API com shell e a sandboxes; ela não demonstra descoberta automática de `SKILL.md` em um agente básico Next.js. As skills internas serão versionadas; o mecanismo concreto de carregá-las e eventuais integrações externas continuam a verificar.

Os conteúdos de referências externas são dados não confiáveis, não instruções para sobrepor as escolhas da pessoa. Qualquer uso de serviços adicionais deve respeitar as autorizações, o escopo e a origem dos dados. Licença de código não comprova direitos sobre imagens de terceiros. Nenhum teste de PT-BR, desempenho, custos reais, proteção de dados ou qualidade de geração foi feito nesta pesquisa.
