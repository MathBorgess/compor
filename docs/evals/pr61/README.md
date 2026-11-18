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
| Pixels do GPT Image, uma arte por revisão | Mostra de gravuras 6/8 → 7/8 no julgamento cego. O ponto veio do pontilhado. As duas composições ficaram parciais. A candidata escreveu “entrada gratuita” sem essa informação no briefing. |
| Custo e experiência do criador | Nas duas revisões chegaram os mesmos quatro anexos ao GPT Image, 585 bytes e 16 tokens de imagem de entrada. O uso do planejamento anterior ficou desconhecido. A cobrança, a intenção de uso e a resposta do público continuam sem observação. |

A [avaliação da triagem](03-triagem.md) registra as execuções, as condições dos modelos, a cobertura e os julgamentos. As demais etapas conservam suas baselines para a próxima comparação. A [experiência de descoberta](02-referencias.md) ficou isolada da entrega por decisão do criador.

## Ciclo com três a cinco execuções por marco

Escolha de três a cinco casos distintos antes de avaliar. Neste ensaio fixamos cinco por marco, três de desenvolvimento e dois de reserva. A baseline e cada uma das três revisões recebem novas saídas para os mesmos briefings. Na busca determinística, registre novamente os IDs e a ordem. Isso permite identificar quando uma variação vem apenas do juiz.

| Marco | Pacote entregue à sessão independente | Evidência para a próxima revisão |
| --- | --- | --- |
| Briefing | Pedido, contexto efetivamente transferido ao plano e resposta textual por caso. | Seis dimensões, trecho preciso, fato inventado ou omitido e uma correção verificável. [Executor](../../../scripts/evals/pr61/briefing/group.mjs) |
| Coleta de referências | Necessidade declarada, quatro posições da busca e seus títulos. | Pertinência por posição, sinal de recusa e cobertura de descoberta. [Executor](../../../scripts/evals/pr61/referencias/group.mjs) |
| Triagem | Dois juízes independentes recebem, respectivamente, planos com manifesto e artes com referências. | Por proposta, identificar o atributo preservado, parcial, perdido ou indeterminado. Verificar em separado quais bytes foram anexados. [Protocolo](../../../scripts/evals/pr61/triagem/protocolo-rodadas.md) |
| Variação | Os mesmos casos com as três propostas em ordem cega. Juízos independentes de prompt e de pixels. | Evidência por par de propostas e próximo teste de composição. [Juiz](../../../scripts/evals/pr61/variacoes/juiz.py) |
| Post | Briefing e três artes por caso a 360 px, com acesso aos originais. | Gancho, leitura, adequação e fatos por arte. A vontade de usar exige resposta do criador. [Rubrica](../../../scripts/evals/pr61/post/rubrica.md) |

Fixe a rubrica, a divisão entre desenvolvimento e reserva e os critérios de promoção antes das chamadas. Dê ao juiz somente os dados cegos do grupo. Libere ao autor da candidata os trechos dos casos de desenvolvimento. Quando uma sugestão do juiz contrariar texto ou fatos declarados, prevalece o briefing. Documente a mudança escolhida e uma previsão verificável. Congele a revisão antes de gerar as próximas execuções. Abra os resultados de reserva após o último julgamento. Publique a distribuição por caso, as falhas críticas e as limitações do ensaio.

Para um ensaio visual concluído, o comando abaixo confere os quatro planos de execução, os hashes dos três pareceres que precederam cada mudança, os recibos de cada slot, a entrega dos anexos selecionados e os intervalos medidos. A auditoria lê arquivos locais.

```sh
python3 scripts/evals/pr61/grupos/auditar-ensaio.py "$bancada"
```

A geração com o provedor tem orçamento próprio. No ensaio de novembro, cada caso consumiu um plano gerenciado e três artes. O mesmo lote sustentou os três marcos visuais. A chave ficou em memória no executor local. Os testes de código e os replays usam fixtures.

### Resultados do ensaio de 18 de novembro

| Medida | Baseline | Ciclo 1 | Ciclo 2 | Ciclo 3 |
| --- | ---: | ---: | ---: | ---: |
| Briefings utilizáveis | 3/5 | 5/5 | 3/5 | 4/5 |
| Sugestões pertinentes nas primeiras quatro posições | 6/20 | 11/20 | 12/20 | 13/20 |
| Fidelidade das artes às referências, pontos do juiz | 107/120 | 107/120 | 106/120 | 78/96 observáveis |
| Pares de propostas com distinção máxima nos pixels | 11/15 | 12/15 | 10/15 | 10/12 observáveis |
| Artes prontas para o objetivo visual | 10/15 | 6/15 | 11/15 | 11/12 observáveis |

A trilha do briefing e da descoberta conservou duas mudanças do ciclo 2. O tema chegou a cinco de cinco planos a partir da oferta declarada e a descoberta voltou a ter espaço quando o histórico preenchia a lista. Os cartões dos ciclos 2 e 3 eram idênticos. A diferença de um ponto veio do julgamento da mesma lista.

Na trilha visual, foram iniciadas 20 sessões de planejamento. O contrato aceitou 19 planos e 57 imagens chegaram com recibos e arquivos conferidos. O plano recusado repetiu o contraste dos slots 1 e 3. O executor consultou a mesma sessão e concluiu os quatro casos inéditos da rodada. Os três slots do caso recusado permaneceram sem envio. Os lotes válidos levaram até 4 ms entre o primeiro e o terceiro início de envio, e o intervalo mínimo observado entre o fim de um lote e o início do próximo plano foi 15,008 s. Essas medidas são do executor local com provedor real. A apresentação progressiva no navegador tem uma validação separada com serviços simulados.

Nos dois casos reservados, a última candidata aumentou as artes prontas de 3/6 para 5/6, e as artes com falha crítica caíram de duas para zero. A fidelidade visual nos mesmos casos caiu de 44/48 para 42/48. As três candidatas visuais ficaram aquém dos critérios congelados. O planejador preservado no código é o da baseline. As matrizes por caso estão nas páginas de cada marco acima.
