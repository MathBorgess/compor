# ADR 0037 — Referências sugeridas e retorno ao post

- Estado: accepted
- Data: 09/11/2026
- Fonte: pedido de Matheus e resposta “Aceito todas” às quatro recomendações da [issue #33](https://github.com/MathBorgess/compor/issues/33), registrados em 09/11/2026 na sessão do Claude Code.

## Decisão de produto

A ideia do projeto basta para apresentar sugestões e, com a chave conectada, iniciar o primeiro lote de três propostas. A busca externa no Pinterest depende de consentimento uma vez por sessão. Sem consentimento, o aplicativo pode consultar o histórico da própria conta, mas não busca no Pinterest nem carrega suas prévias externas. Uma referência sugerida continua sendo dado externo não confiável: não entra no contexto ou no modelo antes da escolha da pessoa.

O editor oferece “Escolher mais referências”. A ida e a volta preservam rascunho, imagem, versões e conversa. Na tela de referências, “Voltar ao post” retorna à edição existente. A exploração só inicia imagens na tela de referências. Continuam os lotes de três, a espera visível de 15 segundos, a parada após duas rodadas sem retorno, o bloqueio por resultado desconhecido e a espera pela resposta à pergunta do turno de seleção.

As sugestões priorizam referências escolhidas pela própria conta em outros projetos. Entre elas, vêm primeiro as ligadas a versões explicitamente aprovadas. “Bem-sucedida” significa esse vínculo registrado; não demonstra resultado de audiência, qualidade criativa ou preferência de outra conta.

A composição cumulativa mantém a faixa de contexto no topo do [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md). A ideia inicial persiste por conta e projeto em `projectIdea`, junto do estado de título provisório e dos fatos da oferta. Ela não se transforma em fato confirmado, não preenche outro projeto e não resolve um conflito de público por suposição. Tanto a conversa da pessoa quanto o turno automático de seleção recebem fatos e resolução de público; editar um fato invalida o contexto de uma leitura pendente.

## Histórico e aprovação no servidor

O sinal `selected` pode incluir os metadados validados do pin: identificador, título, board, origem e URL da prévia. Eles precisam corresponder ao pin do sinal. O banco armazena somente metadados, sem hospedar a imagem externa. Repetir a operação com o mesmo UUID só é aceito quando os dados persistidos são idênticos. Os sinais antigos continuam legíveis; quando não há metadados suficientes para um card, o servidor não inventa uma prévia.

`POST /api/studio/references/history`, com `{projectId}`, exige sessão, origem e acesso ao projeto. Ele retorna somente o histórico da conta autenticada e não faz uma requisição externa. Cada item tem o contrato de `ExploredReference`, `approvedVersions` e `selectedAt`. Por decisão delegada ao diretor AX em 10/11/2026, a última escolha ou recusa do projeto atual decide se o pin aparece; comentários são neutros. A recusa suprime o pin no histórico e no RSS desse projeto, até uma nova escolha explícita. Ela não cria veto ou score global: uma aprovação real ou escolha anterior com metadados em A continua candidata em C, mesmo após recusa em B ou no próprio A. Esses fatos históricos não são apagados e referências já presentes no contexto não são removidas automaticamente. A rota passa o projeto atual para `list_reference_history(p_project_id)` e para a busca. A busca com consentimento combina esse histórico com os resultados dos boards e preserva seu contrato anterior de resposta.

A aprovação aceita, opcionalmente, as fontes do contexto em `references`: pins identificados por origem e board, ou imagens geradas identificadas pelo projeto e imagem. A RPC `approve_piece_version_with_references` valida a forma da requisição e a propriedade do projeto, e mantém autorização, revisão esperada, conflito e resultado desconhecido da aprovação principal. Antes da primeira aprovação explícita, captura apenas decisões reais da própria conta no mesmo projeto da versão: a última decisão `selected`/`rejected` precisa ser `selected`; comentários são neutros. Imagens geradas também precisam existir e estar concluídas nesse projeto. Outra conta ou outro projeto não redefine a escolha local.

Na integração de 10/11/2026, por delegação explícita de Matheus ao diretor AX, ficou decidido que aprendizagem incompleta não bloqueia a aprovação. Uma referência antiga sem sinal, apenas comentada ou recusada pode continuar no contexto como contraponto; ela não recebe vínculo de sucesso. Não há backfill a partir do moodboard ou dos comentários. A captura e a gravação dos vínculos usam blocos isolados: uma falha de aprendizagem não desfaz uma aprovação confirmada nem a transforma em erro 502. A declaração do navegador não substitui propriedade ou seleção persistida. O histórico inicial pode ficar incompleto; isso é preferível a fabricar crédito.

Os IDs são capturados antes da aprovação, e uma versão já explicitamente aprovada não ganha vínculos novos ao ser reaprovada. Assim, uma seleção posterior não recebe crédito retroativo pela versão anterior; ela pode contribuir para uma nova versão aprovada.

Os vínculos são históricos, sem gravação direta pelo cliente, e sua leitura tem RLS da conta e do projeto. Reaprovar não multiplica o número de versões aprovadas. A RPC anterior, sem referências, continua disponível e não fabrica vínculos retroativos. Imagens geradas podem ser vinculadas à versão, mas não viram sugestões externas de Pinterest.

Na busca externa, a leitura do histórico é opcional: sua indisponibilidade permite continuar pelo RSS sem inventar preferências. Essa tolerância ocorre só depois de validar origem, sessão e acesso ao projeto. A leitura das decisões atuais do projeto continua obrigatória, para que uma falha não faça uma referência recusada reaparecer. Falhas da busca ou do próprio RSS continuam indisponíveis, sem uma nova tentativa automática. A rota dedicada ao histórico também continua informando sua própria indisponibilidade.

## Supersessões

- O [ADR 0022](0022-busca-visual-e-sinais.md) exigia consentimento a cada busca. A pessoa agora consente uma vez por sessão; todas as operações externas ainda dependem desse consentimento.
- O [ADR 0024](0024-exploracao-limitada-e-pecas-flexiveis.md) passa a permitir voltar do editor às referências sem começar outro post. A execução continua restrita à tela de referências e mantém seus limites.
- O [ADR 0029](0029-agente-opinativo-e-pergunta-unica.md) mantém a leitura do gosto, a pergunta única e sua espera. A ideia inicial passa a bastar para o primeiro lote; não é necessário preencher oferta ou direção antes dele.

## Verificação e implantação

Contratos HTTP simulados cobrem consentimento, escopo, metadados, repetição idempotente, histórico e compatibilidade da aprovação antiga. O teste SQL isolado com PGlite cobre isolamento entre contas, seleção no mesmo projeto, comentários neutros, legado sem sinal, rejeição e nova seleção, vínculo de imagem gerada, falha isolada da aprendizagem, ausência de crédito retroativo, recusa restrita ao projeto atual, preservação de sucesso factual para outros projetos, revisão e proibição de alterações diretas.

A migration é aditiva e fica em commit próprio. Só chega à produção no merge final para a `main`, antes do código que depende das colunas e RPCs novas. O layout, as capturas de navegador, a medição de bundle e a validação final com Matheus precisam de evidência própria. Nenhum teste automático autoriza chamada paga ou comprova produção.
