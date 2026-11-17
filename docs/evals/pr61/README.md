# Avaliação das cinco etapas do agente do Compor

Desenho e primeira baseline do PR #61, revisão inicial `8817f57`. A unidade de avaliação é uma tarefa de criação no contexto de um post. Uma tarefa pode pular referências, pedir novas direções e voltar a uma versão anterior. Cada imagem de um lote e cada versão têm identidade própria.

| Etapa e responsável pela decisão | Entrega que a próxima etapa pode usar | Métrica primária proposta e critério de sucesso |
|---|---|---|
| [1. Briefing](01-briefing.md) · agente e criador | Oferta, comprador, necessidade, valor e abordagem de venda, com as fontes e dúvidas relevantes. | Entre briefings avaliáveis, proporção utilizável sem correção material de fatos, oferta ou comprador. A síntese precisa explicar o que vender, a quem, por que importa e como começar. Uma hipótese marcada é admissível. |
| [2. Sugestões](02-referencias.md) · busca Phoenix e criador | Candidatas relevantes e escolhas explícitas por post, com a origem preservada. | Entre jornadas comparáveis com sugestões vistas, aumentar escolhas úteis por jornada e reduzir pedidos **adicionais** de proposta até a escolha ou avanço, preservando a taxa de avanço. Registrar o motivo quando a pessoa pede mais para explorar. Em casos offline, medir pertinência entre as quatro primeiras posições e cobertura de descoberta. |
| [3. Triagem](03-triagem.md) · Agents API e servidor | Para o GPT Image, o conjunto de arquivos admitido e um prompt por proposta. Para a avaliação, a função visual esperada de cada entrada e a evidência disponível do destino. | Reter as referências obrigatórias e os atributos essenciais, e reduzir custo conhecido por saída utilizável comparando casos equivalentes. Julgar no resultado o atributo pedido (paleta, estrutura, produto). Discriminar anexo, atributo descrito com atribuição demonstrável, omissão e destino indeterminado. |
| [4. Variação e convergência](04-variacoes.md) · planejador, GPT Image e criador | Três caminhos dentro da direção. O comentário e a escolha do criador qualificam a rodada seguinte. | Por lote completo, contar alternativas distinguíveis **e** utilizáveis. Por par de lotes com feedback, medir se a preferência construída pelo criador se tornou mais reconhecível. Uma solicitação de nova direção inicia outro grupo de comparação. |
| [5. Vontade de usar](05-post.md) · criador | Arte e legenda da versão, eventual pedido de variação e sua intenção de uso. A resposta pode orientar a etapa 1 ou 4 de uma nova rodada. | Por versão exposta e avaliada, registrar vontade de usar a peça e confiança declarada no objetivo. Por tarefa, contar se as variantes avaliadas continuaram utilizáveis. Preservar separadamente exploração voluntária, correção, aprovação explícita, aprovação herdada, exportação e resultado posterior observado. |

## Como operar o juiz

1. Fixar antes do ensaio o briefing, fatos obrigatórios, funções esperadas das referências, posição das versões na linhagem, rubrica e casos de comparação. Manter conjunto de desenvolvimento separado dos casos reservados. Derivar a amostra do pedido de avaliação e das permissões para essa finalidade.
2. Para texto, entregar ao juiz o briefing e a saída produzida. Para visual, entregar os pixels e a legenda efetiva quando ela fizer parte do critério. Omitir marca da candidata, preço do modelo e autoria. Alternar a ordem A/B e conservar as respostas em desacordo. O juiz registra critério, evidência visível ou trecho, resultado e abstenção. A pessoa pode abrir a evidência que sustenta o resultado.
3. Usar verificações determinísticas para autoridade, integridade do transporte, fatos literais conferíveis, origem da versão e repetição de efeitos. Usar LLM como crítico da saída e, em piloto consentido, confrontar os julgamentos com escolhas humanas. Comparar por etapa, caso e modalidade de evidência. Usabilidade, empolgação declarada, publicação e desempenho posterior têm observadores diferentes.
4. Divulgar contagens, denominadores, cobertura e desconhecidos. Distinguir decisões humanas visíveis, julgamento por modelo e verificação do runtime com serviços simulados. Em lotes, reportar latência até primeira e última imagem visíveis, separando os 15 s de espera intencional. Contar custos apenas onde o uso e as tarifas forem conhecidos. Ausência de telemetria não adiciona votos.
5. Promover uma candidata só com ganho medido no critério pré-declarado, controles mantidos e revisão humana compatível com a alegação. O conjunto de desenvolvimento pode localizar e corrigir um defeito. Uma amostra pequena ou sem usuários continua inconclusiva para benefícios de produto. Reutilizar recibos para reconciliar resultados incertos.

## Primeiro ciclo escolhido pelo criador

Em 17/11/2026, Matheus priorizou a **triagem de imagens**. O experimento de descoberta ficou numa branch local separada. Para a publicação, determinou preservar todas as rotas e o orçamento de 300.000 bytes gzip do cliente.

**Hipótese.** Identificar a origem correta junto aos pixels e distinguir a função visual de cada referência ajuda o planejador a preservar a imagem obrigatória, usar anexos onde a fidelidade visual depende deles e descrever nos prompts atributos simples de referências opcionais.

**Critérios fixados antes do reteste.** No caso misto da etapa 3, o rótulo ao lado de cada uma das quatro imagens deve corresponder ao manifesto (baseline 1/4) e às regras de obrigatoriedade. Repetir com uploads sem extras e ordem diferente. Manter validação de origem, bytes, ordem, rejeição de ID não escolhido e reconciliação do mesmo pedido. No julgamento semântico pareado, considerar fidelidade dos atributos explícitos, anexos justificados e omissão honesta. A melhoria dos rótulos pode ser promovida com teste do pedido real preparado pelo adaptador e controle de regressão. Aprovar menor custo ou aumento de similaridade exigiria medir uso conhecido e avaliar os pixels finais em condições comparáveis.

**Decisão de promoção.** Registrar separadamente resultado técnico, retorno do juiz e lacunas. O primeiro ciclo não altera a política de anexar todos os uploads escolhidos nem exige que novos campos existam nos planos e recibos antigos. Os dados de desenvolvimento são sintéticos ou artefatos de avaliação versionados. [Decisão sobre feedback e evolução](../../adr/0006-feedback-e-evolucao-do-harness.md).

## Resultado da candidata de triagem

O defeito corrigido no código do estúdio era verificável no corpo da requisição. O manifesto tinha a origem certa, mas o texto ao lado de cada imagem chamava todas elas de locais. Na [revisão da correção](https://github.com/MathBorgess/compor/commit/41e1f8c), o rótulo vem do mesmo item validado do manifesto que identifica os bytes.

| Evidência do ciclo | Resultado |
|---|---|
| Origem junto aos pixels na oficina | 1/4 correta na baseline → 4/4 na candidata. Na mostra de gravuras, as quatro origens também conferiram. |
| Julgamento cego dos planos com a correção de rótulos | Oficina 6/8 → 6/8. Mostra de gravuras 8/8 → 8/8. Foram replays sintéticos via Codex e o juiz avaliou planos. |
| Experimento de substituir anexos por descrições | Uma descrição podia levar a composição para o centro apesar de a referência exigir o bloco à esquerda. A alteração das instruções foi rejeitada. |
| Resultado com pessoas e GPT Image | Sem amostra de imagens geradas por esse PR no ensaio. Similaridade final, economia em dinheiro, empolgação e uso permanecem desconhecidos. |

A [avaliação da triagem](03-triagem.md) registra as execuções, as condições dos modelos, a cobertura e os julgamentos. As demais etapas conservam suas baselines para a próxima comparação. A [experiência de descoberta](02-referencias.md) ficou isolada da entrega por decisão do criador.
