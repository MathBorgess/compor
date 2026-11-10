# ADR 0037 — Referências sugeridas e retorno ao post

- Estado: accepted
- Data: 09/11/2026
- Fonte: pedido de Matheus e resposta “Aceito todas” às quatro recomendações da [issue #33](https://github.com/MathBorgess/compor/issues/33), registrados em 09/11/2026 na sessão do Claude Code.

## Decisão de produto

A ideia do projeto basta para apresentar sugestões e, com a chave conectada, iniciar o primeiro lote de três propostas. A busca externa no Pinterest depende de consentimento uma vez por sessão. Sem consentimento, o aplicativo pode consultar o histórico da própria conta, mas não busca no Pinterest nem carrega suas prévias externas. Uma referência sugerida continua sendo dado externo não confiável: não entra no contexto ou no modelo antes da escolha da pessoa.

O editor oferece “Escolher mais referências”. A ida e a volta preservam rascunho, imagem, versões e conversa. Na tela de referências, “Voltar ao post” retorna à edição existente. A exploração só inicia imagens na tela de referências. Continuam os lotes de três, a espera visível de 15 segundos, a parada após duas rodadas sem retorno, o bloqueio por resultado desconhecido e a espera pela resposta à pergunta do turno de seleção.

As sugestões priorizam referências escolhidas pela própria conta em outros projetos. Entre elas, vêm primeiro as ligadas a versões explicitamente aprovadas. “Bem-sucedida” significa esse vínculo registrado; não demonstra resultado de audiência, qualidade criativa ou preferência de outra conta.

## Histórico e aprovação no servidor

O sinal `selected` pode incluir os metadados validados do pin: identificador, título, board, origem e URL da prévia. Eles precisam corresponder ao pin do sinal. O banco armazena somente metadados, sem hospedar a imagem externa. Repetir a operação com o mesmo UUID só é aceito quando os dados persistidos são idênticos. Os sinais antigos continuam legíveis; quando não há metadados suficientes para um card, o servidor não inventa uma prévia.

`POST /api/studio/references/history`, com `{projectId}`, exige sessão, origem e acesso ao projeto. Ele retorna somente o histórico da conta autenticada e não faz uma requisição externa. Cada item tem o contrato de `ExploredReference`, `approvedVersions` e `selectedAt`. Uma recusa posterior exclui o pin das sugestões. A busca com consentimento combina esse histórico com os resultados dos boards e preserva seu contrato anterior de resposta.

A aprovação aceita, opcionalmente, as fontes do contexto em `references`: pins identificados por origem e board, ou imagens geradas identificadas pelo projeto e imagem. A RPC `approve_piece_version_with_references` verifica dentro da transação as seleções reais e vigentes da própria conta; pins precisam ter sido escolhidos no projeto aprovado e imagens geradas precisam existir e estar concluídas num projeto da conta. Ela aprova a versão com a revisão esperada e grava os vínculos juntos. Uma fonte inválida impede a aprovação inteira. A declaração do navegador não substitui propriedade ou seleção persistida.

Os vínculos são históricos, sem gravação direta pelo cliente, e sua leitura tem RLS da conta e do projeto. Reaprovar não multiplica o número de versões aprovadas. A RPC anterior, sem referências, continua disponível e não fabrica vínculos retroativos. Imagens geradas podem ser vinculadas à versão, mas não viram sugestões externas de Pinterest.

## Supersessões

- O [ADR 0022](0022-busca-visual-e-sinais.md) exigia consentimento a cada busca. A pessoa agora consente uma vez por sessão; todas as operações externas ainda dependem desse consentimento.
- O [ADR 0024](0024-exploracao-limitada-e-pecas-flexiveis.md) passa a permitir voltar do editor às referências sem começar outro post. A execução continua restrita à tela de referências e mantém seus limites.
- O [ADR 0029](0029-agente-opinativo-e-pergunta-unica.md) mantém a leitura do gosto, a pergunta única e sua espera. A ideia inicial passa a bastar para o primeiro lote; não é necessário preencher oferta ou direção antes dele.

## Verificação e implantação

Contratos HTTP simulados cobrem consentimento, escopo, metadados, repetição idempotente, histórico e compatibilidade da aprovação antiga. O teste SQL isolado com PGlite cobre isolamento entre contas, seleção de projeto incorreto, rejeição posterior, vínculo de imagem gerada, atomicidade, revisão e proibição de alterações diretas.

A migration é aditiva e fica em commit próprio. Só chega à produção no merge final para a `main`, antes do código que depende das colunas e RPCs novas. O layout, as capturas de navegador, a medição de bundle e a validação final com Matheus precisam de evidência própria. Nenhum teste automático autoriza chamada paga ou comprova produção.
