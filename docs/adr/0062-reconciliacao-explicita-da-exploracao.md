# ADR 0062 — Reconciliação explícita da exploração interrompida

**Estado:** implementação local em validação, 17/11/2026.

## Contexto

Uma resposta de imagem pode chegar depois de pausa, saída da tela, troca de projeto, fonte ou sessão. Cancelar o HTTP não prova que o fornecedor parou, e a resposta antiga pode vencer o cancelamento. A implementação anterior permitia reconciliar e apagar o marcador ao receber o POST depois da saída da tela; ela também podia avançar após uma mudança de fonte.

## Decisão

Quando o ciclo que enviou a exploração deixa de estar ativo ou seu escopo/credencial muda, a resposta tardia não modifica o progresso nem remove o marcador. A requisição externa já enviada pode terminar; isso não é apresentado como cancelamento. Ao retornar, o cliente consulta o mesmo ID no servidor. Quando o GET confirma a conclusão, preserva a origem e registra o resultado, remove o marcador e para: um novo envio depende de novo gesto da pessoa. Resultado desconhecido permanece bloqueante. Se essa confirmação fechar o lote, os 15 segundos começam na retomada visível; o tempo fora da tela não conta.

Essa regra substitui somente a reconciliação automática do POST recebido após saída no fluxo sequencial anterior; não altera a quantidade de imagens, os gates de interação, as provas nem os recibos do fornecedor. Uma resposta tardia da RPC de retomada também não desfaz uma pausa ou troca de escopo que ocorreu enquanto ela estava em voo.

## Evidência e limites

Os testes simulam cancelamento ineficaz, respostas tardias, troca de projeto/fonte e retorno com GET; nenhum chama provedor pago. O banco continua sendo a autoridade dos recibos. O navegador não garante cancelar um efeito já iniciado, e perder a resposta não autoriza repetição automática. Validação local não prova o comportamento de produção ou de outros dispositivos.
