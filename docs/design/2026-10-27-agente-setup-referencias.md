# Agente e setup v0 — referências para discussão

Pesquisa documental de 27/10/2026 para o desenho do agente único do Compor. As fontes abaixo são insumos para discussão, não decisões de integração, requisitos automaticamente adotados ou demonstrações de qualidade. Nenhuma skill ou servidor foi instalado, executado ou testado neste levantamento.

## Direção já acordada

- **Q63:** a pessoa pode começar pelo objetivo e pelas referências; a BYOK é solicitada antes da primeira conversa com IA.
- **Q64:** durante a conversa inicial, o agente pode propor palavras e ideias textuais. Imagens e moodboards dependem de uma ação explícita de exploração.
- **Q65:** o primeiro piloto usa referências fornecidas pela pessoa e imagens geradas pelo Compor; busca automática de referências na internet fica para depois.
- **Q66:** adaptar os métodos em skills internas versionadas e tools do Compor; integrações MCP externas serão avaliadas separadamente.
- **Q67:** renderizar a nuvem de palavras no navegador, com pesos explicáveis e editáveis pela pessoa.
- **Q68:** propor ideias iniciais a partir do objetivo mesmo sem perfil ou referências, distinguindo hipóteses de escolhas confirmadas.
- **Q69:** organizar o agente em quatro skills internas: compreender intenção e referências; traduzir conceitos em direção visual; explorar moodboards; apoiar a criação do piloto.
- **Q70:** na nuvem de palavras, distinguir frequência, relevância sugerida e escolha da pessoa. Pesos são editáveis e não se tornam, por si só, preferências confirmadas.
- **Q71:** manter um conjunto revisável de rejeições, com motivo opcional, preservando a diferença entre rejeição observada e hipótese sobre a causa.
- **Q72:** apresentar hipóteses de cor, tipografia, textura e composição para a pessoa revisar e ajustar.
- **Q73:** oferecer formas abstratas geométricas ajustáveis no navegador para explorar a direção antes da geração de imagens.
- **Q74:** o setup recebe uma chave OpenAI existente; não inclui instruções para criar a chave ou configurar a cobrança.
- **Q75:** manter um catálogo versionado e carregar as instruções relevantes à tarefa, sem exigir sandbox como condição do fluxo.
- **Q76:** conduzir uma conversa gradual, semelhante ao processo de *grilling*, para construir entendimento mútuo, sem fixar número de perguntas ou presumir aceite.
- **Q77:** apresentar inicialmente duas direções contrastantes e permitir ampliar a exploração sob demanda.
- **Q78:** usar checkpoints quando necessário para a pessoa confirmar ou corrigir uma interpretação, sem bloquear a apresentação de ideias.
- **Q79:** apresentar um catálogo de nomes e descrições e disponibilizar uma tool para carregar sob demanda a versão relevante. O backend controla permissões e operações; não se presume descoberta automática pelo Agents SDK básico.
- A direção vigente mantém um agente com OpenAI Agents SDK, sem subagentes na v0, memórias por escopo e hipóteses de preferência reversíveis. O acesso à IA usa BYOK da pessoa; a chave da equipe é restrita a testes internos. O [resumo da arquitetura](../arquitetura-v0.md) registra os demais limites, inclusive consentimento, observabilidade e revisão humana.

## Desenho conceitual das quatro skills

As skills são instruções internas versionadas para um único agente, não subagentes. A tabela mostra exemplos de responsabilidades e de ferramentas que poderiam apoiá-las; **nomes de tools são ilustrativos**, não contratos de API decididos nem funcionalidades implementadas. O mesmo recurso pode apoiar mais de uma skill.

O catálogo reúne instruções versionadas; a aplicação disponibiliza ao agente as relevantes para a tarefa e o ponto da conversa. Ao receber uma resposta, o agente revisa o entendimento e escolhe qual capacidade faz sentido em seguida; pode apresentar uma interpretação ou uma proposta para a pessoa aceitar, corrigir ou rejeitar. A conversa não exige uma quantidade fixa de perguntas e não transforma silêncio ou prosseguimento em aprovação. Duas direções contrastantes são o ponto de partida da exploração visual, que pode ser ampliada a pedido. Esse fluxo é um desenho acordado, não uma integração executada ou comprovada.

Quando a interpretação precisar de esclarecimento, um checkpoint oferece à pessoa a possibilidade de confirmar ou corrigir. Ideias podem ser apresentadas enquanto o entendimento amadurece; apresentá-las não equivale a uma decisão humana ou confirmação da interpretação.

### Carregamento de instruções sob demanda — contrato ilustrativo

O modelo recebe um catálogo com **nome e descrição** das skills disponíveis. Quando precisa de uma, pode solicitar à aplicação, por uma tool conceitual como `carregar_skill`, uma identificação de skill e, quando aplicável, a versão escolhida. O backend resolve a versão permitida no catálogo e verifica o contexto, as permissões e as operações disponíveis antes de entregar as instruções relevantes ao modelo. O retorno conceitual identifica a skill e sua versão e contém as instruções autorizadas para aquela tarefa; credenciais e dependências internas permanecem fora desse retorno. Referências da pessoa permanecem dados, e não passam a ter autoridade de instrução por serem recuperadas junto do contexto.

Esse exemplo descreve responsabilidades, não uma API existente, um mecanismo nativo automático de descoberta ou uma integração testada. A identificação, a resolução de versão e o formato do retorno serão definidos na implementação. O backend continua responsável por validar as operações subsequentes, mesmo após carregar uma skill.

| Skill | Exemplos de entrada | Saída revisável | Tools ou recursos de apoio possíveis |
|---|---|---|---|
| **Compreender intenção e referências** | Objetivo e conversa; imagens, frases e rótulos fornecidos pela pessoa; contexto autorizado, quando houver. | Síntese da intenção, dúvidas e hipóteses com origem e escopo; ideias iniciais podem partir apenas do objetivo. | Ler referências selecionadas; recuperar contexto permitido por pessoa, organização e escopo; registrar hipótese reversível com evidência. |
| **Traduzir conceitos em direção visual** | Palavras, referências, rótulos, restrições e o que a pessoa quer variar ou manter. | Hipóteses revisáveis de cor, tipografia, textura e composição; nuvem de palavras com frequência, relevância sugerida e escolhas distinguíveis; formas geométricas ajustáveis antes de gerar imagens. A pessoa pode editar pesos e corrigir leituras. | Consultar contexto autorizado e preparar os dados. Nuvem e formas são renderizadas no navegador, sem envio a serviço de visualização hospedado. |
| **Explorar moodboards** | Direções e referências selecionadas, o que variar/manter e o pedido explícito de exploração. | Alternativas para comparar, rejeitar e refinar; conjunto de rejeições revisável com motivo opcional. | Buscar referências autorizadas do projeto; acionar geração de imagem com a BYOK quando a pessoa solicitar; salvar versões e registrar sinais de interação. |
| **Apoiar a criação do piloto** | Direção escolhida, imagem-base e informações a comunicar. | Piloto revisável com texto, preço e datas editáveis; imagem solicitada sem texto e texto inesperado sujeito à revisão da pessoa. | Acionar geração solicitada; propor ou aplicar edição conforme instrução da pessoa; compor PNG com os textos e permitir copiar a legenda. |

A pessoa pode comparar, rejeitar, editar, desfazer e decidir quando avançar; proposta, aplicação, aprovação e download são ações distintas. Uma observação ou rejeição não confirma por si só uma preferência. Hipóteses proativas mantêm evidência, escopo e reversibilidade; preferências confirmadas são preservadas. Metadados de telemetria são opcionais e conteúdo para avaliação requer autorização própria. Interações anteriores à revogação podem continuar elegíveis para a finalidade autorizada, inclusive se recebidas depois; interações posteriores não entram nessa curadoria. Sem fila e reenvio na v0, falhas podem deixar lacunas. O envio à IA para executar a tarefa não equivale à autorização de uso dos dados para melhoria coletiva.

### Dados do Supabase na melhoria coletiva

Dados de projetos, memórias e referências no Supabase, quando especificamente autorizados para a finalidade de melhoria, podem contribuir para casos e datasets, além dos traces autorizados no MLflow. Neste desenho, **destilação** é a extração e curadoria de recortes autorizados para avaliações e propostas de melhoria das skills, tools e fluxo do agente; não é treinamento de modelos. A equipe revisa os resultados antes de promover mudanças no harness.

Cada caso precisa preservar sua origem, versão, escopo, data e autorização aplicável. Usar a memória para personalização individual não concede, por si só, acesso para curadoria coletiva; não se pressupõe acesso irrestrito ao banco ou anonimização dos dados pessoais. Os trechos relativos a interações anteriores à revogação continuam elegíveis somente na finalidade autorizada, inclusive se recebidos depois; dados posteriores não entram nessa curadoria. Esse fluxo é uma decisão de desenho: ainda não há integração, acesso ou anonimização comprovados.

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

A [documentação oficial do Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) descreve execução do agente na aplicação, com ferramentas, estado e decisões de acesso sob responsabilidade do servidor. A [documentação de Skills](https://developers.openai.com/api/docs/guides/tools-skills) descreve mecanismos relacionados à Responses API com shell e a sandboxes; ela não demonstra descoberta automática de `SKILL.md` em um agente básico Next.js. O catálogo não depende de sandbox obrigatório; a implementação concreta do carregamento das instruções relevantes e eventuais integrações externas continuam a verificar.

Os conteúdos de referências externas são dados não confiáveis, não instruções para sobrepor as escolhas da pessoa. Qualquer uso de serviços adicionais deve respeitar as autorizações, o escopo e a origem dos dados. Licença de código não comprova direitos sobre imagens de terceiros. Nenhum teste de PT-BR, desempenho, custos reais, proteção de dados ou qualidade de geração foi feito nesta pesquisa.
