# ADR 0029 — Agente opinativo e pergunta única

- Estado: accepted
- Data: 09/11/2026
- Fonte: revisão do estúdio web por Matheus e decisões dele numa sessão do Claude Code em 09/11/2026.

## Contexto

Na revisão, Matheus pediu um agente "com opinião mais forte", que trate a vontade da pessoa "como sugestão e não mandate". Relatou também que o agente "se perde em tantas opções" selecionadas e deveria mandar "apenas uma única questão, destilando meu gosto".

Hoje, depois de cinco segundos sem mudança na seleção, o turno automático recebe até 20 imagens, o contexto do projeto e as últimas 30 mensagens. A instrução desse turno pede "opções e uma recomendação" e não limita perguntas. Quando a pessoa pede uma peça, a instrução principal manda seguir o pedido.

## Decisão

**Fatos e gosto têm autoridades diferentes.** Um fato da oferta declarado pela pessoa, como preço, data, condição ou característica, é ordem. O agente não o altera nem o inventa. Afirmações contidas em opções sugeridas continuam `sugerido` até a pessoa declará-las, como a entrevista do briefing já faz.

Uma sugestão de gosto é um sinal, seja fala ou seleção, sobre estilo, composição ou direção. O agente a pondera junto com o público, a oferta e as referências, toma posição e diz por quê. Ele pode contestar a mesma sugestão uma vez. Se a pessoa insistir, o agente segue a sugestão. A palavra final continua com a pessoa criadora.

**Uma pergunta por turno.** Cada resposta do agente termina com no máximo uma pergunta. O turno iniciado pela seleção de referências responde com três partes, uma leitura do gosto, uma recomendação e uma pergunta. O modelo responde só com um objeto JSON com os campos `leitura`, `recomendacao` e `pergunta`. O servidor valida esse objeto, exige uma única pergunta no fim de `pergunta` e nenhuma nas outras partes, e compõe o texto da conversa. Uma resposta fora dessa forma encerra o turno como falha, sem nova tentativa automática. A prova assinada da sessão registra que ela foi aberta pela seleção, e a consulta do turno usa essa prova em vez de uma declaração do navegador. Na implementação de 09/11/2026, essa resposta estruturada substituiu a ferramenta com um único campo de pergunta prevista inicialmente. O turno de seleção não tem ferramentas, e uma ferramenta acrescentaria outra ida e volta pelo ciclo de ações para uma resposta sem efeito no projeto.

**A exploração espera a resposta.** Depois da pergunta desse turno, nenhum lote novo de exploração começa até a pessoa responder, selecionar ou comentar uma imagem, ou pedir mais imagens.

## O que muda e o que continua

Esta decisão substitui:

- no [ADR 0021](0021-exploracao-visual-autonoma.md), o turno que "apresenta uma interpretação do gosto com opções e recomendação". Ele passa a apresentar uma leitura, uma recomendação e uma pergunta;
- no [ADR 0024](0024-exploracao-limitada-e-pecas-flexiveis.md), a continuação dos lotes depois desse turno. O limite de duas rodadas sem interação continua valendo nos demais casos;
- na instrução do estúdio, a regra de seguir o pedido da pessoa sem contestar. Ela continua valendo para fatos e para o pedido de gerar. Uma escolha de gosto dentro do pedido pode ser contestada uma vez;
- no `AGENTS.md`, a regra "O agente propõe; o criador aceita, rejeita ou reabre", que ganha a distinção entre fato e sugestão no PR de implementação.

Continuam valendo:

- a decisão da pessoa criadora sobre tensões entre o seu gosto e a persona compradora, dos ADRs [0012](0012-arte-integral-e-deliberacao-adaptativa.md) e [0020](0020-layout-pr17-e-conversa-adaptativa.md). O agente agora toma posição antes dessa decisão;
- `compor_propor_criterio` sem registro de aceite, do [ADR 0016](0016-agente-api-e-ferramentas.md). A metodologia compartilhada com o MCP, do [ADR 0013](0013-agile-deliberation-no-mcp.md), e o MCP remoto não mudam;
- autorização de geração, reservas e tratamento de resultado incerto dos ADRs 0021, 0024 e [0025](0025-prova-de-desfecho-da-exploracao.md).

## Verificação e limites

Testes com fornecedor simulado verificam a forma do turno, a pergunta única, a preservação dos fatos e a pausa da exploração. Eles não mostram se o agente se perde menos nem se a opinião dele ajuda. O teste de comportamento com o modelo real fica com Matheus, depois de todas as issues do feedback, e o resultado é registrado à parte. Enviar menos imagens ao turno automático é uma hipótese a medir, não parte desta decisão.
