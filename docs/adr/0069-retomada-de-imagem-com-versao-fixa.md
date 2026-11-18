# ADR 0069 — Retomada de imagem com versão fixa

**Implementado localmente em 18/11/2026.** A consulta de uma proposta após `busy` ou `blocked` podia preparar outra versão para a mesma chamada do agente. O PostgreSQL recusava a nova reserva e também a reconciliação enviada com a versão divergente.

## Identidade e retomada

`consent_required` inclui `imageActionId`, um identificador opaco e estável para a chamada específica do agente. Ele acompanha a prova de ação, que continua assinada, efêmera e exigida pelo servidor. O navegador usa o identificador para preservar a versão preparada, a versão de origem e o digest da entrada por conta, projeto e pedido. Com uma proposta já preparada, uma nova consulta conserva o destino e exige a mesma entrada. Em resultado incerto, o marcador impede outro envio. Uma proposta de cliente antigo sem um destino confiável precisa ser verificada antes de seguir.

## Verificação de não despacho

A migration `20261118000040_reconcile_reserved_image_tool_call.sql` permite que `/api/agent/image/reconcile` encontre a reserva da chamada assinada mesmo que a requisição informe outra versão existente do mesmo post. A RPC confere a conta, o projeto, o post, a tentativa e os IDs originais do fornecedor. Sob a mesma trava de conta do registro de execução, só confirma `fenced` quando a reserva fica impedida de executar e não existe execução de imagem. Uma execução registrada ou uma reserva incerta sem prova continua sem confirmação.

`/api/agent/image/reconcile-closed` mantém a confirmação histórica de um turno concluído sem reserva. Também reconhece um turno encerrado quando todas as suas reservas foram impedidas de executar e nenhuma execução existe. Para a combinação `studio_turns.failed` e `agent_attempts.unknown`, responde com `outcome: failed_without_dispatch`. O estúdio usa essa confirmação para resolver o pedido local correspondente quando encontra o registro depois de perder a aba original. O desfecho diz respeito à imagem. O uso e o estado do turno no fornecedor continuam independentes.

Nenhuma dessas consultas autoriza nova geração. A conta continua protegida quando existe uma exploração ou execução de resultado incerto. A migration preserva todas as versões e os recibos existentes.
