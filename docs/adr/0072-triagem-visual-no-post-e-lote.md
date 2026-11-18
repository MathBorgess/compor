# 0072 — Triagem visual no post e no lote de três propostas

Estado aceito. Em 18/11/2026, Matheus solicitou o merge e deploy do PR #65 e escolheu ativar a triagem nos posts e nos lotes paralelos de três propostas.

## Decisão

Incorporar ao turno existente as orientações de R5 para identificar a característica observável de cada referência, distinguir a intenção declarada da inferida e indicar onde e como o atributo deve aparecer. O agente confere o detalhe nos pixels e o confronta com a descrição antes de concluir o prompt. A pessoa mantém a decisão sobre a direção e os fatos do post. As referências vêm da seleção autorizada. O plano inclui todos os uploads selecionados e pode omitir externas ou geradas. Na edição, a arte-base mantém seu papel próprio.

No lote, o planejador aplica o conjunto final aos três prompts e compara os pares pela estrutura e pelo contraste visível. O contrato v2 limita o tamanho dos campos, preserva a ordem dos IDs e vincula o resultado ao pedido. O servidor reserva e despacha as três imagens conforme o [ADR 0061](0061-lotes-paralelos-e-recibos-de-planejamento.md). O intervalo de 15 segundos começa depois da conclusão do lote. A análise automática da seleção continua com a finalidade de entender as referências.

Na continuação da conversa, a reutilização da sessão exige o mesmo manifesto assinado e o mesmo conjunto de instruções. Quando a seleção muda, ou quando a imagem-base ou os bytes legados não têm o vínculo exigido, o agente inicia o turno numa sessão nova com o histórico textual e os anexos atuais. A tentativa conserva um único envio. A consulta de um pedido anterior continua ligada à sessão que o originou.

O estúdio usa as chaves de configuração de produção `COMPOR_REFERENCE_AUTHORITY_ENABLED`, `COMPOR_SELECTED_LOCAL_VISUALS_ENABLED` e `COMPOR_PARALLEL_EXPLORATION_ENABLED`. Esta decisão aprova a ativação pendente descrita nos ADRs [0066](0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) e [0067](0067-autoridade-de-referencias-com-cas.md). A seleção efetiva, a concordância entre abas, o consentimento, a credencial e os recibos continuam sujeitos às verificações de cada operação.

## Evidência e custo

O estudo histórico mediu 12 pares reais na última rodada. Na primeira avaliação, houve sete artes utilizáveis por braço. A referência opcional aumentou o custo estimado por arte utilizável nessa amostra. O critério de seleção continua sendo a contribuição para a direção solicitada. A publicação porta a orientação para os contratos do estúdio. Os julgamentos independentes e as leituras estruturadas do estudo permanecem na bancada. A orientação acrescenta tokens às requisições com referências e usa o turno de planejamento ou conversa já solicitado. [Comparação e custos](../evals/triagem-divergencia-2026-11-18/README.md)
